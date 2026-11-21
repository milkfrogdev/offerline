# OfferLine

面向个人求职周期的开源进度、邮箱日程与面经工作台。推荐部署在自己的云服务器上，数据完全归自己掌控。

## 核心能力

- **全链路投递追踪**：按公司聚合多个岗位，单页平铺每个岗位的完整流程分段进度，就地点击切换阶段状态；支持自定义阶段、常用流程模板、公司置顶、官网访问新鲜度追踪与已挂自动沉底。
- **主流科技大厂官方图标**：内置 50+ 家海内外科技公司官方矢量图标，其余公司自动生成极简印刷单字标。
- **邮箱监听与自动日程**：支持 QQ、163、126、Gmail、Outlook、腾讯企业邮及任意 IMAP 邮箱接入，后台按间隔增量扫描求职邮件，提取公司、岗位、轮次、面试/笔试时间与会议链接并生成待确认日程；未接入 IMAP 时也可直接粘贴邮件正文即时解析。
- **日历订阅与一键同步**：支持单条日程导出 `.ics` 及私有高熵令牌 Webcal 订阅（直连 Apple 日历 / Google 日历 / Outlook 并提前 30 分钟提醒），可一键把邮件确认的面试推进同步至投递时间线。
- **面经记录**：按公司与面试轮次随时记录题目与复盘，支持全文检索并关联对应投递岗位。
- **隐私与数据自主**：邮箱授权码与可选模型 Key 在服务端采用 AES-256-GCM 密文存储；支持标准 JSON 及浏览器端 WebCrypto AES-256-GCM 加密备份导出与导入。

## 技术栈

- 前端：React 19 · TypeScript · Vite
- 后端：Node.js 24 · Fastify 5 · MySQL 8.4（`mysql2` 纯 JS 驱动，零 C++ 编译依赖）· `imapflow` · `mailparser`
- 本地开发或无数据库测试环境自动回落至原子落盘 JSON 存储

## 快速启动

### 方式一：Docker Compose 私有部署（推荐）

```bash
git clone https://github.com/milkfrogdev/offerline.git
cd offerline

cat > .env << EOF
APP_ORIGIN=https://your-domain.example
ALLOW_HTTP=false
REGISTRATION_OPEN=true
MYSQL_PASSWORD=$(openssl rand -hex 20)
MYSQL_ROOT_PASSWORD=$(openssl rand -hex 20)
MAIL_ENCRYPTION_KEY=$(openssl rand -hex 32)
EOF

docker compose up -d --build
```

容器内应用监听 `3002` 端口，前置 Nginx 反向代理并开启 HTTPS 即可。数据库仅挂在 `internal` 内网，应用容器通过独立 `egress` 网络出站连接用户配置的 IMAP 邮箱服务器。

### 方式二：本地运行（Node.js ≥ 22）

```bash
npm install
npm run build
ALLOW_HTTP=true APP_ORIGIN=http://127.0.0.1:3002 npm start
```

访问 `http://127.0.0.1:3002`，注册账号即可开始使用。

## 测试与检查

```bash
npm run check
npm test
npm run build
```

## License

MIT
