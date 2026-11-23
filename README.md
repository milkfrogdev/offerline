<div align="center">
  <img src="docs/assets/logo.svg" alt="OfferLine" width="56" height="56" />
  <h1>OfferLine</h1>
  <p><strong>从投递到 Offer，都在一条时间线上。</strong></p>
  <p>秋招、春招或跳槽时投了几十家公司，表格容易越改越乱，面试邀请和会议链接又老埋在收件箱里。<br />OfferLine 把投递时间线、只读邮箱监听抓日程和面试复盘放在一个自己部署的网页里。</p>

  <p>
    <strong>简体中文</strong>
    &nbsp;|&nbsp;
    <a href="README.en.md">English</a>
  </p>

  <p>
    <img src="https://img.shields.io/badge/React-19-149eca?style=flat-square&logo=react&logoColor=white" alt="React 19" />
    <img src="https://img.shields.io/badge/Fastify-5-0f172a?style=flat-square&logo=fastify&logoColor=white" alt="Fastify 5" />
    <img src="https://img.shields.io/badge/MySQL-8.4-2563eb?style=flat-square&logo=mysql&logoColor=white" alt="MySQL 8.4" />
    <img src="https://img.shields.io/badge/Docker-Compose-0ea5e9?style=flat-square&logo=docker&logoColor=white" alt="Docker Compose" />
    <img src="https://img.shields.io/badge/License-MIT-10b981?style=flat-square&logo=opensourceinitiative&logoColor=white" alt="MIT License" />
  </p>

  <p>
    <a href="#1-一条时间线看清所有投递">投递时间线</a>
    &nbsp;&nbsp;/&nbsp;&nbsp;
    <a href="#2-只读邮箱监听与日程解析可选">邮箱监听与解析</a>
    &nbsp;&nbsp;/&nbsp;&nbsp;
    <a href="#3-首页总览与-markdown-面经">首页与面经</a>
    &nbsp;&nbsp;/&nbsp;&nbsp;
    <a href="#4-隐私与数据安全">数据安全</a>
    &nbsp;&nbsp;/&nbsp;&nbsp;
    <a href="#5-快速部署">快速部署</a>
    &nbsp;&nbsp;/&nbsp;&nbsp;
    <a href="#技术栈与设计文档">设计文档</a>
  </p>
</div>

<br />

<div align="center">
  <img src="docs/assets/offerline-demo.gif" alt="OfferLine 功能演示" width="100%" />
</div>

---

## 1. 一条时间线看清所有投递

不用每次改进度都点进详情弹窗。打开「投递」页，每家公司走到哪一轮直接平铺在眼前：

<img src="docs/assets/preview-pipeline.png" alt="投递时间线" width="100%" />

<br />

- **同公司多岗位收在一张卡里**：同一家大厂投了两个部门，点 `+ 加岗位` 就能在同一张卡片下各走各的时间线，不会散成满屏重复记录。
- **节点就地一点就更新**：从投递、笔试、一面到正式 Offer 排成一行，点一下节点就能切状态（通过 / 当前 / 跳过 / 未通过 / 拒绝）。
- **不同大厂走自己的流程**：内置实习、校招、社招三套模板（校招和社招默认带「谈薪」），像华为机考、综合测评这类特殊环节可以直接增删或拖拽重排。
- **直达官网进度，顺手记住上次刷过的时间**：点「官网进度」直接跳对应公司的招聘查询页，同时按距上次访问的天数分色提醒（2 天内绿、3–5 天琥珀、6–10 天橙、超过 10 天红），哪家太久没看一眼就能挑出来。
- **置顶与自动沉底**：最想去的公司点亮星标固定在最前面；挂掉或拒掉的流程自动沉到底部，不挡视线。
- **内置 62 家常见科技公司原版图标**：输入公司名自动归并别名并联想图标；没收录的公司填上官网地址后，服务端会经 SSRF 检查代抓图标，抓不到则显示单字标。

---

## 2. 只读邮箱监听与日程解析（可选）

求职季收件箱里天天混着验证码、账单、宣讲直播、面试满意度调研和感谢信。如果不想手动把每封面试邮件抄进日历，可以打开邮箱监听：

<img src="docs/assets/preview-schedule.png" alt="只读邮箱监听与日程工作台" width="100%" />

<br />

### 会不会动我的邮箱状态？
不会。底层通过 `imapflow` 以只读模式（IMAP `EXAMINE`）打开收件箱，**绝不把未读邮件标成已读**，也不删除或移动任何邮件。支持 QQ 邮箱、163、126、Gmail、Outlook、腾讯企业邮以及任意自定义 IMAP。

