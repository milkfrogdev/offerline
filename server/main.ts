import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createStore } from "./store.js";
import { buildApp } from "./app.js";
import { startMailScheduler } from "./mail-sync.js";
import { deriveMasterKey } from "./security.js";

/**
 * 跨平台读取当前目录 .env 文件（不依赖外部包，也不覆盖外部已显式传入的环境变量），
 * 确保 Windows / macOS / Linux 下无 Docker 直接执行 `npm start` 时配置稳定生效。
 */
function loadLocalEnvFile(envPath = resolve(".env")) {
  if (!existsSync(envPath)) return;
  try {
    const raw = readFileSync(envPath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx <= 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || key in process.env) continue;
      let val = trimmed.slice(eqIdx + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  } catch {
    // ignore unreadable .env
  }
}

loadLocalEnvFile();

const store = await createStore();
const mailSecret =
  process.env.MAIL_ENCRYPTION_KEY ||
  process.env.SESSION_SECRET ||
  "offerline-local-dev-mail-key";

const port = Number(process.env.APP_PORT || 3002);
const defaultOrigin = `http://127.0.0.1:${port}`;

const app = await buildApp({
  store,
  origin: process.env.APP_ORIGIN || defaultOrigin,
  production: process.env.NODE_ENV === "production",
  allowHttp: process.env.ALLOW_HTTP === "true",
  registrationOpen: process.env.REGISTRATION_OPEN !== "false",
  mailSecret,
});

const stopScheduler = startMailScheduler(store, deriveMasterKey(mailSecret));

await app.listen({ host: "0.0.0.0", port });
console.info(`OfferLine 服务已启动 :${port} (${process.env.APP_ORIGIN || defaultOrigin})`);

async function shutdown() {
  stopScheduler();
  await app.close();
  await store.close();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
