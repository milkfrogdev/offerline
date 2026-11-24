import { randomUUID } from "node:crypto";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { getCompanyGroup, normalizeCompanyName } from "../shared/companies.js";
import { isRecordTerminated } from "../shared/stages.js";
import type { ApplicationRecord, EventTimeMode, ScheduleEvent } from "../shared/types.js";
import {
  buildEventTitle,
  parseRecruitmentEmail,
  type LlmEnhancerConfig,
} from "./mail-parser.js";
import { decryptSecret, sha256Hex } from "./security.js";
import type { Store } from "./store.js";

export interface ImapCredentials {
  host: string;
  port: number;
  secure: boolean;
  email: string;
  password: string;
  folder?: string;
}

export interface SyncSummary {
  scanned: number;
  created: number;
  merged: number;
  skipped: number;
  lastUid: number;
  syncedAt: string;
}

export type RecordMatchType = "exact" | "company_sole_active" | "group_sole_active" | "none";

export interface RecordInferenceResult {
  record?: ApplicationRecord;
  matchType: RecordMatchType;
}

function createImapClient(creds: ImapCredentials, timeoutMs?: number) {
  return new ImapFlow({
    host: creds.host,
    port: creds.port,
    secure: creds.secure,
    auth: {
      user: creds.email,
      pass: creds.password,
    },
    logger: false,
    connectionTimeout: timeoutMs ?? 12_000,
    greetingTimeout: timeoutMs ?? 10_000,
    socketTimeout: timeoutMs ?? 25_000,
  });
}

async function readLockedMailboxBaselineUid(client: ImapFlow): Promise<number> {
  const mb = client.mailbox && typeof client.mailbox === "object" ? client.mailbox : null;
  if (mb && typeof mb.uidNext === "number" && Number.isFinite(mb.uidNext) && mb.uidNext > 1) {
    return mb.uidNext - 1;
  }
  if (mb && typeof mb.exists === "number" && mb.exists > 0) {
    const latest = await client.fetchOne(String(mb.exists), { uid: true });
    if (latest && typeof latest.uid === "number" && latest.uid > 0) {
      return latest.uid;
    }
  }
  return 0;
}

export async function probeMailboxBaselineUid(
  creds: ImapCredentials,
  timeoutMs = 4_000,
): Promise<number> {
  const client = createImapClient(creds, timeoutMs);
  try {
    await client.connect();
    const lock = await client.getMailboxLock(creds.folder || "INBOX", { readOnly: true });
    try {
      return await readLockedMailboxBaselineUid(client);
    } finally {
      lock.release();
    }
  } finally {
    try {
      await client.logout();
    } catch {
      client.close();
    }
  }
}

function formatImapError(err: unknown, host: string): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/auth|login|credentials|invalid|command failed/i.test(raw)) {
    if (/qq\.com/i.test(host)) {
      return "邮箱认证失败：QQ 邮箱需在网页端「设置 → 账号与安全 → 安全管理 → POP3/IMAP」开启 IMAP 服务，并填入 16 位授权码（非登录密码）。";
    }
    if (/163\.com|126\.com/i.test(host)) {
      return "邮箱认证失败：网易邮箱需开启 IMAP 服务并使用授权密码。";
    }
    if (/gmail\.com/i.test(host)) {
      return "邮箱认证失败：Gmail 需开启两步验证并生成 16 位应用专用密码。";
    }
    return `邮箱认证失败，请检查账号与 IMAP 授权码（${raw.slice(0, 120)}）。`;
  }
  if (/ENOTFOUND|EAI_AGAIN/i.test(raw)) {
    return `无法解析 IMAP 服务器地址 ${host}，请检查主机名。`;
  }
  if (/ETIMEDOUT|ECONNREFUSED|timeout/i.test(raw)) {
    return `连接 ${host} 超时或被拒绝，请检查端口（通常 SSL 为 993）与服务器出站网络。`;
  }
  return `连接失败：${raw.slice(0, 160)}`;
}

