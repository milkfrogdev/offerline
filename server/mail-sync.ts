import { randomUUID } from "node:crypto";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type { ApplicationRecord, ScheduleEvent } from "../shared/types.js";
import { parseRecruitmentEmail, type LlmEnhancerConfig } from "./mail-parser.js";
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
  skipped: number;
  lastUid: number;
  syncedAt: string;
}

function createImapClient(creds: ImapCredentials) {
  return new ImapFlow({
    host: creds.host,
    port: creds.port,
    secure: creds.secure,
    auth: {
      user: creds.email,
      pass: creds.password,
    },
    logger: false,
    connectionTimeout: 12_000,
    greetingTimeout: 10_000,
    socketTimeout: 25_000,
  });
}

function formatImapError(err: unknown, host: string): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/auth|login|credentials|invalid|command failed/i.test(raw)) {
    if (/qq\.com/i.test(host)) {
      return "邮箱认证失败：QQ 邮箱需在网页端「设置 → 账户」开启 IMAP 服务，并填入 16 位授权码（非登录密码）。";
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
    const lock = await client.getMailboxLock(creds.folder || "INBOX");
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

export function matchRecordForEmail(
  records: readonly ApplicationRecord[],
  company: string,
  position: string,
): ApplicationRecord | undefined {
  const normCompany = company.trim().toLowerCase();
  if (!normCompany || normCompany === "待确认公司") return undefined;

  const sameCompany = records.filter((r) => {
    const rc = r.company.trim().toLowerCase();
    return rc === normCompany || rc.includes(normCompany) || normCompany.includes(rc);
  });
  if (!sameCompany.length) return undefined;
  if (sameCompany.length === 1) return sameCompany[0];

  const normPos = position.trim().toLowerCase();
  if (normPos && normPos !== "待确认岗位") {
    const posMatch = sameCompany.find((r) => {
      const rp = r.position.trim().toLowerCase();
      return rp.includes(normPos) || normPos.includes(rp);
    });
    if (posMatch) return posMatch;
  }
  return sameCompany.find((r) => r.status === "active") || sameCompany[0];
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
  let skipped = 0;
  let maxUid = account.lastUid || 0;

  try {
    await client.connect();
    const lock = await client.getMailboxLock(account.folder || "INBOX");
    try {
      const records = await store.listRecords(userId);
      const sinceDate = new Date(Date.now() - Math.max(1, account.lookbackDays) * 86400_000);
      const searchQuery =
        account.lastUid > 0
          ? { uid: `${account.lastUid + 1}:*` }
          : { since: sinceDate };

      const uidsRaw = await client.search(searchQuery, { uid: true });
      const uids = Array.isArray(uidsRaw) ? uidsRaw.filter((u) => u > account.lastUid).slice(-60) : [];

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
        const plainText =
          parsedMail.text ||
          (typeof parsedMail.html === "string"
            ? parsedMail.html.replace(/<[^>]+>/g, " ")
            : "");

        const extracted = await parseRecruitmentEmail(
          {
            subject: subjectText,
            from: fromText,
            text: plainText,
            date: parsedMail.date || new Date(),
          },
          llmConfig,
        );

        await store.markMailProcessed(userId, messageHash, nowIso);

        if (!extracted.matched) {
          skipped++;
          continue;
        }

        const matchedRecord = matchRecordForEmail(records, extracted.company, extracted.position);
        const startAt =
          extracted.startAt ||
          (parsedMail.date ? parsedMail.date.toISOString() : nowIso);
        const endAt =
          extracted.endAt ||
          new Date(Date.parse(startAt) + 60 * 60_000).toISOString();

        const event: ScheduleEvent = {
          id: randomUUID(),
          userId,
          recordId: matchedRecord?.id,
          company: matchedRecord?.company || extracted.company,
          position:
            extracted.position !== "待确认岗位"
              ? extracted.position
              : matchedRecord?.position || "",
          stageName: extracted.stageName,
          title: extracted.title,
          kind: extracted.kind,
          startAt,
          endAt,
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
        created++;
      }

      await store.updateMailSyncState(userId, {
        lastUid: maxUid,
        lastSyncedAt: nowIso,
        lastError: null,
        lastMatchedCount: created,
      });

      return { scanned, created, skipped, lastUid: maxUid, syncedAt: nowIso };
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
        const intervalMs = Math.max(5, acc.pollIntervalMin || 10) * 60_000;
        const lastMs = acc.lastSyncedAt ? Date.parse(acc.lastSyncedAt) : 0;
        if (lastMs && now - lastMs < intervalMs) continue;
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
  }, 60_000);
  timer.unref();

  return () => clearInterval(timer);
}