### 广告、校招直播和感谢信会不会塞进日程？
不会。邮件拉下来后会先清掉 `<head>/<style>/<script>` 防止样式代码截断正文，展开 `<a href>` 保留藏在按钮里的会议或笔试链接，同时读取 `.ics` 日历附件。接着先过本地零 Token 规则过滤：
- 自动挡掉验证码、账单、专家平台、面试体验调研、校招直播宣传和纯投递回执；
- **收到拒信或流程终止通知直接跳过，绝不往日程表里塞**；
- 同一场笔试或面试发来多封提醒邮件时，按语义自动合并补全字段，不重复建卡。

### 会不会擅自改坏我记好的投递进度？
不会。提取出的面试和笔试先落进「待确认日程」，系统只读推断它对应哪条投递记录，**绝不自动改写你的时间线，也不偷偷新建投递**。你核对一眼点确认，才会排进正式议程；点「编辑」还能对照原邮件正文顺手改轮次、时间或绑定岗位。

### 三种时间形态与跨端日历订阅
- 区分 **具体时刻**（面试）、**截止日期**（笔试/录用意向确认）和 **时间自定**（随到随考测评）三种日程。
- 生成个人专属的 `.ics` 订阅链接，安卓日历、iOS、飞书和 Outlook 都能直接订阅（自动跳过时间自定项，截止项转为全天提醒）。

### 本地规则 + 可选大模型增强
- 默认纯本地规则就能跑通完整解析，零费用、不依赖外部 API。
- 想进一步提高复杂邮件的提取准确度，可以在独立的「大模型增强」页签里填自己的 Key（内置 DeepSeek、通义千问、智谱 GLM、Kimi、OpenAI 和自定义 OpenAI 兼容接口 6 项预设，支持自动补全接口路径和实时测速）。
- **不连 IMAP 也能用**：不想配邮箱授权码时，直接把收到的邮件正文复制粘贴进去，同样可以用本地规则或个人大模型一键解析建日程。

---

## 3. 首页总览与 Markdown 面经

### 首页（`概览`）
打开先看今天最紧要的事：下一场面试实时倒计时和一键入会入口（腾讯会议 / 飞书 / Zoom / 牛客 / 赛码），开面前给「看往轮面经」，面完自动切「面后写复盘」；下面紧跟待确认邮箱通知，右侧是点击可筛选的投递统计和近 7 天日程带。

<img src="docs/assets/preview-home.png" alt="OfferLine 首页概览" width="100%" />

<br />

### 面经与登录页
<table>
  <tr>
    <td width="50%">
      <strong>按公司和轮次归档的 Markdown 面经</strong><br />
      <sub>所见即所得写复盘，行首敲 <code>/</code> 支持中英文和拼音首字母插代码块、待办或面试题模板（如 <code>/dm</code>、<code>/db</code>，打 <code>Java/Go</code> 和网址不误触发）；随时一键切 <code>MD 源码</code> 导出原文，不锁数据。</sub>
      <br /><br />
      <img src="docs/assets/preview-notes.png" alt="Markdown 面经编辑器" width="100%" />
    </td>
    <td width="50%">
      <strong>浅色 / 深色双主题与独立登录页</strong><br />
      <sub>60fps Canvas 动态背景与大厂图标星轨，支持浅色和深色两套主题切换；个人自托管注册完自己的账号后，把 <code>REGISTRATION_OPEN</code> 设为 <code>false</code> 即可关掉公开注册。</sub>
      <br /><br />
      <img src="docs/assets/preview-auth.png" alt="OfferLine 登录页" width="100%" />
    </td>
  </tr>
</table>

---

## 4. 隐私与数据安全

- **账号密码与会话**：`crypto.scrypt` 加随机盐哈希，`HttpOnly` + `SameSite=Lax` Cookie 会话，写操作强制校验同源 `Origin` 并做限流。
- **凭据密文落库**：邮箱 IMAP 授权码和个人大模型 API Key 全部经服务端 `AES-256-GCM` 加密存储，接口不回传明文。
- **浏览器端零知识加密**：单条投递支持在浏览器内用 `WebCrypto (PBKDF2-SHA256 + AES-256-GCM)` 加密薪资等敏感备注，服务器只存密文。
- **网络与出站防护**：Docker 部署下 MySQL 锁在 `internal` 内网不暴露宿主机端口；抓图标和调大模型出站均拦截私网 IP 和云元数据地址（如需连本机 Ollama，显式设置 `ALLOW_LOCAL_LLM=true` 即可放行）。

---

## 5. 快速部署

### 方式一：Docker Compose 自托管（推荐）

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

服务监听容器内 `3002` 端口，前置 Nginx 或 Caddy 反代并配好 HTTPS 即可访问。

### 方式二：本机直接体验（Node.js ≥ 22，不用装数据库）