export async function testImapConnection(
  creds: ImapCredentials,
): Promise<{ ok: true; totalMessages: number } | { ok: false; error: string }> {
  const client = createImapClient(creds);
  try {
    await client.connect();
    const lock = await client.getMailboxLock(creds.folder || "INBOX", { readOnly: true });
    try {
      const total =
        client.mailbox && typeof client.mailbox === "object" ? client.mailbox.exists || 0 : 0;
      return { ok: true, totalMessages: total };
    } finally {
      lock.release();
    }
  } catch (err) {
    return { ok: false, error: formatImapError(err, creds.host) };
  } finally {
    try {
      await client.logout();
    } catch {
      client.close();
    }
  }
}

function isInProgressRecord(r: ApplicationRecord): boolean {
  return r.status === "active" && !isRecordTerminated(r.stages);
}

function positionOverlapScore(recordPos: string, mailPos: string): number {
  const a = recordPos.trim().toLowerCase();
  const b = mailPos.trim().toLowerCase();
  if (!a || !b || b === "待确认岗位") return 0;
  if (a === b) return 100;
  if (a.includes(b) || b.includes(a)) return 80;

  const tokenize = (s: string) =>
    s
      .replace(/[（()）【】\[\]\-—–_/，,、\s]+/g, " ")
      .split(" ")
      .map((t) => t.trim())
      .filter((t) => t.length >= 2 && !/^(?:20\d{2}届?|2\d届|校招|社招|秋招|春招|工程师|开发|研发)$/.test(t));

  const ta = tokenize(a);
  const tb = tokenize(b);
  if (!ta.length || !tb.length) return 0;

  let hits = 0;
  for (const w of tb) {
    if (ta.some((x) => x === w || x.includes(w) || w.includes(x))) hits++;
  }
  return hits > 0 ? Math.min(75, hits * 25) : 0;
}

/**
 * 智能推断邮件对应的投递记录（只读关联，绝不修改时间线）：
 * 1. 同公司（归一化简称对齐）+ 岗位重合匹配（优先进行中记录）；
 * 2. 若邮件未写岗位或岗位名有差异，但该公司仅有 1 条进行中流程，直接推断关联该流程；
 * 3. 若同公司无直接命中，按集团归属（如阿里云/阿里、抖音/字节、海思/华为）找唯一进行中流程；
 * 4. 同公司存在多条并行进行中流程且无法区分岗位时，宁可留空不乱关联。
 */
