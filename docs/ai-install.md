# OfferLine AI 自动安装与本地部署指南（AI Agent Runbook）

> 本文档面向 **Claude Code、Codex、WorkBuddy、豆包、Cursor** 等可操作本地终端的 AI 编程助手编写，也可由用户直接让 AI 照着自动执行。
> 本质目标：**默认走无 Docker、零数据库的轻量本机安装**，只在用户明确要求容器化或公网部署时才使用 Docker Compose。

---

## 0. 执行原则（AI 助手必读）

1. **优先选择「方案 A：本机免 Docker 轻量安装」**：绝大多数个人求职用户只想在自己笔记本（Windows / macOS / Linux）跑起来。**除非用户明确说要部署到服务器或使用 Docker，否则不要强制让用户安装 Docker Desktop 或 MySQL**。
2. **先探测环境，再缺啥装啥**：先检查操作系统、`git`、`node -v`（要求 **`>= 22.0.0`**）与端口 `3002` 是否空闲；遇到中国大陆网络拉依赖慢时，优先切淘宝镜像（`--registry=https://registry.npmmirror.com`）。
3. **跨平台写法严格区分**：Windows 统一使用 **PowerShell** 语法写 `.env` 与起服务；macOS / Linux 使用 **bash / zsh**。严禁把 `FOO=bar npm start` 这类 POSIX 行内环境变量直接贴到 Windows PowerShell 里跑。
4. **安全生成密钥**：自动生成 32 字节随机十六进制密钥写入 `.env` 的 `MAIL_ENCRYPTION_KEY`，不要使用占位符 `change-me`。
5. **实测通过再交付**：启动后必须请求 `http://127.0.0.1:3002/api/health`（或自定义端口）确认返回 `{"ok":true}` 且首页 HTTP 状态为 `200`，再向用户汇报打开地址和数据文件位置。

---

## 1. 环境前置检查

请先在工作目录执行检查命令：

- **macOS / Linux**：
  ```bash
  uname -a && git --version && node -v && npm -v
  ```
- **Windows PowerShell**：
  ```powershell
  git --version; node -v; npm -v
  ```

### 若缺少依赖怎么补齐

1. **没有 Git / Node.js，或 Node 版本低于 22**：
   - **Windows**：用 `winget` 安装并提示用户重启终端使 `PATH` 生效（若已有新版跳过）：
     ```powershell
     winget install --id Git.Git -e --accept-source-agreements --accept-package-agreements
     winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
     ```
   - **macOS**：优先用 Homebrew（`brew install git node`），或引导用户从官网装 Node 22+ LTS。
   - **Linux (Ubuntu/Debian)**：通过 NodeSource / `nvm` 安装 Node 22+ 与 `git`。

---

## 2. 方案 A（推荐）：本机免 Docker 轻量直装（Node.js ≥ 22，无需数据库）

不填 `DATABASE_URL` 时，OfferLine 服务端会自动将全部数据原子写入本地 `./data/offerline.json`（含账号、投递时间线、日程、面经和加密后的邮箱/模型配置），开机即用，零容器开销。

### 步骤 1：克隆代码并安装依赖

选择用户常用的工程目录（如桌面或个人代码目录，勿装进系统临时目录）后执行：

```bash
git clone https://github.com/milkfrogdev/offerline.git
cd offerline
npm install --registry=https://registry.npmmirror.com
```
*(若不在中国大陆网络环境，可省略 `--registry` 参数；若已存在 `offerline` 目录先询问用户是更新 `git pull` 还是保留数据直接重启。)*

### 步骤 2：检查端口并生成本地 `.env`

默认端口为 `3002`。若 `3002` 已被占用，将下方 `3002` 替换为一个空闲端口（如 `3003`）即可；注意服务端代码 `server/main.ts` 会自动加载当前目录下的 `.env` 文件，且回环访问时 `127.0.0.1` 与 `localhost` 自动互通。

