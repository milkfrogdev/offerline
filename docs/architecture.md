# OfferLine 系统架构与安全设计

本文记录 OfferLine 的分层架构、数据模型、前后端职责边界与安全约束，面向自托管部署与后续二次开发查阅。

## 1. 整体分层

OfferLine 采用前后端同仓、单容器交付的全栈结构，生产环境由前置反向代理（Edge Nginx）统一承接流量，数据库与出站网络严格隔离：

```text
Browser (React 19 + Vite + Tiptap v3 + WebCrypto)
        │  HTTPS / Same-Origin Cookie
        ▼
Edge Nginx (TLS 终结 + 反代)
        │
        ▼
OfferLine App (Node 24 + Fastify 5, port 3002)
  ├── 静态产物托管 (dist/web)
  ├── REST API (/api/*) + 私有 ICS 订阅 (/api/calendar/:token.ics)
  ├── 邮件同步调度器 (imapflow read-only + mailparser + 规则/可选LLM引擎)
  └── 官网图标代理 (/api/brand-icon, SSRF 防护)
        │                          │
        │ internal 网络（无公网）   │ egress 网络（仅出站）
        ▼                          ▼
   MySQL 8.4 (InnoDB)         用户 IMAP 服务器 / 可选 LLM API
```

### 技术选型依据

- **前端（React 19 + TypeScript + Vite）**：全站零第三方 UI 重框架，状态聚焦在四个主视图（`概览 / 投递 / 日程 / 面经`）和一个登录门面；离线打包 `Inter` 与 `HarmonyOS Sans SC` 字体，内网部署不依赖外部 CDN。
- **后端（Fastify 5 + Zod + `mysql2`）**：`mysql2` 为纯 JS 驱动，容器镜像无需原生编译工具链；所有写接口用 `zod.strict()` 拦截多余字段。
- **双存储实现（`Store` 接口）**：生产走 `MySqlStore`（连接池 + InnoDB 外键约束），本地开发、预览或无数据库单测走 `JsonFileStore`（支持纯内存 `null` 模式或原子 rename 落盘）。

## 2. 数据库模型（MySQL 8.4，8 张 `ol_*` 表）

所有业务表以 `user_id` 做行级隔离，均声明表级 `CONSTRAINT ... FOREIGN KEY (user_id) REFERENCES ol_users(id) ON DELETE CASCADE`：

| 表名 | 用途 | 关键字段与索引 |
|---|---|---|
| `ol_users` | 账号与日历订阅令牌 | `username` 唯一索引、`password_hash`、`calendar_token` 唯一索引 |
| `ol_sessions` | 登录会话 | `token_hash`（SHA-256）、`expires_at`；单用户保留最近 10 个活跃会话 |
| `ol_auth_limits` | 接口限流计数 | `limit_key`（登录/注册/IMAP测试/手动同步）、`hits`、`expires_at` |
| `ol_records` | 投递记录与阶段时间线 | `stages`（JSON 阶段数组）、`pinned`、`last_visited_at`、`sealed`（端到端加密信封） |
| `ol_events` | 面试/笔试/测评/意向日程 | `record_id`、`kind`、`start_at`、`end_at`、`time_mode`（`scheduled`/`deadline`/`flexible`）、`status`、`source` |
| `ol_notes` | 面经与复盘 | `record_id`、`company`、`stage_name`、`feeling`、`content`（Markdown） |
| `ol_mail_accounts` | IMAP 与可选 LLM 配置 | `password_enc`、`llm_key_enc`（AES-256-GCM 密文）、`last_uid`、`lookback_days` |
| `ol_mail_processed` | 邮件去重账本 | 复合主键 `(user_id, message_hash)`，防止同一封邮件跨轮次重复扫描 |

### 平滑演进策略

- 新列均以**向后兼容的增量迁移**落盘：服务启动执行 `MySqlStore.init()` 时，先查询 `information_schema.COLUMNS` 判定列是否存在，缺失再执行 `ALTER TABLE ... ADD COLUMN ... DEFAULT ...`，并捕获 `ER_DUP_FIELDNAME` 以兼容多实例并发冷启。
- `ol_events.time_mode` 默认 `'scheduled'`，老数据零迁移成本，不破坏既有查询与排序。

## 3. 安全与隐私边界

1. **认证与会话**：密码使用 Node 原生 `crypto.scrypt` 加随机盐哈希；登录态下发 `HttpOnly` + `SameSite=Lax` Cookie（HTTPS 环境自动带 `Secure`），数据库只存会话令牌的 SHA-256 哈希。
2. **CSRF 防护**：除登录、注册及只读 GET 外，所有写请求校验 `Origin` / `Referer` 必须与 `APP_ORIGIN` 同源，非同源直接返回 `403`。
3. **服务端敏感凭据加密**：IMAP 授权码与可选个人 LLM API Key 使用 `MAIL_ENCRYPTION_KEY` 派生的 256 位密钥，以 AES-256-GCM 随机 IV 加密落库；对外返回 `MailAccountPublic` 时仅给布尔标记 `hasPassword` / `hasLlmKey`，绝不回传明文。
4. **客户端零知识保险箱**：单条投递记录支持在浏览器侧以 `PBKDF2-SHA256` + `WebCrypto AES-256-GCM` 加密薪资/私密备注为 `sealed` 信封，服务端仅透传密文。
5. **官网图标代理 SSRF 防护**：`/api/brand-icon` 仅放行 `http/https`，先做 DNS 解析并阻断回环、私网、链路本地与保留 IP 段（IPv4/IPv6），限制重定向跳数、响应体上限与超时时间。
6. **网络隔离**：`compose.yaml` 中 MySQL 只挂 `internal: true` 内网，不暴露宿主机端口；应用容器同时接入 `internal` 与 `egress` 网络，既能访问数据库，也能出站连接 IMAP 和可选模型接口。

## 4. 关键模块目录速查

| 路径 | 职责 |
|---|---|
| [shared/types.ts](../shared/types.ts) | 前后端共用领域类型、枚举常量 |
| [shared/companies.ts](../shared/companies.ts) | 60+ 主流科技企业标准名、域名、法定全称清洗与集团归属映射 |
| [shared/stages.ts](../shared/stages.ts) | 阶段模板、进度计算、终态/Offer 判定与公司分组排序 |
| [server/app.ts](../server/app.ts) | Fastify 路由、Zod 校验、CSRF、限流、认证与业务编排 |
| [server/store.ts](../server/store.ts) | `Store` 抽象接口、`MySqlStore` 与 `JsonFileStore` |
| [server/mail-parser.ts](../server/mail-parser.ts) | HTML/ICS 清洗、6 重去噪与拒信拦截、规则提取与可选 LLM 增强 |
| [server/mail-sync.ts](../server/mail-sync.ts) | 只读 IMAP 增量扫描、同公司/集团唯一流程推断、同场日程语义去重 |
| [server/ics.ts](../server/ics.ts) | RFC 5545 标准日历文件与私有 Webcal 订阅生成 |
| [server/security.ts](../server/security.ts) | scrypt、SHA-256、AES-256-GCM 加解密与外链消毒 |
| [src/components/](../src/components) | 概览、投递、日程、面经（Tiptap Markdown 双模）与 3D 登录页 |
