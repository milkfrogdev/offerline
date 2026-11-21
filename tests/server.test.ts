import { describe, expect, it } from "vitest";
import { buildApp } from "../server/app";
import { JsonFileStore } from "../server/store";

const ORIGIN = "http://127.0.0.1:3002";

async function createTestApp() {
  const store = new JsonFileStore(null);
  const app = await buildApp({
    store,
    origin: ORIGIN,
    production: true,
    allowHttp: true,
  });
  return { app, store };
}

function extractCookie(setCookie: string | string[] | undefined): string {
  const first = Array.isArray(setCookie) ? setCookie[0] : setCookie || "";
  return first.split(";")[0];
}

describe("OfferLine 服务端安全与业务集成测试", () => {
  it("拒绝跨源写请求并强制密码强度与 HttpOnly Cookie 会话", async () => {
    const { app, store } = await createTestApp();
    try {
      const badOrigin = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: { origin: "https://evil.example", "content-type": "application/json" },
        payload: { username: "alice", password: "alice-password-123" },
      });
      expect(badOrigin.statusCode).toBe(403);

      const weakPass = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: { origin: ORIGIN, "content-type": "application/json" },
        payload: { username: "alice", password: "short" },
      });
      expect(weakPass.statusCode).toBe(400);

      const reg = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: { origin: ORIGIN, "content-type": "application/json" },
        payload: { username: "alice", password: "alice-password-123" },
      });
      expect(reg.statusCode).toBe(201);
      const setCookie = String(reg.headers["set-cookie"]);
      expect(setCookie).toContain("HttpOnly");
      expect(setCookie).toContain("SameSite=Lax");
      const cookie = extractCookie(reg.headers["set-cookie"]);

      const session = await app.inject({
        method: "GET",
        url: "/api/session",
        headers: { cookie },
      });
      expect(session.json().user.username).toBe("alice");
    } finally {
      await app.close();
      await store.close();
    }
  });

  it("支持完整 CRUD、阶段流转、公司置顶、访问追踪、加密信封与老版 JSON 导入", async () => {
    const { app, store } = await createTestApp();
    try {
      const regA = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: { origin: ORIGIN, "content-type": "application/json" },
        payload: { username: "user_a", password: "strong-password-a" },
      });
      const cookieA = extractCookie(regA.headers["set-cookie"]);

      const regB = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: { origin: ORIGIN, "content-type": "application/json" },
        payload: { username: "user_b", password: "strong-password-b" },
      });
      const cookieB = extractCookie(regB.headers["set-cookie"]);

      // 新增记录（带扩展字段与客户端加密信封）
      const created = await app.inject({
        method: "POST",
        url: "/api/records",
        headers: { origin: ORIGIN, cookie: cookieA, "content-type": "application/json" },
        payload: {
          company: "星海科技",
          position: "基础设施工程师",
          city: "上海",
          salary: "",
          source: "内推",
          priority: "high",
          nextFollowUpAt: "2026-12-01",
          url: "https://jobs.example.com/123",
          sealed: {
            v: 1,
            alg: "AES-256-GCM",
            kdf: "PBKDF2-SHA256",
            iterations: 310000,
            salt: "c2FsdHNhbHQxMjM0NTY",
            iv: "aXZpdl8xMjM0NTY",
            ct: "Y2lwaGVydGV4dF9kYXRh",
          },
        },
      });
      expect(created.statusCode).toBe(201);
      const record = created.json();
      expect(record.city).toBe("上海");
      expect(record.sealed.alg).toBe("AES-256-GCM");

      // 用户 B 隔离校验：无法读取或操作用户 A 的记录
      const listB = await app.inject({
        method: "GET",
        url: "/api/records",
        headers: { cookie: cookieB },
      });
      expect(listB.json().items).toHaveLength(0);

      const hackStage = await app.inject({
        method: "PATCH",
        url: `/api/records/${record.id}/stage`,
        headers: { origin: ORIGIN, cookie: cookieB, "content-type": "application/json" },
        payload: { stageIndex: 1, status: "pass" },
      });
      expect(hackStage.statusCode).toBe(404);

      // 阶段推进
      const stepRes = await app.inject({
        method: "PATCH",
        url: `/api/records/${record.id}/stage`,
        headers: { origin: ORIGIN, cookie: cookieA, "content-type": "application/json" },
        payload: { stageIndex: 1, status: "pass" },
      });
      expect(stepRes.statusCode).toBe(200);
      expect(stepRes.json().stages[1].status).toBe("pass");
      expect(stepRes.json().stages[2].status).toBe("current");

      // 公司置顶与访问
      const pinRes = await app.inject({
        method: "PUT",
        url: "/api/records/company-pin",
        headers: { origin: ORIGIN, cookie: cookieA, "content-type": "application/json" },
        payload: { company: "星海科技", pinned: true },
      });
      expect(pinRes.statusCode).toBe(200);

      const visitRes = await app.inject({
        method: "POST",
        url: "/api/records/company-visit",
        headers: { origin: ORIGIN, cookie: cookieA, "content-type": "application/json" },
        payload: { company: "星海科技" },
      });
      expect(visitRes.statusCode).toBe(200);

      // 老版缺少 stage.type 与 id 的 JSON 兼容导入
      const importRes = await app.inject({
        method: "POST",
        url: "/api/records/import",
        headers: { origin: ORIGIN, cookie: cookieA, "content-type": "application/json" },
        payload: {
          mode: "merge",
          data: [
            {
              id: "legacy-1",
              company: "云雀智造",
              position: "后端开发",
              stages: [
                { name: "投递", status: "pass" },
                { name: "一面", status: "current" },
                { name: "正式offer", status: "pending" },
              ],
              status: "active",
              pinned: false,
            },
          ],
        },
      });
      expect(importRes.statusCode).toBe(200);
      expect(importRes.json().count).toBe(1);

      const listA = await app.inject({
        method: "GET",
        url: "/api/records",
        headers: { cookie: cookieA },
      });
      expect(listA.json().items).toHaveLength(2);
      const legacyImported = listA.json().items.find((x: { id: string }) => x.id === "legacy-1");
      expect(legacyImported.stages[1].type).toBe("interview");
      expect(legacyImported.stages[2].type).toBe("offer");
    } finally {
      await app.close();
      await store.close();
    }
  });
});
