import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildApp } from "../server/app";
import { JsonFileStore } from "../server/store";

const ORIGIN = "http://127.0.0.1:3002";

async function createTestApp(extraOpts: Partial<Parameters<typeof buildApp>[0]> = {}) {
  const store = new JsonFileStore(null);
  const app = await buildApp({
    store,
    origin: ORIGIN,
    production: true,
    allowHttp: true,
    mailSecret: "unit-test-mail-secret",
    ...extraOpts,
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

      // 本地回环 127.0.0.1 与 localhost（同协议同端口）自动互通，防止本地误拦
      const localhostPort = new URL(ORIGIN).port;
      const loopbackOk = await app.inject({
        method: "POST",
        url: "/api/auth/logout",
        headers: { origin: `http://localhost:${localhostPort}` },
      });
      expect(loopbackOk.statusCode).toBe(200);

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

  it("支持投递 CRUD、粘贴邮件解析生成与去重日程、单活流程推断、拒信拦截、ICS 订阅、邮箱密文存储与面经记录", async () => {
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

      // 2. 粘贴邮件解析并生成日程（即使邮件不写岗位，也能自动推断关联同公司唯一进行中流程，绝不篡改时间线）
      const parseRes = await app.inject({
        method: "POST",
        url: "/api/mail/parse-preview",
        headers: { origin: ORIGIN, cookie: cookieA, "content-type": "application/json" },
        payload: {
          subject: "【腾讯】二面面试邀请",
          from: "腾讯招聘 <recruit@tencent.com>",
          text: "面试时间：2026年11月26日 15:00-16:00\n会议链接：https://meeting.tencent.com/dm/test123",
          createEvent: true,
        },
      });
      expect(parseRes.statusCode).toBe(200);
      const createdEvent = parseRes.json().event;
      expect(createdEvent.company).toBe("腾讯");
      expect(createdEvent.recordId).toBe(rec.id);
      expect(createdEvent.position).toBe("后台开发");
      expect(parseRes.json().matchedRecord.matchType).toBe("company_sole_active");

      // 2b. 同场提醒重复解析自动语义合并，不重复创建第二条日程
      const dupRes = await app.inject({
        method: "POST",
        url: "/api/mail/parse-preview",
        headers: { origin: ORIGIN, cookie: cookieA, "content-type": "application/json" },
        payload: {
          subject: "【腾讯】面试提醒",
          from: "腾讯招聘 <recruit@tencent.com>",
          text: "面试时间：2026-11-26 15:00-16:00\n会议链接：https://meeting.tencent.com/dm/test123",
          createEvent: true,
        },
      });
      expect(dupRes.statusCode).toBe(200);
      expect(dupRes.json().merged).toBe(true);
      expect(dupRes.json().event.id).toBe(createdEvent.id);

      // 2c. 拒信严格拦截，不写入日程
      const rejectRes = await app.inject({
        method: "POST",
        url: "/api/mail/parse-preview",
        headers: { origin: ORIGIN, cookie: cookieA, "content-type": "application/json" },
        payload: {
          subject: "感谢您应聘某科技公司",
          from: "招聘组 <hr@example.com>",
          text: "很遗憾地通知您，本次投递流程已结束，简历已录入人才库。",
          createEvent: true,
        },
      });
      expect(rejectRes.statusCode).toBe(200);
      expect(rejectRes.json().parsed.matched).toBe(false);
      expect(rejectRes.json().event).toBeNull();

      // 3. 确认日程只更新日程状态，原投递时间线保持未篡改
      const patchEvRes = await app.inject({
        method: "PATCH",
        url: `/api/events/${createdEvent.id}`,
        headers: { origin: ORIGIN, cookie: cookieA, "content-type": "application/json" },
        payload: { status: "confirmed" },
      });
      expect(patchEvRes.statusCode).toBe(200);
      const listRecAfter = await app.inject({
        method: "GET",
        url: "/api/records",
        headers: { cookie: cookieA },
      });
      expect(listRecAfter.json().items[0].stages).toEqual(rec.stages);

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

      // 5. 未配 IMAP 也可独立保存个人大模型配置，且密文不回传明文、SSRF 测试拦截内网地址
      const llmOnlySave = await app.inject({
        method: "PUT",
        url: "/api/mail/llm-config",
        headers: { origin: ORIGIN, cookie: cookieB, "content-type": "application/json" },
        payload: {
          llmEnabled: false,
          llmBaseUrl: "https://api.deepseek.com/v1",
          llmModel: "deepseek-chat",
          llmApiKey: "sk-unit-test-secret-llm-key",
        },
      });
      expect(llmOnlySave.statusCode).toBe(200);
      expect(llmOnlySave.body).not.toContain("sk-unit-test-secret-llm-key");
      expect(llmOnlySave.json().hasLlmKey).toBe(true);
      expect(llmOnlySave.json().configured).toBe(false);

      const llmSsrf = await app.inject({
        method: "POST",
        url: "/api/mail/test-llm",
        headers: { origin: ORIGIN, cookie: cookieB, "content-type": "application/json" },
        payload: {
          baseUrl: "http://127.0.0.1:11434/v1",
          model: "qwen2.5",
          apiKey: "sk-local-test",
        },
      });
      expect(llmSsrf.statusCode).toBe(400);

      // 5b. 邮箱配置保存密文、绝不返回明文密码
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

  it("支持 lookbackDays=0（从现在起只看新邮件）基准 UID 记录与防重复探测，以及 HTML 禁缓存策略", async () => {
    const tmpStatic = mkdtempSync(join(tmpdir(), "offerline-static-"));
    mkdirSync(join(tmpStatic, "assets"), { recursive: true });
    mkdirSync(join(tmpStatic, "fonts"), { recursive: true });
    writeFileSync(
      join(tmpStatic, "index.html"),
      '<!doctype html><html><head><script type="module" src="/assets/index-TEST1234.js"></script></head><body></body></html>',
    );
    writeFileSync(join(tmpStatic, "assets", "index-TEST1234.js"), "console.log('ok');");
    writeFileSync(join(tmpStatic, "fonts", "test.woff2"), "wOF2");

    let probeCount = 0;
    const { app, store } = await createTestApp({
      staticRoot: tmpStatic,
      probeMailboxBaseline: async () => {
        probeCount++;
        return 1400 + probeCount * 10;
      },
    });
    try {
      const reg = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: { origin: ORIGIN, "content-type": "application/json" },
        payload: { username: "mailzero", password: "strong-password-zero" },
      });
      expect(reg.statusCode).toBe(201);
      const cookie = extractCookie(reg.headers["set-cookie"]);
      const userId = reg.json().user.id as number;

      // 静态资源与 index.html 缓存策略 + clientEntry 下发
      const htmlRes = await app.inject({ method: "GET", url: "/" });
      expect(htmlRes.statusCode).toBe(200);
      expect(htmlRes.headers["cache-control"]).toContain("no-store");

      const assetRes = await app.inject({ method: "GET", url: "/assets/index-TEST1234.js" });
      expect(assetRes.statusCode).toBe(200);
      expect(assetRes.headers["cache-control"]).toContain("immutable");

      const fontRes = await app.inject({ method: "GET", url: "/fonts/test.woff2" });
      expect(fontRes.statusCode).toBe(200);
      expect(fontRes.headers["cache-control"]).toContain("immutable");

      const sess = await app.inject({ method: "GET", url: "/api/session", headers: { cookie } });
      expect(sess.json().clientEntry).toBe("/assets/index-TEST1234.js");

      // 1. 首次保存 lookbackDays=0：应立即记录基准 UID，且 GET 原样返回 0
      const saveZero = await app.inject({
        method: "PUT",
        url: "/api/mail/config",
        headers: { origin: ORIGIN, cookie, "content-type": "application/json" },
        payload: {
          enabled: true,
          provider: "qq",
          host: "imap.qq.com",
          port: 993,
          secure: true,
          email: "zero@qq.com",
          password: "secret-auth-code-zero",
          folder: "INBOX",
          pollIntervalMin: 10,
          lookbackDays: 0,
        },
      });
      expect(saveZero.statusCode).toBe(200);
      expect(saveZero.json().lookbackDays).toBe(0);
      expect(probeCount).toBe(1);
      expect((await store.getMailAccount(userId))?.lastUid).toBe(1410);

      const getCfg = await app.inject({
        method: "GET",
        url: "/api/mail/config",
        headers: { cookie },
      });
      expect(getCfg.json().lookbackDays).toBe(0);

      // 2. 保持 lookbackDays=0 且放开高频检查 1 分钟：不重复推进基准水位，避免漏收刚到邮件
      const editPoll = await app.inject({
        method: "PUT",
        url: "/api/mail/config",
        headers: { origin: ORIGIN, cookie, "content-type": "application/json" },
        payload: {
          enabled: true,
          provider: "qq",
          host: "imap.qq.com",
          port: 993,
          secure: true,
          email: "zero@qq.com",
          folder: "INBOX",
          pollIntervalMin: 1,
          lookbackDays: 0,
        },
      });
      expect(editPoll.statusCode).toBe(200);
      expect(editPoll.json().pollIntervalMin).toBe(1);
      expect(probeCount).toBe(1);
      expect((await store.getMailAccount(userId))?.lastUid).toBe(1410);

      // 3. 大模型独立保存不破坏已有 lastUid
      await app.inject({
        method: "PUT",
        url: "/api/mail/llm-config",
        headers: { origin: ORIGIN, cookie, "content-type": "application/json" },
        payload: {
          llmEnabled: false,
          llmBaseUrl: "https://api.deepseek.com/v1",
          llmModel: "deepseek-chat",
          llmApiKey: "sk-keep-uid-test",
        },
      });
      expect((await store.getMailAccount(userId))?.lastUid).toBe(1410);

      // 4. 切换为回看近 7 天：重置 lastUid=0 以便下次同步回溯近 7 天
      const switchSeven = await app.inject({
        method: "PUT",
        url: "/api/mail/config",
        headers: { origin: ORIGIN, cookie, "content-type": "application/json" },
        payload: {
          enabled: true,
          provider: "qq",
          host: "imap.qq.com",
          port: 993,
          secure: true,
          email: "zero@qq.com",
          folder: "INBOX",
          pollIntervalMin: 5,
          lookbackDays: 7,
        },
      });
      expect(switchSeven.statusCode).toBe(200);
      expect(switchSeven.json().lookbackDays).toBe(7);
      expect((await store.getMailAccount(userId))?.lastUid).toBe(0);

      // 5. 从 7 天切回 0 天：再次记录新基准 UID
      const backZero = await app.inject({
        method: "PUT",
        url: "/api/mail/config",
        headers: { origin: ORIGIN, cookie, "content-type": "application/json" },
        payload: {
          enabled: true,
          provider: "qq",
          host: "imap.qq.com",
          port: 993,
          secure: true,
          email: "zero@qq.com",
          folder: "INBOX",
          pollIntervalMin: 5,
          lookbackDays: 0,
        },
      });
      expect(backZero.statusCode).toBe(200);
      expect(probeCount).toBe(2);
      expect((await store.getMailAccount(userId))?.lastUid).toBe(1420);
    } finally {
      await app.close();
      await store.close();
      rmSync(tmpStatic, { recursive: true, force: true });
    }
  });

  it("支持大模型批量解析导入（直连 Key 与免 Key 贴回 JSON）并加密保存模型配置", async () => {
    const { app, store } = await createTestApp({
      callLlmJson: async () => ({
        ok: true,
        latencyMs: 120,
        normalizedEndpoint: "https://api.deepseek.com/v1/chat/completions",
        jsonMode: "native",
        data: {
          records: [
            {
              company: "科大讯飞",
              position: "大模型研发",
              stages: [
                { name: "投递", status: "pass" },
                { name: "一面", status: "pass" },
                { name: "二面", status: "current" },
              ],
            },
          ],
        },
      }),
    });

    try {
      const reg = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: { origin: ORIGIN, "content-type": "application/json" },
        payload: { username: "importer", password: "strong-password-import" },
      });
      const cookie = extractCookie(reg.headers["set-cookie"]);

      // 1. 未配置 Key 解析纯文本给出明确提示
      const noKey = await app.inject({
        method: "POST",
        url: "/api/records/smart-parse",
        headers: { origin: ORIGIN, cookie, "content-type": "application/json" },
        payload: { text: "字节跳动 后端开发 二面中" },
      });
      expect(noKey.statusCode).toBe(400);
      expect(noKey.json().code).toBe("LLM_NOT_CONFIGURED");

      // 2. 免 Key 直接贴回网页版大模型 JSON 即可识别
      const directJson = await app.inject({
        method: "POST",
        url: "/api/records/smart-parse",
        headers: { origin: ORIGIN, cookie, "content-type": "application/json" },
        payload: {
          text: '[{"company":"美团","position":"后端","stages":[{"name":"投递","status":"pass"},{"name":"一面","status":"current"}]}]',
        },
      });
      expect(directJson.statusCode).toBe(200);
      expect(directJson.json().source).toBe("json");
      expect(directJson.json().items[0].company).toBe("美团");

      // 3. 填入个人大模型 API Key 解析原始文本并加密保存配置（不回传明文 Key）
      const llmParse = await app.inject({
        method: "POST",
        url: "/api/records/smart-parse",
        headers: { origin: ORIGIN, cookie, "content-type": "application/json" },
        payload: {
          text: "科大讯飞 大模型研发 过了一面等二面",
          llm: {
            baseUrl: "https://api.deepseek.com/v1",
            model: "deepseek-chat",
            apiKey: "sk-smart-import-secret-123",
          },
          saveLlmConfig: true,
        },
      });
      expect(llmParse.statusCode).toBe(200);
      expect(llmParse.body).not.toContain("sk-smart-import-secret-123");
      expect(llmParse.json().source).toBe("llm");
      expect(llmParse.json().items[0].company).toBe("科大讯飞");
      expect(llmParse.json().mailConfig.hasLlmKey).toBe(true);
    } finally {
      await app.close();
      await store.close();
    }
  });
});
