import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import staticFiles from "@fastify/static";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
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
  PRIORITY_LEVELS,
  STAGE_STATUSES,
  type ApplicationRecord,
  type Stage,
  type StageStatus,
  type UserProfile,
} from "../shared/types.js";
import {
  hashPassword,
  randomToken,
  sanitizeExternalUrl,
  sha256Hex,
  verifyPassword,
} from "./security.js";
import type { Store } from "./store.js";

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

export type AppOptions = {
  store: Store;
  origin: string;
  production?: boolean;
  allowHttp?: boolean;
  registrationOpen?: boolean;
  staticRoot?: string;
};

export async function buildApp({
  store,
  origin,
  production = false,
  allowHttp = false,
  registrationOpen = true,
  staticRoot = resolve("dist/web"),
}: AppOptions) {
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

  const app = Fastify({
    logger: false,
    bodyLimit: 1_048_576,
    trustProxy: secure ? (_addr: string, hop: number) => hop === 0 : false,
    requestTimeout: 15_000,
  });

  await app.register(cookie);
  const cookieName = secure ? "__Host-offerline" : production ? "offerline-http" : "offerline-dev";
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
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'",
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
    const status = err.statusCode && err.statusCode >= 400 && err.statusCode < 500 ? err.statusCode : 500;
    return reply.status(status).send({
      error: status === 413 ? "提交内容过大。" : status === 400 ? "请求格式不正确。" : "服务暂时不可用。",
      code: "SERVER_ERROR",
    });
  });

  app.get("/api/health", async () => {
    await store.ping();
    return { ok: true };
  });

  app.get("/api/session", async (req) => ({
    user: await currentUser(req),
    registrationOpen,
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

  if (existsSync(staticRoot)) {
    await app.register(staticFiles, { root: staticRoot, prefix: "/" });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api/")) {
        return reply.status(404).send({ error: "接口不存在。", code: "NOT_FOUND" });
      }
      return reply.sendFile("index.html");
    });
  }

  return app;
}
