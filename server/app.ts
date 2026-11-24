import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import staticFiles from "@fastify/static";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import {
  applyStageStatusChange,
  buildInitialStages,
  createDefaultStageDrafts,
  normalizeStage,
  reconcileEditedStages,
  validateStageDrafts,
} from "../shared/stages.js";
import {
  EVENT_KINDS,
  EVENT_STATUSES,
  EVENT_TIME_MODES,
  MAIL_PROVIDERS,
  NOTE_FEELINGS,
  PRIORITY_LEVELS,
  STAGE_STATUSES,
  type ApplicationRecord,
  type EventTimeMode,
  type InterviewNote,
  type ScheduleEvent,
  type Stage,
  type StageStatus,
  type UserProfile,
} from "../shared/types.js";
import { resolveSiteBrandIcon } from "./brand-icon.js";
import { buildIcsCalendar } from "./ics.js";
import { assertSafeLlmUrl, normalizeLlmEndpoint, testLlmConnection } from "./llm-client.js";
import { buildEventTitle, parseRecruitmentEmail } from "./mail-parser.js";
import {
  findDuplicateEmailEvent,
  inferRecordForEmail,
  mergeDuplicateEvent,
  probeMailboxBaselineUid,
  syncUserMailbox,
  testImapConnection,
  type ImapCredentials,
} from "./mail-sync.js";
import {
  decryptSecret,
  deriveMasterKey,
  encryptSecret,
  hashPassword,
  randomToken,
  sanitizeExternalUrl,
  sha256Hex,
  verifyPassword,
} from "./security.js";
import { toPublicMailAccount, type Store } from "./store.js";

class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code = "ERROR",
  ) {
    super(message);
  }
}

const authSchema = z
  .object({
    username: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9_]{3,32}$/, "用户名需为 3–32 位小写字母、数字或下划线"),
    password: z.string().min(10, "密码至少需要 10 个字符").max(128),
  })
  .strict();

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: z.string().min(10, "新密码至少需要 10 个字符").max(128),
  })
  .strict();

const sealedSchema = z
  .object({
    v: z.literal(1),
    alg: z.literal("AES-256-GCM"),
    kdf: z.literal("PBKDF2-SHA256"),
    iterations: z.number().int().min(100_000).max(2_000_000),
    salt: z.string().min(8).max(128),
    iv: z.string().min(8).max(128),
    ct: z.string().min(8).max(200_000),
  })
  .strict();

const createRecordSchema = z
  .object({
    company: z.string().trim().min(1, "请填写公司名称").max(100),
    position: z.string().trim().min(1, "请填写岗位名称").max(100),
    url: z.string().max(1000).optional(),
    city: z.string().trim().max(40).optional(),
    salary: z.string().trim().max(60).optional(),
    source: z.string().trim().max(40).optional(),
    priority: z.enum(PRIORITY_LEVELS).optional(),
    nextFollowUpAt: z.string().max(32).optional(),
    notes: z.string().max(10000).optional(),
    sealed: sealedSchema.optional(),
    stages: z.array(z.any()).optional(),
  })
  .strict();

const updateRecordSchema = z
  .object({
    company: z.string().trim().min(1, "请填写公司名称").max(100).optional(),
    position: z.string().trim().min(1, "请填写岗位名称").max(100).optional(),
    url: z.string().max(1000).nullable().optional(),
    city: z.string().trim().max(40).optional(),
    salary: z.string().trim().max(60).optional(),
    source: z.string().trim().max(40).optional(),
    priority: z.enum(PRIORITY_LEVELS).optional(),
    nextFollowUpAt: z.string().max(32).nullable().optional(),
    notes: z.string().max(10000).optional(),
    sealed: sealedSchema.nullable().optional(),
    status: z.enum(["active", "archived"]).optional(),
    pinned: z.boolean().optional(),
    stages: z.array(z.any()).optional(),
  })
  .strict();

const createEventSchema = z
  .object({
    recordId: z.string().max(64).optional(),
    company: z.string().trim().min(1, "请填写公司名称").max(100),
    position: z.string().trim().max(100).optional(),
    stageName: z.string().trim().max(40).optional(),
    title: z.string().trim().min(1, "请填写日程标题").max(160),
    kind: z.enum(EVENT_KINDS).default("interview"),
    startAt: z.string().min(8).max(40),
    endAt: z.string().max(40).optional(),
    timeMode: z.enum(EVENT_TIME_MODES).default("scheduled"),
    location: z.string().trim().max(500).optional(),
    source: z.enum(["email", "manual"]).default("manual"),
    status: z.enum(EVENT_STATUSES).default("confirmed"),
    notes: z.string().max(4000).optional(),
  })
  .strict();

const updateEventSchema = z
  .object({
    recordId: z.string().max(64).nullable().optional(),
    company: z.string().trim().min(1).max(100).optional(),
    position: z.string().trim().max(100).optional(),
    stageName: z.string().trim().max(40).nullable().optional(),
    title: z.string().trim().min(1).max(160).optional(),
    kind: z.enum(EVENT_KINDS).optional(),
    startAt: z.string().min(8).max(40).optional(),
    endAt: z.string().max(40).nullable().optional(),
    timeMode: z.enum(EVENT_TIME_MODES).optional(),
    location: z.string().trim().max(500).nullable().optional(),
    status: z.enum(EVENT_STATUSES).optional(),
    notes: z.string().max(4000).optional(),
  })
  .strict();

const createNoteSchema = z
  .object({
    recordId: z.string().max(64).optional(),
    company: z.string().trim().min(1, "请填写公司名称").max(100),
    position: z.string().trim().max(100).optional(),
    stageName: z.string().trim().min(1, "请填写面试轮次").max(40),
    interviewedAt: z.string().max(32).optional(),
    feeling: z.enum(NOTE_FEELINGS).default("normal"),
    content: z.string().trim().min(1, "请填写面经内容").max(30000),
  })
  .strict();

