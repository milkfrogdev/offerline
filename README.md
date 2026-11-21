# OfferLine

求职投递与面试进程管理工作台（支持流水线总表、阶段看板、自定义流程、面试复盘笔记与浏览器端 AES-256-GCM 加密备份）。

## 技术栈

- **前端**：React 19 + TypeScript + Vite
- **后端**：Node 24 + Fastify 5 + Zod + `scrypt` HttpOnly Cookie 会话
- **存储**：生产环境默认 **MySQL 8.4**（`mysql2` 纯 JS 驱动，零 C++ 原生编译）；未配置 `DATABASE_URL` 时自动退回单文件原子 JSON 存储（适合本机开发或单容器极简自托管）
- **端到端加密**：HTTPS 下支持浏览器 `WebCrypto`（PBKDF2-SHA256 + AES-256-GCM）导出加密备份与加密存储私密薪资/笔记字段，口令不离开浏览器

## 自托管部署（推荐）

求职投递记录属于高度敏感的个人隐私数据，建议部署到你自己的云服务器或本机。

### 1. Docker Compose + MySQL（推荐）

```bash
git clone https://github.com/milkfrogdev/offerline.git
cd offerline

cat > .env << 'EOF'
MYSQL_PASSWORD=<随机强密码>
MYSQL_ROOT_PASSWORD=<随机强密码>
APP_ORIGIN=https://offer.example.com
ALLOW_HTTP=false
REGISTRATION_OPEN=false
EOF

docker compose up -d --build
docker compose exec app node dist/server/cli.js bootstrap myname
```

将你的 Nginx / Caddy 反向代理指向容器内 `3002` 端口并开启 HTTPS 即可。

### 2. 本机直接运行

```bash
npm ci
npm run build
APP_ORIGIN=http://127.0.0.1:3002 ALLOW_HTTP=true npm start
```

未传 `DATABASE_URL` 时数据自动保存在 `./data/offerline.json`。

## 从旧版数据迁移

- 页面内「数据与安全 → 选择文件导入」直接兼容数组格式 JSON 导出。
- 如已有旧导出文件，可通过 CLI 导入：

```bash
node dist/server/cli.js import-json ./export.json <username>
```

## 测试

```bash
npm run check
npm test
npm run build
```

## License

MIT
