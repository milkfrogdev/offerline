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
    mailSecret: "unit-test-mail-secret",
  });
  return { app, store };
}

function extractCookie(setCookie: string | string[] | undefined): string {
  const first = Array.isArray(setCookie) ? setCookie[0] : setCookie || "";
  return first.split(";")[0];
}

describe("OfferLine 服务端安全、日程、邮箱与面经集成测试", () => {
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

      const reg = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: { origin: ORIGIN, "content-type": "application/json" },
        payload: { username: "alice", password: "alice-password-123" },
      });
      expect(reg.statusCode).toBe(201);
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

  it("支持投递 CRUD、粘贴邮件解析生成日程、一键同步时间线、ICS 订阅、邮箱密文存储与面经记录", async () => {
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

      // 1. 新增投递
      const recRes = await app.inject({
        method: "POST",
        url: "/api/records",
        headers: { origin: ORIGIN, cookie: cookieA, "content-type": "application/json" },
        payload: { company: "腾讯", position: "后台开发", url: "https://careers.tencent.com/" },
      });
      expect(recRes.statusCode).toBe(201);
      const rec = recRes.json();

      // 2. 粘贴邮件解析并生成日程
      const parseRes = await app.inject({
        method: "POST",
        url: "/api/mail/parse-preview",
        headers: { origin: ORIGIN, cookie: cookieA, "content-type": "application/json" },
        payload: {
          subject: "【腾讯】后台开发二面面试邀请",
          from: "腾讯招聘 <recruit@tencent.com>",
          text: "岗位：后台开发\n面试时间：2026年11月26日 15:00-16:00\n会议链接：https://meeting.tencent.com/dm/test123",
          createEvent: true,
        },
      });
      expect(parseRes.statusCode).toBe(200);
      const createdEvent = parseRes.json().event;
      expect(createdEvent.company).toBe("腾讯");
      expect(createdEvent.recordId).toBe(rec.id);

      // 3. 一键将日程同步到投递时间线（自动推进到二面）
      const syncRecRes = await app.inject({
        method: "POST",
        url: `/api/events/${createdEvent.id}/sync-record`,
        headers: { origin: ORIGIN, cookie: cookieA },
      });
      expect(syncRecRes.statusCode).toBe(200);
      const syncedRec = syncRecRes.json().record;
      expect(syncedRec.stages[5].name).toBe("二面");
      expect(syncedRec.stages[5].status).toBe("current");

      // 4. 日历私有订阅令牌 & ICS 端点
      const tokenRes = await app.inject({
        method: "GET",
        url: "/api/calendar/token",
        headers: { cookie: cookieA },
      });
      expect(tokenRes.statusCode).toBe(200);
      const token = tokenRes.json().token;
      const icsRes = await app.inject({
        method: "GET",
        url: `/api/calendar/${token}.ics`,
      });
      expect(icsRes.statusCode).toBe(200);
      expect(icsRes.body).toContain("BEGIN:VCALENDAR");
      expect(icsRes.body).toContain("腾讯");

      // 5. 邮箱配置保存密文、绝不返回明文密码
      const mailSave = await app.inject({
        method: "PUT",
        url: "/api/mail/config",
        headers: { origin: ORIGIN, cookie: cookieA, "content-type": "application/json" },
        payload: {
          enabled: false,
          provider: "qq",
          host: "imap.qq.com",
          port: 993,
          secure: true,
          email: "demo@qq.com",
          password: "secret-auth-code-16",
          folder: "INBOX",
          pollIntervalMin: 10,
          lookbackDays: 7,
          llmEnabled: false,
          llmBaseUrl: "",
          llmModel: "",
        },
      });
      expect(mailSave.statusCode).toBe(200);
      expect(mailSave.body).not.toContain("secret-auth-code-16");
      expect(mailSave.json().hasPassword).toBe(true);

      // 6. 面经记录 CRUD 与用户隔离
      const noteRes = await app.inject({
        method: "POST",
        url: "/api/notes",
        headers: { origin: ORIGIN, cookie: cookieA, "content-type": "application/json" },
        payload: {
          recordId: rec.id,
          company: "腾讯",
          position: "后台开发",
          stageName: "一面",
          feeling: "great",
          content: "1. MySQL 索引下推与 MVCC\n2. 算法：LRU 缓存手写",
        },
      });
      expect(noteRes.statusCode).toBe(201);

      const notesB = await app.inject({
        method: "GET",
        url: "/api/notes",
        headers: { cookie: cookieB },
      });
      expect(notesB.json().items).toHaveLength(0);

      // 7. 官网图标代理拒绝内网/回环地址（SSRF 防护）
      const ssrfRes = await app.inject({
        method: "GET",
        url: `/api/brand-icon?url=${encodeURIComponent("http://127.0.0.1:8080/")}`,
        headers: { cookie: cookieA },
      });
      expect(ssrfRes.statusCode).toBe(404);

      const badScheme = await app.inject({
        method: "GET",
        url: `/api/brand-icon?url=${encodeURIComponent("file:///etc/passwd")}`,
        headers: { cookie: cookieA },
      });
      expect(badScheme.statusCode).toBe(400);
    } finally {
      await app.close();
      await store.close();
    }
  });
});