```bash
npm install
npm run build
ALLOW_HTTP=true APP_ORIGIN=http://127.0.0.1:3002 npm start
```

不填 `MYSQL_HOST` 时会自动回落到本地 JSON 文件存储，浏览器打开 `http://127.0.0.1:3002` 注册就能用。

### 环境变量

| 变量名 | 默认值 | 说明 |
|---|---|---|
| `APP_PORT` | `3002` | 服务监听端口 |
| `APP_ORIGIN` | `http://127.0.0.1:3002` | 对外访问地址，用于同源校验和 `.ics` 日历订阅链接 |
| `ALLOW_HTTP` | `false` | 本机或纯 HTTP 局域网访问时设为 `true` |
| `REGISTRATION_OPEN` | `true` | 自己注册完账号后改为 `false` 即可禁止他人注册 |
| `MAIL_ENCRYPTION_KEY` | — | 加密邮箱授权码和模型 Key 的 32 字节随机密钥 |
| `ALLOW_LOCAL_LLM` | `false` | 需要连接本机或内网 Ollama / vLLM 时设为 `true` |
| `MYSQL_HOST` / `MYSQL_DATABASE` / `MYSQL_USER` / `MYSQL_PASSWORD` | — | MySQL 8.4 连接配置（留空则走本地 JSON 存储） |

---

## 技术栈与设计文档

- **前端**：React 19 / TypeScript / Vite / Tiptap v3 / `@dnd-kit`（离线内置 `Inter` + `HarmonyOS Sans SC`）
- **后端**：Node.js 24 / Fastify 5 / Zod / MySQL 8.4（`mysql2`）/ `imapflow` / `mailparser`

更细的实现取舍与表结构见仓库文档：

- [系统架构与安全设计（docs/architecture.md）](docs/architecture.md)
- [求职邮件解析与日程同步设计（docs/mail-parsing-design.md）](docs/mail-parsing-design.md)
- [AI 检索摘要索引（llms.txt）](llms.txt)

---

## 和表格、Notion 或在线求职网站的区别

| 对比项 | Excel / 飞书表格 | Notion 模板 | 在线求职追踪 SaaS | OfferLine |
|---|---|---|---|---|
| 同公司多岗位与定制流程 | 手工加行，容易乱 | 靠子表拼装，改状态繁琐 | 常见为固定看板列 | 一张公司卡下并行多条时间线，节点就地点击更新、支持自定义流程 |
| 邮箱自动提取面试日程 | 无 | 需接第三方自动化 | 少数付费支持 | 内置只读 IMAP（`EXAMINE` 不改未读），本地规则直接过滤广告和拒信 |
| 手机与飞书日历同步 | 手动抄 | 手动同步 | 部分支持 | 原生 `.ics` 私人订阅，支持安卓日历 / iOS / 飞书 / Outlook |
| 面试复盘与数据导出 | 表格不好写长文和代码 | 依赖云端平台 | 多为纯备注框 | 标准 Markdown + `/` 斜杠命令插代码块，可切纯源码随时带走 |
| 隐私与成本 | 本地或云文档 | 存第三方云端 | 存他人服务器、常有限额 | MIT 开源免费自托管，凭据加密落库，支持浏览器端零知识加密 |

## 常见问题

**Q：支持哪些求职场景和邮箱？**
秋招、春招、实习和社招都能用（内置对应流程模板，也可自由增删阶段）。邮箱监听支持 QQ 邮箱、163、126、Gmail、Outlook、腾讯企业邮和任意支持 IMAP 的邮箱；不配邮箱授权码时，也能直接粘贴邮件正文解析。

**Q：只读邮箱监听真的不会把未读邮件标成已读吗？**
不会。程序使用 IMAP `EXAMINE` 只读打开收件箱，协议层面禁止修改已读状态，也不会删除或移动任何邮件。

**Q：必须花钱接大模型 API 才能解析邮件吗？**
不需要。内置的本地规则层（含 `.ics` 附件解析和 6 类噪声过滤）默认就能免费跑通；只有在遇到极不规范的邮件正文时，才需要按需在独立页签接入自己的大模型 Key（支持 DeepSeek、通义千问、智谱、Kimi、OpenAI 或本地 Ollama）。

**Q：没有服务器，能在自己电脑上直接用吗？**
可以。装好 Node.js 22+ 后运行 `npm install && npm run build && npm start` 就能启动，不配 MySQL 时自动把数据存在本地 JSON 文件里。

## 开发与测试

```bash
npm run check   # 前后端 TypeScript 类型检查
npm test        # Vitest 单元测试与 Fastify 接口测试
npm run build   # 构建 dist/web 与 dist/server
```

## License

[MIT](LICENSE)