export function inferRecordForEmail(
  records: readonly ApplicationRecord[],
  company: string,
  position: string,
): RecordInferenceResult {
  const normCompany = (normalizeCompanyName(company) || company.trim()).toLowerCase();
  if (!normCompany || normCompany === "待确认公司") {
    return { matchType: "none" };
  }

  const sameCompany = records.filter((r) => {
    const rc = (normalizeCompanyName(r.company) || r.company.trim()).toLowerCase();
    return rc === normCompany || rc.includes(normCompany) || normCompany.includes(rc);
  });

  const activeSameCompany = sameCompany.filter(isInProgressRecord);

  // Tier 1: Same company + explicit position overlap (prefer active records)
  if (position && position.trim() && position.trim() !== "待确认岗位") {
    const scored = (activeSameCompany.length > 0 ? activeSameCompany : sameCompany)
      .map((r) => ({ record: r, score: positionOverlapScore(r.position, position) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);
    if (scored.length > 0) {
      return { record: scored[0].record, matchType: "exact" };
    }
  }

  // Tier 2: Same company has a sole active in-progress record (even if email omits position!)
  if (activeSameCompany.length === 1) {
    return { record: activeSameCompany[0], matchType: "company_sole_active" };
  }

  // If multiple active records exist in the same company and position didn't match, do not guess blindly
  if (activeSameCompany.length > 1) {
    return { matchType: "none" };
  }

  // Tier 3: Corporate group sole active record (e.g. 抖音/字节跳动, 阿里云/阿里巴巴, 海思/华为)
  const group = getCompanyGroup(company);
  if (group) {
    const activeSameGroup = records.filter(
      (r) => isInProgressRecord(r) && getCompanyGroup(r.company) === group,
    );
    if (position && position.trim()) {
      const groupScored = activeSameGroup
        .map((r) => ({ record: r, score: positionOverlapScore(r.position, position) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score);
      if (groupScored.length > 0) {
        return { record: groupScored[0].record, matchType: "exact" };
      }
    }
    if (activeSameGroup.length === 1) {
      return { record: activeSameGroup[0], matchType: "group_sole_active" };
    }
  }

  return { matchType: "none" };
}

export function matchRecordForEmail(
  records: readonly ApplicationRecord[],
  company: string,
  position: string,
): ApplicationRecord | undefined {
  return inferRecordForEmail(records, company, position).record;
}

/**
 * 语义去重：同一场考试/面试由平台连发多封提醒邮件时，定位已有日程并合并缺失字段，避免重复创建卡片。
 */
export function findDuplicateEmailEvent(
  existingEvents: readonly ScheduleEvent[],
  candidate: {
    company: string;
    position: string;
    kind: ScheduleEvent["kind"];
    startAt: string;
    timeMode: EventTimeMode;
  },
): ScheduleEvent | undefined {
  const normCompany = (normalizeCompanyName(candidate.company) || candidate.company.trim()).toLowerCase();
  const candStartMs = Date.parse(candidate.startAt);
  if (!normCompany || Number.isNaN(candStartMs)) return undefined;

  for (const ev of existingEvents) {
    if (ev.status === "dismissed") continue;
    if (ev.kind !== candidate.kind) continue;

    const evCompany = (normalizeCompanyName(ev.company) || ev.company.trim()).toLowerCase();
    if (evCompany !== normCompany) continue;

    const evStartMs = Date.parse(ev.startAt);
    if (Number.isNaN(evStartMs)) continue;
    const evMode: EventTimeMode = ev.timeMode || "scheduled";

    // Case A: Both have explicit scheduled clock time within ±30 minutes -> exact same session reminder
    if (candidate.timeMode === "scheduled" && evMode === "scheduled") {
      if (Math.abs(evStartMs - candStartMs) <= 30 * 60_000) {
        return ev;
      }
      continue;
    }

    // Case B: Unscheduled / deadline reminders (e.g. online assessment or offer intent) within 10 days
    if (candidate.timeMode !== "scheduled" && evMode !== "scheduled") {
      if (Math.abs(evStartMs - candStartMs) <= 10 * 86400_000) {
        const sameOrEmptyPos =
          !ev.position ||
          !candidate.position ||
          positionOverlapScore(ev.position, candidate.position) > 0;
        if (sameOrEmptyPos) return ev;
      }
    }
  }
  return undefined;
}

export function mergeDuplicateEvent(
  existing: ScheduleEvent,
  incoming: {
    recordId?: string;
    company: string;
    position: string;
    stageName?: string;
    startAt: string;
    endAt?: string;
    timeMode: EventTimeMode;
    location?: string;
    mailSubject?: string;
    mailSnippet?: string;
  },
  nowIso: string,
): { merged: ScheduleEvent; changed: boolean } {
  let changed = false;
  const next: ScheduleEvent = { ...existing };

  if (!next.recordId && incoming.recordId) {
    next.recordId = incoming.recordId;
    changed = true;
  }
  if (!next.position && incoming.position) {
    next.position = incoming.position;
    changed = true;
  }
  if (!next.location && incoming.location) {
    next.location = incoming.location;
    changed = true;
  }
  if (!next.endAt && incoming.endAt) {
    next.endAt = incoming.endAt;
    changed = true;
  }
  // Upgrade flexible -> deadline if reminder mail supplies explicit deadline
  if (next.timeMode === "flexible" && incoming.timeMode === "deadline") {
    next.timeMode = "deadline";
    next.startAt = incoming.startAt;
    changed = true;
  }
  // Upgrade generic "面试" -> explicit round ("二面") if reminder adds round info
  if (next.stageName === "面试" && incoming.stageName && incoming.stageName !== "面试") {
    next.stageName = incoming.stageName;
    changed = true;
  }

  if (changed) {
    next.title = buildEventTitle(next.company, next.position, next.stageName || "面试");
    next.updatedAt = nowIso;
  }
  return { merged: next, changed };
}

function extractIcsFromParsedMail(
  parsedMail: Awaited<ReturnType<typeof simpleParser>>,
  rawSource: Buffer,
): string | undefined {
  for (const att of parsedMail.attachments || []) {
    const isIcs =
      /calendar/i.test(att.contentType || "") || /\.ics$/i.test(att.filename || "");
    if (isIcs && att.content) {
      return att.content.toString("utf8").slice(0, 6000);
    }
  }
  const rawStr = rawSource.toString("utf8");
  const idx = rawStr.search(/BEGIN:VCALENDAR/i);
  if (idx >= 0) {
    return rawStr.slice(idx, idx + 4000);
  }
  return undefined;
}

export async function syncUserMailbox(
  store: Store,
  userId: number,
  masterKey: Buffer,
): Promise<SyncSummary> {
  const account = await store.getMailAccount(userId);
  if (!account || !account.host || !account.email || !account.passwordEnc) {
    throw new Error("请先保存邮箱 IMAP 连接配置。");
  }

  let password: string;
  try {
    password = decryptSecret(account.passwordEnc, masterKey);
  } catch {
    throw new Error("邮箱授权码解密失败，请重新填写授权码并保存。");
  }

  let llmConfig: LlmEnhancerConfig | null = null;
  if (account.llmEnabled && account.llmBaseUrl && account.llmModel && account.llmKeyEnc) {
    try {
      llmConfig = {
        baseUrl: account.llmBaseUrl,
        model: account.llmModel,
        apiKey: decryptSecret(account.llmKeyEnc, masterKey),
      };
    } catch {
      llmConfig = null;
    }
  }

  const client = createImapClient({
    host: account.host,
    port: account.port,
    secure: account.secure,
    email: account.email,
    password,
    folder: account.folder || "INBOX",
  });

  const nowIso = new Date().toISOString();
  let scanned = 0;
  let created = 0;
  let merged = 0;
  let skipped = 0;
  let maxUid = account.lastUid || 0;

  try {
    await client.connect();
    // Always open mailbox strictly read-only (IMAP EXAMINE) so unread flags are never altered
    const lock = await client.getMailboxLock(account.folder || "INBOX", { readOnly: true });
    try {
      // lookbackDays === 0 means listen strictly from current moment onward without fetching historical mail
      if (account.lastUid === 0 && account.lookbackDays <= 0) {
        const baselineUid = await readLockedMailboxBaselineUid(client);
        await store.updateMailSyncState(userId, {
          lastUid: baselineUid,
          lastSyncedAt: nowIso,
          lastError: null,
          lastMatchedCount: 0,
        });
        return { scanned: 0, created: 0, merged: 0, skipped: 0, lastUid: baselineUid, syncedAt: nowIso };
      }

      const records = await store.listRecords(userId);
      const existingEvents = await store.listEvents(userId);
      const sinceDate = new Date(Date.now() - Math.max(1, account.lookbackDays) * 86400_000);
      const searchQuery =
        account.lastUid > 0
          ? { uid: `${account.lastUid + 1}:*` }
          : { since: sinceDate };

      const uidsRaw = await client.search(searchQuery, { uid: true });
      const uids = Array.isArray(uidsRaw)
        ? uidsRaw.filter((u) => u > account.lastUid).slice(-120)
        : [];
      if (uids.length === 0 && account.lastUid === 0) {
        maxUid = await readLockedMailboxBaselineUid(client);
      }

      for (const uid of uids) {
        if (uid > maxUid) maxUid = uid;
        const msg = await client.fetchOne(
          uid,
          { uid: true, envelope: true, source: true },
          { uid: true },
        );
        if (!msg || !msg.source) continue;
        scanned++;

        const parsedMail = await simpleParser(msg.source);
        const rawMessageId =
          parsedMail.messageId ||
          `${account.email}:${uid}:${parsedMail.date?.toISOString() || ""}`;
        const messageHash = sha256Hex(rawMessageId);

        if (await store.hasProcessedMail(userId, messageHash)) {
          skipped++;
          continue;
        }

        const fromText = parsedMail.from?.text || "";
        const subjectText = parsedMail.subject || "";
        const htmlStr = typeof parsedMail.html === "string" ? parsedMail.html : undefined;
        const icsText = extractIcsFromParsedMail(parsedMail, msg.source);

        const extracted = await parseRecruitmentEmail(
          {
            subject: subjectText,
            from: fromText,
            text: parsedMail.text || "",
            html: htmlStr,
            icsText,
            date: parsedMail.date || new Date(),
          },
          llmConfig,
        );

        await store.markMailProcessed(userId, messageHash, nowIso);

        if (!extracted.matched) {
          skipped++;
          continue;
        }

        const inferred = inferRecordForEmail(records, extracted.company, extracted.position);
        const matchedRecord = inferred.record;
        const company = matchedRecord?.company || extracted.company;
        const position = extracted.position || matchedRecord?.position || "";
        const timeMode: EventTimeMode = extracted.timeMode || (extracted.startAt ? "scheduled" : "flexible");
        const startAt =
          extracted.startAt ||
          (parsedMail.date ? parsedMail.date.toISOString() : nowIso);
        const endAt =
          timeMode === "scheduled"
            ? extracted.endAt || new Date(Date.parse(startAt) + 60 * 60_000).toISOString()
            : undefined;

        const dup = findDuplicateEmailEvent(existingEvents, {
          company,
          position,
          kind: extracted.kind,
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
              stageName: extracted.stageName,
              startAt,
              endAt,
              timeMode,
              location: extracted.location,
              mailSubject: subjectText.slice(0, 280),
              mailSnippet: extracted.snippet,
            },
            nowIso,
          );
          if (changed) {
            await store.updateEvent(userId, updatedEv);
            const idx = existingEvents.findIndex((x) => x.id === updatedEv.id);
            if (idx !== -1) existingEvents[idx] = updatedEv;
          }
          merged++;
          continue;
        }

        const event: ScheduleEvent = {
          id: randomUUID(),
          userId,
          recordId: matchedRecord?.id,
          company,
          position,
          stageName: extracted.stageName,
          title: buildEventTitle(company, position, extracted.stageName),
          kind: extracted.kind,
          startAt,
          endAt,
          timeMode,
          location: extracted.location,
          source: "email",
          mailMessageId: rawMessageId.slice(0, 240),
          mailSubject: subjectText.slice(0, 280),
          mailFrom: fromText.slice(0, 180),
          mailSnippet: extracted.snippet,
          status: "pending_confirm",
          syncedToRecord: false,
          notes: "",
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        await store.insertEvent(userId, event);
        existingEvents.push(event);
        created++;
      }

      await store.updateMailSyncState(userId, {
        lastUid: maxUid,
        lastSyncedAt: nowIso,
        lastError: null,
        lastMatchedCount: created,
      });

      return { scanned, created, merged, skipped, lastUid: maxUid, syncedAt: nowIso };
    } finally {
      lock.release();
    }
  } catch (err) {
    const message = formatImapError(err, account.host);
    await store.updateMailSyncState(userId, {
      lastSyncedAt: nowIso,
      lastError: message,
    });
    throw new Error(message);
  } finally {
    try {
      await client.logout();
    } catch {
      client.close();
    }
  }
}

export function startMailScheduler(store: Store, masterKey: Buffer): () => void {
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const accounts = await store.listEnabledMailAccounts();
      const now = Date.now();
      for (const acc of accounts) {
        const intervalMs = Math.max(1, acc.pollIntervalMin || 10) * 60_000;
        const lastMs = acc.lastSyncedAt ? Date.parse(acc.lastSyncedAt) : 0;
        if (lastMs && now - lastMs + 3_000 < intervalMs) continue;
        try {
          await syncUserMailbox(store, acc.userId, masterKey);
        } catch {
          // 错误已记录到 last_error，不中断其他用户同步
        }
      }
    } catch {
      // 忽略单次调度异常
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => {
    void tick();
  }, 30_000);
  timer.unref();

  return () => clearInterval(timer);
}