const updateNoteSchema = z
  .object({
    recordId: z.string().max(64).nullable().optional(),
    company: z.string().trim().min(1).max(100).optional(),
    position: z.string().trim().max(100).optional(),
    stageName: z.string().trim().min(1).max(40).optional(),
    interviewedAt: z.string().max(32).nullable().optional(),
    feeling: z.enum(NOTE_FEELINGS).optional(),
    content: z.string().trim().min(1).max(30000).optional(),
  })
  .strict();

const mailConfigSchema = z
  .object({
    enabled: z.boolean(),
    provider: z.enum(MAIL_PROVIDERS).default("qq"),
    host: z.string().trim().min(3, "请填写 IMAP 服务器地址").max(160),
    port: z.number().int().min(1).max(65535).default(993),
    secure: z.boolean().default(true),
    email: z.string().trim().min(3, "请填写邮箱地址").max(160),
    password: z.string().max(256).optional(),
    folder: z.string().trim().min(1).max(64).default("INBOX"),
    pollIntervalMin: z.number().int().min(1).max(180).default(10),
    lookbackDays: z.number().int().min(0).max(30).default(7),
    llmEnabled: z.boolean().optional(),
    llmBaseUrl: z.string().trim().max(240).optional(),
    llmModel: z.string().trim().max(100).optional(),
    llmApiKey: z.string().max(256).optional(),
  })
  .strict();

const llmConfigSchema = z
  .object({
    llmEnabled: z.boolean(),
    llmBaseUrl: z.string().trim().max(240).default(""),
    llmModel: z.string().trim().max(100).default(""),
    llmApiKey: z.string().max(256).optional(),
  })
  .strict();

export type AppOptions = {
  store: Store;
  origin: string;
  production?: boolean;
  allowHttp?: boolean;
  registrationOpen?: boolean;
  staticRoot?: string;
  mailSecret?: string;
  probeMailboxBaseline?: (creds: ImapCredentials) => Promise<number>;
};