- **macOS / Linux**：
  ```bash
  node -e 'const fs=require("fs"),c=require("crypto");const p=process.env.PORT||3002;const k=c.randomBytes(32).toString("hex");if(!fs.existsSync(".env"))fs.writeFileSync(".env",`APP_PORT=${p}\nAPP_ORIGIN=http://127.0.0.1:${p}\nALLOW_HTTP=true\nDATA_DIR=./data\nREGISTRATION_OPEN=true\nMAIL_ENCRYPTION_KEY=${k}\nALLOW_LOCAL_LLM=false\n`,"utf8");'
  ```
- **Windows PowerShell**：
  ```powershell
  node -e "const fs=require('fs'),c=require('crypto');const k=c.randomBytes(32).toString('hex');if(!fs.existsSync('.env'))fs.writeFileSync('.env','APP_PORT=3002\nAPP_ORIGIN=http://127.0.0.1:3002\nALLOW_HTTP=true\nDATA_DIR=./data\nREGISTRATION_OPEN=true\nMAIL_ENCRYPTION_KEY='+k+'\nALLOW_LOCAL_LLM=false\n','utf8');"
  ```

> **提示**：如用户后续需要连接本机 Ollama / vLLM 等本地大模型，把 `.env` 中的 `ALLOW_LOCAL_LLM` 改为 `true` 并重启服务即可。

### 步骤 3：构建前后端产物并启动服务

```bash
npm run build
```

构建完成后启动服务：

- **方式 3.1：直接前台运行（最透明，适合当前会话立刻验证）**
  ```bash
  npm start
  ```
- **方式 3.2：长期后台常驻（关掉命令行也不掉线，按操作系统二选一）**
  - **macOS / Linux（优先用 `pm2` 或 `nohup`）**：
    ```bash
    nohup npm start > offerline.log 2>&1 &
    ```
  - **Windows**：可安装并交由 `pm2` 托管，或为用户在当前项目目录生成一个双击即可启动且后台无窗口的脚本 / 打开浏览器快捷方式，并明确告知停止方法。

### 步骤 4：健康检查验收

请求以下接口验证服务已真正就绪：

- **macOS / Linux**：
  ```bash
  curl -sS http://127.0.0.1:3002/api/health
  ```
- **Windows PowerShell**：
  ```powershell
  Invoke-RestMethod http://127.0.0.1:3002/api/health
  ```

预期返回：`{"ok":true}`。再检查首页返回 HTTP `200` 后即可收工。

---

## 3. 方案 B：Docker Compose + MySQL 8.4 部署（适合云服务器 / 需要数据库容器）

仅当用户本机已安装 Docker，或要求部署到 Linux 服务器长期对外服务时执行：

```bash
git clone https://github.com/milkfrogdev/offerline.git
cd offerline
```

生成随机密码写入 `.env`：

```bash
cat > .env << EOF
APP_PORT=3002
APP_ORIGIN=http://127.0.0.1:3002
ALLOW_HTTP=true
REGISTRATION_OPEN=true
MYSQL_PASSWORD=$(openssl rand -hex 20)
MYSQL_ROOT_PASSWORD=$(openssl rand -hex 20)
MAIL_ENCRYPTION_KEY=$(openssl rand -hex 32)
EOF
```
*(若挂载了 HTTPS 域名，请把 `APP_ORIGIN` 改为 `https://你的域名` 且将 `ALLOW_HTTP` 改为 `false`。)*

拉起服务并等待健康检查通过：

```bash
docker compose up -d --build --wait
```

---

## 4. 升级与常见故障排查（AI 自愈参考）

| 现象 | 原因 | 处理方式 |
|---|---|---|
| `ERR_MODULE_NOT_FOUND` 或缺少页面 | 尚未执行构建 | 先运行 `npm run build` 再 `npm start` |
| 端口 `3002` 被占用（`EADDRINUSE`） | 本机已有服务占用了 3002 | 把 `.env` 中的 `APP_PORT` 和 `APP_ORIGIN` 一起改为空闲端口（如 `3003`） |
| 打开 `http://localhost:3002` 提示来源校验失败 | `.env` 配的是固定非回环域名 | 确保访问地址与 `.env` 的 `APP_ORIGIN` 一致（本机下 `127.0.0.1` 与 `localhost` 已自动互通） |
| 需要更新版本 | 仓库已有新提交 | 执行 `git pull && npm install && npm run build`，然后重启进程；`./data/offerline.json` 与 `.env` 不在 git 追踪内，不会丢数据 |

---

## 5. 安装完成后给用户的标准回复模板

验证健康检查通过后，请用通俗直观的话告诉用户：
1. 服务已启动，在浏览器打开 **`http://127.0.0.1:3002`**（或 **`http://localhost:3002`**）注册账号即可开始使用；
2. 当前采用免数据库轻量模式，全部投递记录、日程与面经都保存在项目目录的 **`./data/offerline.json`**，重装或升级前复制一份就能备份；
3. 如开启个人注册完后不想被局域网其他人注册，可以把 `.env` 里的 `REGISTRATION_OPEN` 改成 `false` 再重启。

---

## English Quick Summary (For English AI Agents)

If the user prefers a lightweight local setup **without Docker**:
1. Ensure **Git** and **Node.js ≥ 22** are installed.
2. `git clone https://github.com/milkfrogdev/offerline.git && cd offerline`
3. Install deps (`npm install`) and run `npm run build`.
4. Create `.env` in project root with `APP_PORT=3002`, `APP_ORIGIN=http://127.0.0.1:3002`, `ALLOW_HTTP=true`, `DATA_DIR=./data`, `REGISTRATION_OPEN=true`, and a random 32-byte hex `MAIL_ENCRYPTION_KEY`. Omit `DATABASE_URL` so OfferLine automatically uses atomic JSON file storage (`./data/offerline.json`).
5. Start with `npm start` (reads `.env` natively on Windows/macOS/Linux) and verify `GET http://127.0.0.1:3002/api/health` returns `{"ok":true}`.
6. Only use `docker compose up -d --build` if the user explicitly asks for Docker + MySQL 8.4.
