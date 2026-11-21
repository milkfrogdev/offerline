import { createStore } from "./store.js";
import { buildApp } from "./app.js";

const store = await createStore();

const app = await buildApp({
  store,
  origin: process.env.APP_ORIGIN || "http://127.0.0.1:3002",
  production: process.env.NODE_ENV === "production",
  allowHttp: process.env.ALLOW_HTTP === "true",
  registrationOpen: process.env.REGISTRATION_OPEN !== "false",
});

const port = Number(process.env.APP_PORT || 3002);
await app.listen({ host: "0.0.0.0", port });
console.info(`OfferLine 服务已启动 :${port}`);

async function shutdown() {
  await app.close();
  await store.close();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