function resolveClientEntry(staticRoot: string): string {
  const indexPath = resolve(staticRoot, "index.html");
  if (!existsSync(indexPath)) return "";
  try {
    const html = readFileSync(indexPath, "utf8");
    const match = html.match(/src="(\/assets\/index-[^"']+\.js)"/);
    return match ? match[1] : "";
  } catch {
    return "";
  }
}

export async function buildApp({
  store,
  origin,
  production = false,
  allowHttp = false,
  registrationOpen = true,
  staticRoot = resolve("dist/web"),
  mailSecret = process.env.MAIL_ENCRYPTION_KEY ||
    process.env.SESSION_SECRET ||
    "offerline-local-dev-mail-key",
  probeMailboxBaseline = probeMailboxBaselineUid,
}: AppOptions) {
  const clientEntry = resolveClientEntry(staticRoot);
  const parsedOrigin = new URL(origin);
  const https = parsedOrigin.protocol === "https:";
  if (
    parsedOrigin.origin !== origin ||
    !["http:", "https:"].includes(parsedOrigin.protocol) ||
    (production && !https && !allowHttp)
  ) {
    throw new Error("APP_ORIGIN must be HTTPS in production unless ALLOW_HTTP=true");
  }
  const secure = production && https;
  const masterKey = deriveMasterKey(mailSecret);

  const app = Fastify({
    logger: false,
    bodyLimit: 1_048_576,
    trustProxy: secure ? (_addr: string, hop: number) => hop === 0 : false,
    requestTimeout: 30_000,
  });

  await app.register(cookie);
  const cookieName = secure
    ? "__Host-offerline"
    : production
      ? "offerline-http"
      : "offerline-dev";
  const cookieOpts = {
    path: "/",
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    maxAge: 7 * 86400,
  };

  const dummyHash = hashPassword(randomToken());

  async function enforceLimit(key: string, max: number, windowMs: number) {
    const ok = await store.checkRateLimit(key, max, windowMs);
    if (!ok) {
      throw new ApiError(429, "操作过于频繁，请稍后再试。", "RATE_LIMITED");
    }
  }

  async function currentUser(req: FastifyRequest): Promise<UserProfile | null> {
    const raw = req.cookies[cookieName];
    if (!raw || !/^[\w-]{43}$/.test(raw)) return null;
    return store.findSessionUser(sha256Hex(raw), new Date().toISOString());
  }

  async function requireUser(req: FastifyRequest): Promise<UserProfile> {
    const user = await currentUser(req);
    if (!user) throw new ApiError(401, "请先登录。", "LOGIN_REQUIRED");
    return user;
  }

  async function issueSession(userId: number, reply: FastifyReply) {
    const raw = randomToken();
    const now = new Date();
    const exp = new Date(now.getTime() + 7 * 86400 * 1000).toISOString();
    await store.createSession(sha256Hex(raw), userId, exp, now.toISOString());
    reply.setCookie(cookieName, raw, cookieOpts);
  }

  app.addHook("onRequest", async (req, reply) => {
    reply
      .header("X-Content-Type-Options", "nosniff")
      .header("Referrer-Policy", "no-referrer")
      .header("X-Frame-Options", "DENY")
      .header(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'",
      );
    if (secure) {
      reply.header("Strict-Transport-Security", "max-age=31536000");
    }
    if (req.url.startsWith("/api/")) {
      reply.header("Cache-Control", "no-store");
      if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
        if (req.headers.origin !== origin) {
          throw new ApiError(403, "请求来源校验失败，请刷新页面后重试。", "BAD_ORIGIN");
        }
        const hasBody =
          req.headers["content-length"] !== undefined &&
          req.headers["content-length"] !== "0";
        if (hasBody && !req.headers["content-type"]?.startsWith("application/json")) {
          throw new ApiError(415, "仅支持 JSON 请求体。", "BAD_CONTENT_TYPE");
        }
      }
    }
  });

  app.setErrorHandler((err: Error & { statusCode?: number }, _req, reply) => {
    if (err instanceof ApiError) {
      return reply.status(err.statusCode).send({ error: err.message, code: err.code });
    }
    if (err instanceof z.ZodError) {
      return reply
        .status(400)
        .send({ error: err.issues[0]?.message || "参数格式无效。", code: "VALIDATION_ERROR" });
    }
    const status =
      err.statusCode && err.statusCode >= 400 && err.statusCode < 500 ? err.statusCode : 500;
    return reply.status(status).send({
      error:
        status === 413 ? "提交内容过大。" : status === 400 ? "请求格式不正确。" : "服务暂时不可用。",
      code: "SERVER_ERROR",
    });
  });

  app.get("/api/health", async () => {
    await store.ping();
    return { ok: true };
  });

  app.get("/api/brand-icon", async (req, reply) => {
    const user = await requireUser(req);
    await enforceLimit(`brand-icon:${user.id}`, 120, 60_000);
    const { url } = req.query as { url?: string };
    const clean = sanitizeExternalUrl(url);
    if (!clean) {
      return reply.status(400).send({ error: "无效的站点链接。" });
    }
    const icon = await resolveSiteBrandIcon(clean);
    if (!icon) {
      return reply.status(404).send({ error: "未找到可用图标。" });
    }
    reply
      .header("Content-Type", icon.contentType)
      .header("Cache-Control", "private, max-age=86400")
      .header("Content-Security-Policy", "sandbox");
    return reply.send(icon.body);
  });

  app.get("/api/session", async (req) => ({
    user: await currentUser(req),
    registrationOpen,
    ...(clientEntry ? { clientEntry } : {}),
  }));

  app.post("/api/auth/register", async (req, reply) => {
    if (!registrationOpen) {
      throw new ApiError(403, "当前已关闭公开注册。", "REGISTRATION_CLOSED");
    }
    const body = authSchema.parse(req.body);
    await enforceLimit(`reg:${sha256Hex(req.ip)}`, 10, 15 * 60_000);
    const existing = await store.getUserByUsername(body.username);
    if (existing) {
      throw new ApiError(409, "该用户名已被注册。", "USERNAME_TAKEN");
    }
    const created = await store.createUser(body.username, hashPassword(body.password), "user");
    await issueSession(created.id, reply);
    reply.status(201);
    return {
      user: {
        id: created.id,
        username: created.username,
        role: created.role,
        createdAt: created.createdAt,
      },
    };
  });

  app.post("/api/auth/login", async (req, reply) => {
    const body = authSchema.parse(req.body);
    await enforceLimit(`login:${sha256Hex(req.ip)}`, 20, 15 * 60_000);
    await enforceLimit(`login-user:${sha256Hex(body.username)}`, 10, 15 * 60_000);
    const row = await store.getUserByUsername(body.username);
    const valid = verifyPassword(body.password, row?.passwordHash || dummyHash);
    if (!row || !valid) {
      throw new ApiError(401, "用户名或密码不正确。", "INVALID_CREDENTIALS");
    }
    await issueSession(row.id, reply);
    return {
      user: {
        id: row.id,
        username: row.username,
        role: row.role,
        createdAt: row.createdAt,
      },
    };
  });

  app.post("/api/auth/logout", async (req, reply) => {
    const raw = req.cookies[cookieName];
    if (raw) {
      await store.deleteSession(sha256Hex(raw));
    }
    reply.clearCookie(cookieName, { path: "/" });
    return { ok: true };
  });

  app.post("/api/auth/password", async (req, reply) => {
    const user = await requireUser(req);
    const body = passwordSchema.parse(req.body);
    const stored = await store.getUserById(user.id);
    if (!stored || !verifyPassword(body.currentPassword, stored.passwordHash)) {
      throw new ApiError(401, "当前密码不正确。", "INVALID_PASSWORD");
    }
    await store.updateUserPassword(user.id, hashPassword(body.newPassword));
    await store.deleteUserSessions(user.id);
    await issueSession(user.id, reply);
    return { ok: true };
  });

  // ===== Application Records =====
  app.get("/api/records", async (req) => {
    const user = await requireUser(req);
    return { items: await store.listRecords(user.id) };
  });

  app.post("/api/records", async (req, reply) => {
    const user = await requireUser(req);
    const body = createRecordSchema.parse(req.body);
    const drafts = body.stages ?? createDefaultStageDrafts();
    const stageErr = validateStageDrafts(drafts);
    if (stageErr) throw new ApiError(400, stageErr, "INVALID_STAGES");

    const url = body.url ? (sanitizeExternalUrl(body.url) ?? undefined) : undefined;
    if (body.url && body.url.trim() && !url) {
      throw new ApiError(400, "链接需以 http:// 或 https:// 开头。", "INVALID_URL");
    }

    const now = new Date().toISOString();
    const record: ApplicationRecord = {
      id: randomUUID(),
      userId: user.id,
      company: body.company,
      position: body.position,
      stages: buildInitialStages(drafts),
      status: "active",
      url,
      city: body.city || "",
      salary: body.salary || "",
      source: body.source || "",
      priority: body.priority || "normal",
      nextFollowUpAt: body.nextFollowUpAt?.trim() || undefined,
      pinned: false,
      notes: body.notes?.trim() || "",
      sealed: body.sealed,
      createdAt: now,
      updatedAt: now,
    };
    await store.insertRecord(user.id, record);
    reply.status(201);
    return record;
  });

  app.patch("/api/records/:id", async (req) => {
    const user = await requireUser(req);
    const { id } = req.params as { id: string };
    const existing = await store.getRecord(id, user.id);
    if (!existing) throw new ApiError(404, "未找到该投递记录。", "NOT_FOUND");

    const body = updateRecordSchema.parse(req.body);
    let nextUrl = existing.url;
    if (body.url !== undefined) {
      if (body.url === null || !body.url.trim()) {
        nextUrl = undefined;
      } else {
        const sanitized = sanitizeExternalUrl(body.url);
        if (!sanitized) throw new ApiError(400, "链接需以 http:// 或 https:// 开头。", "INVALID_URL");
        nextUrl = sanitized;
      }
    }

    let nextStages = existing.stages;
    if (body.stages !== undefined) {
      const stageErr = validateStageDrafts(body.stages);
      if (stageErr) throw new ApiError(400, stageErr, "INVALID_STAGES");
      nextStages = reconcileEditedStages(existing.stages, body.stages);
    }

    const updated: ApplicationRecord = {
      ...existing,
      company: body.company ?? existing.company,
      position: body.position ?? existing.position,
      url: nextUrl,
      city: body.city ?? existing.city ?? "",
      salary: body.salary ?? existing.salary ?? "",
      source: body.source ?? existing.source ?? "",
      priority: body.priority ?? existing.priority,
      nextFollowUpAt:
        body.nextFollowUpAt === undefined
          ? existing.nextFollowUpAt
          : body.nextFollowUpAt === null
            ? undefined
            : body.nextFollowUpAt.trim() || undefined,
      notes: body.notes !== undefined ? body.notes : existing.notes || "",
      sealed: body.sealed === undefined ? existing.sealed : body.sealed || undefined,
      status: body.status ?? existing.status,
      pinned: body.pinned ?? existing.pinned,
      stages: nextStages,
      updatedAt: new Date().toISOString(),
    };
    await store.updateRecord(user.id, updated);
    return updated;
  });

  app.patch("/api/records/:id/stage", async (req) => {
    const user = await requireUser(req);
    const { id } = req.params as { id: string };
    const body = z
      .object({
        stageIndex: z.number().int().min(0),
        status: z.enum(STAGE_STATUSES),
      })
      .strict()
      .parse(req.body);

    const existing = await store.getRecord(id, user.id);
    if (!existing) throw new ApiError(404, "未找到该投递记录。", "NOT_FOUND");
    if (body.stageIndex >= existing.stages.length) {
      throw new ApiError(400, "阶段索引超出范围。", "INVALID_STAGE_INDEX");
    }
    if (existing.stages[body.stageIndex].status === body.status) {
      return existing;
    }

    const updated: ApplicationRecord = {
      ...existing,
      stages: applyStageStatusChange(existing.stages, body.stageIndex, body.status as StageStatus),
      updatedAt: new Date().toISOString(),
    };
    await store.updateRecord(user.id, updated);
    return updated;
  });

  app.put("/api/records/company-pin", async (req) => {
    const user = await requireUser(req);
    const body = z
      .object({
        company: z.string().trim().min(1).max(100),
        pinned: z.boolean(),
      })
      .strict()
      .parse(req.body);

    const updated = await store.pinCompany(user.id, body.company, body.pinned);
    if (!updated) throw new ApiError(404, "未找到该公司的投递记录。", "NOT_FOUND");
    return { ok: true, updated, pinned: body.pinned };
  });

  app.post("/api/records/company-visit", async (req) => {
    const user = await requireUser(req);
    const body = z
      .object({ company: z.string().trim().min(1).max(100) })
      .strict()
      .parse(req.body);
    const now = new Date().toISOString();
    const updated = await store.visitCompany(user.id, body.company, now);
    if (!updated) throw new ApiError(404, "未找到该公司的投递记录。", "NOT_FOUND");
    return { ok: true, lastVisitedAt: now };
  });

  app.post("/api/records/:id/visit", async (req) => {
    const user = await requireUser(req);
    const { id } = req.params as { id: string };
    const now = new Date().toISOString();
    const ok = await store.visitRecord(user.id, id, now);
    if (!ok) throw new ApiError(404, "未找到该投递记录。", "NOT_FOUND");
    return { id, lastVisitedAt: now };
  });

  app.delete("/api/records/:id", async (req) => {
    const user = await requireUser(req);
    const { id } = req.params as { id: string };
    const ok = await store.deleteRecord(id, user.id);
    if (!ok) throw new ApiError(404, "未找到该投递记录。", "NOT_FOUND");
    return { ok: true };
  });

  app.get("/api/records/export", async (req, reply) => {
    const user = await requireUser(req);
    const items = await store.listRecords(user.id);
    reply.header("Content-Disposition", 'attachment; filename="offerline-export.json"');
    return items;
  });

  app.post("/api/records/import", async (req) => {
    const user = await requireUser(req);
    const body = z
      .object({
        mode: z.enum(["merge", "overwrite"]).default("merge"),
        data: z.array(z.any()).max(2000),
      })
      .strict()
      .parse(req.body);

    const sanitized: ApplicationRecord[] = [];
    for (const raw of body.data) {
      if (
        !raw ||
        typeof raw !== "object" ||
        typeof raw.company !== "string" ||
        typeof raw.position !== "string" ||
        !Array.isArray(raw.stages)
      ) {
        throw new ApiError(400, "导入数据格式不完整，需包含 company/position/stages。", "INVALID_IMPORT");
      }
      const company = raw.company.trim().slice(0, 100);
      const position = raw.position.trim().slice(0, 100);
      if (!company || !position) {
        throw new ApiError(400, "导入记录的公司和岗位不能为空。", "INVALID_IMPORT");
      }
      const stages = raw.stages.map((s: unknown, i: number) =>
        normalizeStage((s || {}) as Stage, i),
      );
      if (!stages.length) {
        throw new ApiError(400, "导入记录至少包含一个阶段。", "INVALID_IMPORT");
      }
      const now = new Date().toISOString();
      sanitized.push({
        id: typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : randomUUID(),
        company,
        position,
        stages,
        status: raw.status === "archived" ? "archived" : "active",
        url: sanitizeExternalUrl(raw.url) || undefined,
        city: typeof raw.city === "string" ? raw.city.trim().slice(0, 40) : "",
        salary: typeof raw.salary === "string" ? raw.salary.trim().slice(0, 60) : "",
        source: typeof raw.source === "string" ? raw.source.trim().slice(0, 40) : "",
        priority: raw.priority === "high" || raw.priority === "low" ? raw.priority : "normal",
        nextFollowUpAt: typeof raw.nextFollowUpAt === "string" ? raw.nextFollowUpAt : undefined,
        lastVisitedAt: typeof raw.lastVisitedAt === "string" ? raw.lastVisitedAt : undefined,
        pinned: Boolean(raw.pinned),
        notes: typeof raw.notes === "string" ? raw.notes : "",
        sealed: raw.sealed ? sealedSchema.parse(raw.sealed) : undefined,
        createdAt: typeof raw.createdAt === "string" ? raw.createdAt : now,
        updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : now,
      });
    }

    const count = await store.importRecords(user.id, sanitized, body.mode);
    return { ok: true, count };
  });

  // ===== Schedule Events & ICS =====
  app.get("/api/events", async (req) => {
    const user = await requireUser(req);
    return { items: await store.listEvents(user.id) };
  });

  app.post("/api/events", async (req, reply) => {
    const user = await requireUser(req);
    const body = createEventSchema.parse(req.body);
    if (Number.isNaN(Date.parse(body.startAt))) {
      throw new ApiError(400, "开始时间格式无效。", "INVALID_DATE");
    }
    const startIso = new Date(body.startAt).toISOString();
    const endIso =
      body.endAt && !Number.isNaN(Date.parse(body.endAt))
        ? new Date(body.endAt).toISOString()
        : new Date(Date.parse(startIso) + 60 * 60_000).toISOString();

    const now = new Date().toISOString();
    const event: ScheduleEvent = {
      id: randomUUID(),
      userId: user.id,
      recordId: body.recordId || undefined,
      company: body.company,
      position: body.position || "",
      stageName: body.stageName || undefined,
      title: body.title,
      kind: body.kind,
      startAt: startIso,
      endAt: body.timeMode === "scheduled" ? endIso : undefined,
      timeMode: body.timeMode,
      location: body.location || undefined,
      source: body.source,
      status: body.status,
      syncedToRecord: false,
      notes: body.notes || "",
      createdAt: now,
      updatedAt: now,
    };
    await store.insertEvent(user.id, event);
    reply.status(201);
    return event;
  });

  app.patch("/api/events/:id", async (req) => {
    const user = await requireUser(req);
    const { id } = req.params as { id: string };
    const existing = await store.getEvent(id, user.id);
    if (!existing) throw new ApiError(404, "未找到该日程。", "NOT_FOUND");

    const body = updateEventSchema.parse(req.body);
    let nextStart = existing.startAt;
    if (body.startAt !== undefined) {
      if (Number.isNaN(Date.parse(body.startAt))) {
        throw new ApiError(400, "开始时间格式无效。", "INVALID_DATE");
      }
      nextStart = new Date(body.startAt).toISOString();
    }
    let nextEnd = existing.endAt;
    if (body.endAt !== undefined) {
      nextEnd =
        body.endAt === null || !body.endAt.trim()
          ? undefined
          : !Number.isNaN(Date.parse(body.endAt))
            ? new Date(body.endAt).toISOString()
            : existing.endAt;
    }

    const updated: ScheduleEvent = {
      ...existing,
      recordId: body.recordId === undefined ? existing.recordId : body.recordId || undefined,
      company: body.company ?? existing.company,
      position: body.position ?? existing.position,
      stageName: body.stageName === undefined ? existing.stageName : body.stageName || undefined,
      title: body.title ?? existing.title,
      kind: body.kind ?? existing.kind,
      startAt: nextStart,
      endAt: nextEnd,
      timeMode: body.timeMode ?? existing.timeMode ?? "scheduled",
      location: body.location === undefined ? existing.location : body.location || undefined,
      status: body.status ?? existing.status,
      notes: body.notes !== undefined ? body.notes : existing.notes || "",
      updatedAt: new Date().toISOString(),
    };
    await store.updateEvent(user.id, updated);
    return updated;
  });

  app.delete("/api/events/:id", async (req) => {
    const user = await requireUser(req);
    const { id } = req.params as { id: string };
    const ok = await store.deleteEvent(id, user.id);
    if (!ok) throw new ApiError(404, "未找到该日程。", "NOT_FOUND");
    return { ok: true };
  });

  app.get("/api/events/:id/ics", async (req, reply) => {
    const user = await requireUser(req);
    const { id } = req.params as { id: string };
    const event = await store.getEvent(id, user.id);
    if (!event) throw new ApiError(404, "未找到该日程。", "NOT_FOUND");
    const ics = buildIcsCalendar([event], `OfferLine ${event.company}`);
    reply
      .header("Content-Type", "text/calendar; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="offerline-${event.id.slice(0, 8)}.ics"`);
    return ics;
  });

  app.get("/api/calendar/token", async (req) => {
    const user = await requireUser(req);
    const stored = await store.getUserById(user.id);
    if (!stored) throw new ApiError(401, "用户不存在。", "LOGIN_REQUIRED");
    let token = stored.calendarToken;
    if (!token) {
      token = randomToken();
      await store.setUserCalendarToken(user.id, token);
    }
    return {
      token,
      subscribeUrl: `${origin}/api/calendar/${token}.ics`,
    };
  });

  app.post("/api/calendar/token/rotate", async (req) => {
    const user = await requireUser(req);
    const token = randomToken();
    await store.setUserCalendarToken(user.id, token);
    return {
      token,
      subscribeUrl: `${origin}/api/calendar/${token}.ics`,
    };
  });

  app.get("/api/calendar/:file", async (req, reply) => {
    const { file } = req.params as { file: string };
    if (!file.endsWith(".ics")) {
      throw new ApiError(404, "日历订阅不存在。", "NOT_FOUND");
    }
    const token = file.slice(0, -4);
    if (!/^[\w-]{32,96}$/.test(token)) {
      throw new ApiError(404, "日历订阅令牌无效。", "NOT_FOUND");
    }
    const user = await store.getUserByCalendarToken(token);
    if (!user) throw new ApiError(404, "日历订阅已失效。", "NOT_FOUND");
    const events = await store.listEvents(user.id);
    const ics = buildIcsCalendar(events, `OfferLine 面试日程 (${user.username})`);
    reply
      .header("Content-Type", "text/calendar; charset=utf-8")
      .header("Cache-Control", "private, max-age=300");
    return ics;
  });

  // ===== Mail Listener & Parser =====
  app.get("/api/mail/config", async (req) => {
    const user = await requireUser(req);
    const account = await store.getMailAccount(user.id);
    return toPublicMailAccount(account);
  });

  app.put("/api/mail/config", async (req) => {
    const user = await requireUser(req);
    const body = mailConfigSchema.parse(req.body);
    const existing = await store.getMailAccount(user.id);

    const passwordEnc =
      body.password && body.password.trim()
        ? encryptSecret(body.password.trim(), masterKey)
        : existing?.passwordEnc || "";
    if (!passwordEnc) {
      throw new ApiError(400, "首次配置请填写邮箱 IMAP 授权码。", "PASSWORD_REQUIRED");
    }

    const llmKeyEnc =
      body.llmApiKey && body.llmApiKey.trim()
        ? encryptSecret(body.llmApiKey.trim(), masterKey)
        : existing?.llmKeyEnc || "";

    const nextLlmEnabled = body.llmEnabled ?? existing?.llmEnabled ?? false;
    const nextLlmBaseUrl = body.llmBaseUrl ?? existing?.llmBaseUrl ?? "";
    const nextLlmModel = body.llmModel ?? existing?.llmModel ?? "";

    const sameMailbox = Boolean(
      existing &&
        existing.email.toLowerCase() === body.email.toLowerCase() &&
        existing.host.toLowerCase() === body.host.toLowerCase() &&
        (existing.folder || "INBOX") === (body.folder || "INBOX"),
    );

    let effectivePassword = body.password?.trim() || "";
    if (!effectivePassword && sameMailbox && existing?.passwordEnc) {
      try {
        effectivePassword = decryptSecret(existing.passwordEnc, masterKey);
      } catch {
        effectivePassword = "";
      }
    }

    let nextLastUid = sameMailbox ? (existing?.lastUid ?? 0) : 0;
    if (body.lookbackDays === 0) {
      const shouldProbeBaseline =
        !sameMailbox ||
        !existing ||
        existing.lookbackDays !== 0 ||
        nextLastUid === 0 ||
        (!existing.enabled && body.enabled);
      if (shouldProbeBaseline) {
        if (effectivePassword) {
          try {
            const probed = await probeMailboxBaseline({
              host: body.host,
              port: body.port,
              secure: body.secure,
              email: body.email,
              password: effectivePassword,
              folder: body.folder || "INBOX",
            });
            nextLastUid = Math.max(nextLastUid, probed);
          } catch {
            if (!sameMailbox || (existing && existing.lookbackDays !== 0)) {
              nextLastUid = 0;
            }
          }
        } else {
          nextLastUid = 0;
        }
      }
    } else if (!sameMailbox || !existing || body.lookbackDays > existing.lookbackDays) {
      nextLastUid = 0;
    }

    const now = new Date().toISOString();
    await store.upsertMailAccount({
      userId: user.id,
      enabled: body.enabled,
      provider: body.provider,
      host: body.host,
      port: body.port,
      secure: body.secure,
      email: body.email,
      passwordEnc,
      folder: body.folder || "INBOX",
      pollIntervalMin: body.pollIntervalMin,
      lookbackDays: body.lookbackDays,
      lastUid: nextLastUid,
      llmEnabled: nextLlmEnabled,
      llmBaseUrl: nextLlmBaseUrl,
      llmModel: nextLlmModel,
      llmKeyEnc,
      lastSyncedAt: existing?.lastSyncedAt,
      lastError: existing?.lastError,
      lastMatchedCount: existing?.lastMatchedCount ?? 0,
      updatedAt: now,
    });

    return toPublicMailAccount(await store.getMailAccount(user.id));
  });

  app.put("/api/mail/llm-config", async (req) => {
    const user = await requireUser(req);
    const body = llmConfigSchema.parse(req.body);
    const existing = await store.getMailAccount(user.id);

    const llmKeyEnc =
      body.llmApiKey && body.llmApiKey.trim()
        ? encryptSecret(body.llmApiKey.trim(), masterKey)
        : existing?.llmKeyEnc || "";

    if (body.llmEnabled) {
      const endpoint = normalizeLlmEndpoint(body.llmBaseUrl);
      if (!endpoint) {
        throw new ApiError(400, "请填写有效的模型 API Base URL（以 https:// 开头）。", "INVALID_LLM_URL");
      }
      if (!body.llmModel.trim()) {
        throw new ApiError(400, "请填写模型名称（例如 deepseek-chat）。", "LLM_MODEL_REQUIRED");
      }
      if (!llmKeyEnc) {
        throw new ApiError(400, "启用大模型增强前请填写 API Key。", "LLM_KEY_REQUIRED");
      }
      const ssrf = await assertSafeLlmUrl(endpoint);
      if (!ssrf.ok) {
        throw new ApiError(400, ssrf.error, "LLM_URL_BLOCKED");
      }
    }

    const now = new Date().toISOString();
    await store.upsertMailAccount({
      userId: user.id,
      enabled: existing?.enabled ?? false,
      provider: existing?.provider ?? "qq",
      host: existing?.host ?? "",
      port: existing?.port ?? 993,
      secure: existing?.secure ?? true,
      email: existing?.email ?? "",
      passwordEnc: existing?.passwordEnc ?? "",
      folder: existing?.folder || "INBOX",
      pollIntervalMin: existing?.pollIntervalMin ?? 10,
      lookbackDays: existing?.lookbackDays ?? 7,
      lastUid: existing?.lastUid ?? 0,
      llmEnabled: body.llmEnabled,
      llmBaseUrl: body.llmBaseUrl,
      llmModel: body.llmModel,
      llmKeyEnc,
      lastSyncedAt: existing?.lastSyncedAt,
      lastError: existing?.lastError,
      lastMatchedCount: existing?.lastMatchedCount ?? 0,
      updatedAt: now,
    });

    return toPublicMailAccount(await store.getMailAccount(user.id));
  });

  app.post("/api/mail/test-llm", async (req) => {
    const user = await requireUser(req);
    await enforceLimit(`llm-test:${user.id}`, 12, 10 * 60_000);
    const body = z
      .object({
        baseUrl: z.string().trim().min(4, "请填写模型 API Base URL").max(240),
        model: z.string().trim().min(1, "请填写模型名称").max(100),
        apiKey: z.string().max(256).optional(),
      })
      .strict()
      .parse(req.body);

    let apiKey = body.apiKey?.trim() || "";
    if (!apiKey) {
      const existing = await store.getMailAccount(user.id);
      if (!existing?.llmKeyEnc) {
        throw new ApiError(400, "请先填写 API Key 再测试连通性。", "LLM_KEY_REQUIRED");
      }
      apiKey = decryptSecret(existing.llmKeyEnc, masterKey);
    }

    const res = await testLlmConnection({
      baseUrl: body.baseUrl,
      model: body.model,
      apiKey,
    });
    if (!res.ok) {
      throw new ApiError(400, res.error, "LLM_TEST_FAILED");
    }
    return res;
  });

  app.delete("/api/mail/config", async (req) => {
    const user = await requireUser(req);
    await store.deleteMailAccount(user.id);
    return toPublicMailAccount(null);
  });

  app.post("/api/mail/test", async (req) => {
    const user = await requireUser(req);
    await enforceLimit(`mail-test:${user.id}`, 12, 10 * 60_000);
    const body = z
      .object({
        host: z.string().trim().min(3).max(160),
        port: z.number().int().min(1).max(65535).default(993),
        secure: z.boolean().default(true),
        email: z.string().trim().min(3).max(160),
        password: z.string().max(256).optional(),
        folder: z.string().trim().max(64).default("INBOX"),
      })
      .strict()
      .parse(req.body);

    let password = body.password?.trim() || "";
    if (!password) {
      const existing = await store.getMailAccount(user.id);
      if (!existing?.passwordEnc) {
        throw new ApiError(400, "请填写邮箱 IMAP 授权码后再测试。", "PASSWORD_REQUIRED");
      }
      password = decryptSecret(existing.passwordEnc, masterKey);
    }

    const res = await testImapConnection({
      host: body.host,
      port: body.port,
      secure: body.secure,
      email: body.email,
      password,
      folder: body.folder,
    });
    if (!res.ok) {
      throw new ApiError(400, res.error, "IMAP_TEST_FAILED");
    }
    return res;
  });

  app.post("/api/mail/sync", async (req) => {
    const user = await requireUser(req);
    await enforceLimit(`mail-sync:${user.id}`, 10, 5 * 60_000);
    try {
      const summary = await syncUserMailbox(store, user.id, masterKey);
      return {
        summary,
        config: toPublicMailAccount(await store.getMailAccount(user.id)),
        events: await store.listEvents(user.id),
      };
    } catch (err) {
      throw new ApiError(
        400,
        err instanceof Error ? err.message : "邮箱同步失败。",
        "MAIL_SYNC_FAILED",
      );
    }
  });

  app.post("/api/mail/parse-preview", async (req) => {
    const user = await requireUser(req);
    const body = z
      .object({
        subject: z.string().max(300).default(""),
        from: z.string().max(200).default(""),
        text: z.string().trim().min(5, "请粘贴邮件内容").max(20000),
        createEvent: z.boolean().default(false),
      })
      .strict()
      .parse(req.body);

    const account = await store.getMailAccount(user.id);
    let llm = null;
    if (account?.llmEnabled && account.llmBaseUrl && account.llmModel && account.llmKeyEnc) {
      try {
        llm = {
          baseUrl: account.llmBaseUrl,
          model: account.llmModel,
          apiKey: decryptSecret(account.llmKeyEnc, masterKey),
        };
      } catch {
        llm = null;
      }
    }

    const parsed = await parseRecruitmentEmail(
      {
        subject: body.subject,
        from: body.from,
        text: body.text,
        date: new Date(),
      },
      llm,
    );

    const records = await store.listRecords(user.id);
    const inferred = parsed.matched
      ? inferRecordForEmail(records, parsed.company, parsed.position)
      : { matchType: "none" as const };
    const matchedRecord = inferred.record;
    const matchedRecordSummary = matchedRecord
      ? {
          id: matchedRecord.id,
          company: matchedRecord.company,
          position: matchedRecord.position,
          matchType: inferred.matchType,
        }
      : null;

    if (!body.createEvent || !parsed.matched) {
      return { parsed, matchedRecord: matchedRecordSummary, event: null, merged: false };
    }

    const now = new Date().toISOString();
    const company = matchedRecord?.company || parsed.company;
    const position = parsed.position || matchedRecord?.position || "";
    const timeMode: EventTimeMode = parsed.timeMode || (parsed.startAt ? "scheduled" : "flexible");
    const startAt = parsed.startAt || now;
    const endAt =
      timeMode === "scheduled"
        ? parsed.endAt || new Date(Date.parse(startAt) + 60 * 60_000).toISOString()
        : undefined;

    const existingEvents = await store.listEvents(user.id);
    const dup = findDuplicateEmailEvent(existingEvents, {
      company,
      position,
      kind: parsed.kind,
      startAt,
      timeMode,
    });
    if (dup) {
      const { merged: updatedEv, changed } = mergeDuplicateEvent(
        dup,
        {
          recordId: matchedRecord?.id,
          company,
          position,
          stageName: parsed.stageName,
          startAt,
          endAt,
          timeMode,
          location: parsed.location,
          mailSubject: body.subject.slice(0, 280) || undefined,
          mailSnippet: parsed.snippet,
        },
        now,
      );
      if (changed) {
        await store.updateEvent(user.id, updatedEv);
      }
      return { parsed, matchedRecord: matchedRecordSummary, event: updatedEv, merged: true };
    }

    const event: ScheduleEvent = {
      id: randomUUID(),
      userId: user.id,
      recordId: matchedRecord?.id,
      company,
      position,
      stageName: parsed.stageName,
      title: buildEventTitle(company, position, parsed.stageName),
      kind: parsed.kind,
      startAt,
      endAt,
      timeMode,
      location: parsed.location,
      source: "email",
      mailSubject: body.subject.slice(0, 280) || undefined,
      mailFrom: body.from.slice(0, 180) || undefined,
      mailSnippet: parsed.snippet,
      status: "confirmed",
      syncedToRecord: false,
      notes: "",
      createdAt: now,
      updatedAt: now,
    };
    await store.insertEvent(user.id, event);
    return { parsed, matchedRecord: matchedRecordSummary, event, merged: false };
  });

  // ===== Interview Notes (面经记录) =====
  app.get("/api/notes", async (req) => {
    const user = await requireUser(req);
    return { items: await store.listNotes(user.id) };
  });

  app.post("/api/notes", async (req, reply) => {
    const user = await requireUser(req);
    const body = createNoteSchema.parse(req.body);
    const now = new Date().toISOString();
    const note: InterviewNote = {
      id: randomUUID(),
      userId: user.id,
      recordId: body.recordId || undefined,
      company: body.company,
      position: body.position || "",
      stageName: body.stageName,
      interviewedAt: body.interviewedAt?.trim() || now.slice(0, 10),
      feeling: body.feeling,
      content: body.content,
      createdAt: now,
      updatedAt: now,
    };
    await store.insertNote(user.id, note);
    reply.status(201);
    return note;
  });

  app.patch("/api/notes/:id", async (req) => {
    const user = await requireUser(req);
    const { id } = req.params as { id: string };
    const existing = await store.getNote(id, user.id);
    if (!existing) throw new ApiError(404, "未找到该面经记录。", "NOT_FOUND");
    const body = updateNoteSchema.parse(req.body);
    const updated: InterviewNote = {
      ...existing,
      recordId: body.recordId === undefined ? existing.recordId : body.recordId || undefined,
      company: body.company ?? existing.company,
      position: body.position ?? existing.position,
      stageName: body.stageName ?? existing.stageName,
      interviewedAt:
        body.interviewedAt === undefined
          ? existing.interviewedAt
          : body.interviewedAt || undefined,
      feeling: body.feeling ?? existing.feeling,
      content: body.content ?? existing.content,
      updatedAt: new Date().toISOString(),
    };
    await store.updateNote(user.id, updated);
    return updated;
  });

  app.delete("/api/notes/:id", async (req) => {
    const user = await requireUser(req);
    const { id } = req.params as { id: string };
    const ok = await store.deleteNote(id, user.id);
    if (!ok) throw new ApiError(404, "未找到该面经记录。", "NOT_FOUND");
    return { ok: true };
  });

  if (existsSync(staticRoot)) {
    await app.register(staticFiles, {
      root: staticRoot,
      prefix: "/",
      setHeaders(res, filePath) {
        const normalized = filePath.replace(/\\/g, "/");
        if (normalized.includes("/assets/")) {
          res.header("Cache-Control", "public, max-age=31536000, immutable");
        } else {
          res.header("Cache-Control", "no-store, no-cache, must-revalidate");
          res.header("Pragma", "no-cache");
        }
      },
    });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api/")) {
        return reply.status(404).send({ error: "接口不存在。", code: "NOT_FOUND" });
      }
      return reply
        .header("Cache-Control", "no-store, no-cache, must-revalidate")
        .header("Pragma", "no-cache")
        .sendFile("index.html");
    });
  }

  return app;
}
