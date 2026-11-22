import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import mysql, { type Pool, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import { normalizeStage } from "../shared/stages.js";
import type {
  ApplicationRecord,
  EncryptedEnvelope,
  EventKind,
  EventStatus,
  EventTimeMode,
  InterviewNote,
  MailAccountPublic,
  MailProvider,
  NoteFeeling,
  ScheduleEvent,
  Stage,
  UserProfile,
} from "../shared/types.js";

export type StoredUser = UserProfile & { passwordHash: string; calendarToken?: string };

export interface StoredMailAccount {
  userId: number;
  enabled: boolean;
  provider: MailProvider;
  host: string;
  port: number;
  secure: boolean;
  email: string;
  passwordEnc: string;
  folder: string;
  pollIntervalMin: number;
  lookbackDays: number;
  lastUid: number;
  llmEnabled: boolean;
  llmBaseUrl: string;
  llmModel: string;
  llmKeyEnc: string;
  lastSyncedAt?: string;
  lastError?: string;
  lastMatchedCount: number;
  updatedAt: string;
}

export function toPublicMailAccount(row: StoredMailAccount | null): MailAccountPublic {
  if (!row) {
    return {
      configured: false,
      enabled: false,
      provider: "qq",
      host: "imap.qq.com",
      port: 993,
      secure: true,
      email: "",
      hasPassword: false,
      folder: "INBOX",
      pollIntervalMin: 10,
      lookbackDays: 7,
      llmEnabled: false,
      llmBaseUrl: "",
      llmModel: "",
      hasLlmKey: false,
      lastMatchedCount: 0,
    };
  }
  return {
    configured: Boolean(row.host && row.email && row.passwordEnc),
    enabled: row.enabled,
    provider: row.provider,
    host: row.host,
    port: row.port,
    secure: row.secure,
    email: row.email,
    hasPassword: Boolean(row.passwordEnc),
    folder: row.folder || "INBOX",
    pollIntervalMin: row.pollIntervalMin,
    lookbackDays: row.lookbackDays,
    llmEnabled: row.llmEnabled,
    llmBaseUrl: row.llmBaseUrl,
    llmModel: row.llmModel,
    hasLlmKey: Boolean(row.llmKeyEnc),
    lastSyncedAt: row.lastSyncedAt,
    lastError: row.lastError,
    lastMatchedCount: row.lastMatchedCount,
  };
}

export interface Store {
  ping(): Promise<void>;
  close(): Promise<void>;

  getUserByUsername(username: string): Promise<StoredUser | null>;
  getUserById(id: number): Promise<StoredUser | null>;
  getUserByCalendarToken(token: string): Promise<StoredUser | null>;
  createUser(username: string, passwordHash: string, role?: "user" | "admin"): Promise<StoredUser>;
  updateUserPassword(userId: number, passwordHash: string): Promise<void>;
  setUserCalendarToken(userId: number, token: string): Promise<void>;

  createSession(tokenHash: string, userId: number, expiresAt: string, createdAt: string): Promise<void>;
  findSessionUser(tokenHash: string, nowIso: string): Promise<UserProfile | null>;
  deleteSession(tokenHash: string): Promise<void>;
  deleteUserSessions(userId: number): Promise<void>;

  checkRateLimit(limitKey: string, max: number, windowMs: number): Promise<boolean>;

  listRecords(userId: number): Promise<ApplicationRecord[]>;
  getRecord(id: string, userId: number): Promise<ApplicationRecord | null>;
  insertRecord(userId: number, record: ApplicationRecord): Promise<void>;
  updateRecord(userId: number, record: ApplicationRecord): Promise<void>;
  deleteRecord(id: string, userId: number): Promise<boolean>;
  pinCompany(userId: number, company: string, pinned: boolean): Promise<number>;
  visitCompany(userId: number, company: string, visitedAt: string): Promise<number>;
  visitRecord(userId: number, id: string, visitedAt: string): Promise<boolean>;
  importRecords(userId: number, items: ApplicationRecord[], mode: "merge" | "overwrite"): Promise<number>;

  // Schedule events
  listEvents(userId: number): Promise<ScheduleEvent[]>;
  getEvent(id: string, userId: number): Promise<ScheduleEvent | null>;
  insertEvent(userId: number, event: ScheduleEvent): Promise<void>;
  updateEvent(userId: number, event: ScheduleEvent): Promise<void>;
  deleteEvent(id: string, userId: number): Promise<boolean>;

  // Interview notes
  listNotes(userId: number): Promise<InterviewNote[]>;
  getNote(id: string, userId: number): Promise<InterviewNote | null>;
  insertNote(userId: number, note: InterviewNote): Promise<void>;
  updateNote(userId: number, note: InterviewNote): Promise<void>;
  deleteNote(id: string, userId: number): Promise<boolean>;

  // Mail listener
  getMailAccount(userId: number): Promise<StoredMailAccount | null>;
  listEnabledMailAccounts(): Promise<StoredMailAccount[]>;
  upsertMailAccount(account: StoredMailAccount): Promise<void>;
  updateMailSyncState(
    userId: number,
    patch: { lastUid?: number; lastSyncedAt: string; lastError?: string | null; lastMatchedCount?: number },
  ): Promise<void>;
  deleteMailAccount(userId: number): Promise<void>;
  hasProcessedMail(userId: number, messageId: string): Promise<boolean>;
  markMailProcessed(userId: number, messageId: string, processedAt: string): Promise<void>;
}

function normalizeRow(row: Record<string, unknown>): ApplicationRecord {
  const parsed =
    typeof row.stages === "string" ? (JSON.parse(row.stages) as Stage[]) : (row.stages as Stage[]);
  let sealed: EncryptedEnvelope | undefined;
  if (row.sealed) {
    try {
      sealed =
        typeof row.sealed === "string"
          ? (JSON.parse(row.sealed) as EncryptedEnvelope)
          : (row.sealed as EncryptedEnvelope);
    } catch {
      sealed = undefined;
    }
  }
  return {
    id: String(row.id),
    userId: Number(row.user_id ?? row.userId),
    company: String(row.company),
    position: String(row.position),
    stages: (parsed || []).map((s, i) => normalizeStage(s, i)),
    status: row.status === "archived" ? "archived" : "active",
    url: row.url ? String(row.url) : undefined,
    city: row.city ? String(row.city) : undefined,
    salary: row.salary ? String(row.salary) : undefined,
    source: row.source ? String(row.source) : undefined,
    priority: row.priority === "high" || row.priority === "low" ? row.priority : "normal",
    nextFollowUpAt: (row.next_follow_up_at ?? row.nextFollowUpAt)
      ? String(row.next_follow_up_at ?? row.nextFollowUpAt)
      : undefined,
    lastVisitedAt: (row.last_visited_at ?? row.lastVisitedAt)
      ? String(row.last_visited_at ?? row.lastVisitedAt)
      : undefined,
    pinned: Boolean(row.pinned),
    notes: row.notes ? String(row.notes) : "",
    sealed,
    createdAt: String(row.created_at ?? row.createdAt),
    updatedAt: String(row.updated_at ?? row.updatedAt),
  };
}

function normalizeEvent(row: Record<string, unknown>): ScheduleEvent {
  const kind = String(row.kind || "interview") as EventKind;
  const status = String(row.status || "confirmed") as EventStatus;
  const rawMode = String(row.time_mode ?? row.timeMode ?? "scheduled");
  const timeMode: EventTimeMode =
    rawMode === "deadline" || rawMode === "flexible" ? rawMode : "scheduled";
  return {
    id: String(row.id),
    userId: Number(row.user_id ?? row.userId),
    recordId: (row.record_id ?? row.recordId) ? String(row.record_id ?? row.recordId) : undefined,
    company: String(row.company),
    position: String(row.position || ""),
    stageName: (row.stage_name ?? row.stageName) ? String(row.stage_name ?? row.stageName) : undefined,
    title: String(row.title),
    kind,
    startAt: String(row.start_at ?? row.startAt),
    endAt: (row.end_at ?? row.endAt) ? String(row.end_at ?? row.endAt) : undefined,
    timeMode,
    location: row.location ? String(row.location) : undefined,
    source: row.source === "email" ? "email" : "manual",
    mailMessageId: (row.mail_message_id ?? row.mailMessageId)
      ? String(row.mail_message_id ?? row.mailMessageId)
      : undefined,
    mailSubject: (row.mail_subject ?? row.mailSubject)
      ? String(row.mail_subject ?? row.mailSubject)
      : undefined,
    mailFrom: (row.mail_from ?? row.mailFrom) ? String(row.mail_from ?? row.mailFrom) : undefined,
    mailSnippet: (row.mail_snippet ?? row.mailSnippet)
      ? String(row.mail_snippet ?? row.mailSnippet)
      : undefined,
    status,
    syncedToRecord: Boolean(row.synced_to_record ?? row.syncedToRecord),
    notes: row.notes ? String(row.notes) : "",
    createdAt: String(row.created_at ?? row.createdAt),
    updatedAt: String(row.updated_at ?? row.updatedAt),
  };
}

function normalizeNote(row: Record<string, unknown>): InterviewNote {
  const feelingRaw = String(row.feeling || "normal");
  const feeling: NoteFeeling =
    feelingRaw === "great" || feelingRaw === "hard" ? feelingRaw : "normal";
  return {
    id: String(row.id),
    userId: Number(row.user_id ?? row.userId),
    recordId: (row.record_id ?? row.recordId) ? String(row.record_id ?? row.recordId) : undefined,
    company: String(row.company),
    position: String(row.position || ""),
    stageName: String(row.stage_name ?? row.stageName ?? "一面"),
    interviewedAt: (row.interviewed_at ?? row.interviewedAt)
      ? String(row.interviewed_at ?? row.interviewedAt)
      : undefined,
    feeling,
    content: String(row.content || ""),
    createdAt: String(row.created_at ?? row.createdAt),
    updatedAt: String(row.updated_at ?? row.updatedAt),
  };
}

function normalizeMailAccount(row: Record<string, unknown>): StoredMailAccount {
  return {
    userId: Number(row.user_id ?? row.userId),
    enabled: Boolean(row.enabled),
    provider: (String(row.provider || "custom") as MailProvider) || "custom",
    host: String(row.host || ""),
    port: Number(row.port || 993),
    secure: row.secure === undefined ? true : Boolean(row.secure),
    email: String(row.email || ""),
    passwordEnc: String(row.password_enc ?? row.passwordEnc ?? ""),
    folder: String(row.folder || "INBOX"),
    pollIntervalMin: Number(row.poll_interval_min ?? row.pollIntervalMin ?? 10),
    lookbackDays: Number(row.lookback_days ?? row.lookbackDays ?? 7),
    lastUid: Number(row.last_uid ?? row.lastUid ?? 0),
    llmEnabled: Boolean(row.llm_enabled ?? row.llmEnabled),
    llmBaseUrl: String(row.llm_base_url ?? row.llmBaseUrl ?? ""),
    llmModel: String(row.llm_model ?? row.llmModel ?? ""),
    llmKeyEnc: String(row.llm_key_enc ?? row.llmKeyEnc ?? ""),
    lastSyncedAt: (row.last_synced_at ?? row.lastSyncedAt)
      ? String(row.last_synced_at ?? row.lastSyncedAt)
      : undefined,
    lastError: (row.last_error ?? row.lastError)
      ? String(row.last_error ?? row.lastError)
      : undefined,
    lastMatchedCount: Number(row.last_matched_count ?? row.lastMatchedCount ?? 0),
    updatedAt: String(row.updated_at ?? row.updatedAt ?? ""),
  };
}

export class MysqlStore implements Store {
  private pool: Pool;

  private constructor(pool: Pool) {
    this.pool = pool;
  }

  static async create(databaseUrl: string): Promise<MysqlStore> {
    const pool = mysql.createPool({
      uri: databaseUrl,
      waitForConnections: true,
      connectionLimit: 10,
      timezone: "Z",
    });
    const store = new MysqlStore(pool);
    await store.migrate();
    return store;
  }

  private async migrate() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ol_users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(64) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(16) NOT NULL DEFAULT 'user',
        calendar_token VARCHAR(96) NULL,
        created_at VARCHAR(40) NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    const [colRows] = await this.pool.query<RowDataPacket[]>(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ol_users' AND COLUMN_NAME = 'calendar_token'`,
    );
    if (!colRows.length) {
      await this.pool.query(
        `ALTER TABLE ol_users ADD COLUMN calendar_token VARCHAR(96) NULL UNIQUE AFTER role`,
      );
    }

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ol_sessions (
        token_hash VARCHAR(128) PRIMARY KEY,
        user_id INT NOT NULL,
        expires_at VARCHAR(40) NOT NULL,
        created_at VARCHAR(40) NOT NULL,
        INDEX idx_ol_sessions_user (user_id),
        CONSTRAINT fk_ol_sessions_user FOREIGN KEY (user_id) REFERENCES ol_users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ol_records (
        id VARCHAR(64) PRIMARY KEY,
        user_id INT NOT NULL,
        company VARCHAR(120) NOT NULL,
        position VARCHAR(120) NOT NULL,
        stages LONGTEXT NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'active',
        url TEXT NULL,
        city VARCHAR(64) NOT NULL DEFAULT '',
        salary VARCHAR(80) NOT NULL DEFAULT '',
        source VARCHAR(64) NOT NULL DEFAULT '',
        priority VARCHAR(16) NOT NULL DEFAULT 'normal',
        next_follow_up_at VARCHAR(40) NULL,
        last_visited_at VARCHAR(40) NULL,
        pinned TINYINT(1) NOT NULL DEFAULT 0,
        notes LONGTEXT NOT NULL,
        sealed LONGTEXT NULL,
        created_at VARCHAR(40) NOT NULL,
        updated_at VARCHAR(40) NOT NULL,
        INDEX idx_ol_records_user (user_id),
        CONSTRAINT fk_ol_records_user FOREIGN KEY (user_id) REFERENCES ol_users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ol_auth_limits (
        limit_key VARCHAR(160) PRIMARY KEY,
        hits INT NOT NULL,
        expires_at BIGINT NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ol_events (
        id VARCHAR(64) PRIMARY KEY,
        user_id INT NOT NULL,
        record_id VARCHAR(64) NULL,
        company VARCHAR(120) NOT NULL,
        position VARCHAR(120) NOT NULL DEFAULT '',
        stage_name VARCHAR(64) NULL,
        title VARCHAR(200) NOT NULL,
        kind VARCHAR(24) NOT NULL DEFAULT 'interview',
        start_at VARCHAR(40) NOT NULL,
        end_at VARCHAR(40) NULL,
        time_mode VARCHAR(16) NOT NULL DEFAULT 'scheduled',
        location TEXT NULL,
        source VARCHAR(16) NOT NULL DEFAULT 'manual',
        mail_message_id VARCHAR(255) NULL,
        mail_subject VARCHAR(300) NULL,
        mail_from VARCHAR(200) NULL,
        mail_snippet TEXT NULL,
        status VARCHAR(24) NOT NULL DEFAULT 'confirmed',
        synced_to_record TINYINT(1) NOT NULL DEFAULT 0,
        notes LONGTEXT NOT NULL,
        created_at VARCHAR(40) NOT NULL,
        updated_at VARCHAR(40) NOT NULL,
        INDEX idx_ol_events_user (user_id),
        INDEX idx_ol_events_start (user_id, start_at),
        CONSTRAINT fk_ol_events_user FOREIGN KEY (user_id) REFERENCES ol_users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ol_notes (
        id VARCHAR(64) PRIMARY KEY,
        user_id INT NOT NULL,
        record_id VARCHAR(64) NULL,
        company VARCHAR(120) NOT NULL,
        position VARCHAR(120) NOT NULL DEFAULT '',
        stage_name VARCHAR(64) NOT NULL DEFAULT '一面',
        interviewed_at VARCHAR(32) NULL,
        feeling VARCHAR(16) NOT NULL DEFAULT 'normal',
        content LONGTEXT NOT NULL,
        created_at VARCHAR(40) NOT NULL,
        updated_at VARCHAR(40) NOT NULL,
        INDEX idx_ol_notes_user (user_id),
        CONSTRAINT fk_ol_notes_user FOREIGN KEY (user_id) REFERENCES ol_users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ol_mail_accounts (
        user_id INT PRIMARY KEY,
        enabled TINYINT(1) NOT NULL DEFAULT 0,
        provider VARCHAR(24) NOT NULL DEFAULT 'qq',
        host VARCHAR(160) NOT NULL,
        port INT NOT NULL DEFAULT 993,
        secure TINYINT(1) NOT NULL DEFAULT 1,
        email VARCHAR(160) NOT NULL,
        password_enc TEXT NOT NULL,
        folder VARCHAR(64) NOT NULL DEFAULT 'INBOX',
        poll_interval_min INT NOT NULL DEFAULT 10,
        lookback_days INT NOT NULL DEFAULT 7,
        last_uid INT NOT NULL DEFAULT 0,
        llm_enabled TINYINT(1) NOT NULL DEFAULT 0,
        llm_base_url VARCHAR(255) NOT NULL DEFAULT '',
        llm_model VARCHAR(100) NOT NULL DEFAULT '',
        llm_key_enc TEXT NOT NULL,
        last_synced_at VARCHAR(40) NULL,
        last_error TEXT NULL,
        last_matched_count INT NOT NULL DEFAULT 0,
        updated_at VARCHAR(40) NOT NULL,
        CONSTRAINT fk_ol_mail_user FOREIGN KEY (user_id) REFERENCES ol_users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ol_mail_processed (
        user_id INT NOT NULL,
        message_hash VARCHAR(64) NOT NULL,
        processed_at VARCHAR(40) NOT NULL,
        PRIMARY KEY (user_id, message_hash),
        CONSTRAINT fk_ol_mail_proc_user FOREIGN KEY (user_id) REFERENCES ol_users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    const [timeModeCols] = await this.pool.query<RowDataPacket[]>(
      `SELECT 1 FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ol_events' AND COLUMN_NAME = 'time_mode'
       LIMIT 1`,
    );
    if (timeModeCols.length === 0) {
      try {
        await this.pool.query(
          "ALTER TABLE ol_events ADD COLUMN time_mode VARCHAR(16) NOT NULL DEFAULT 'scheduled' AFTER end_at",
        );
      } catch (err: unknown) {
        const code = (err as { code?: string })?.code;
        if (code !== "ER_DUP_FIELDNAME") throw err;
      }
    }
  }

  async ping() {
    await this.pool.query("SELECT 1");
  }

  async close() {
    await this.pool.end();
  }

  private mapUser(r: RowDataPacket): StoredUser {
    return {
      id: Number(r.id),
      username: String(r.username),
      passwordHash: String(r.password_hash),
      role: r.role === "admin" ? "admin" : "user",
      calendarToken: r.calendar_token ? String(r.calendar_token) : undefined,
      createdAt: String(r.created_at),
    };
  }

  async getUserByUsername(username: string): Promise<StoredUser | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT id, username, password_hash, role, calendar_token, created_at FROM ol_users WHERE username = ?",
      [username],
    );
    return rows[0] ? this.mapUser(rows[0]) : null;
  }

  async getUserById(id: number): Promise<StoredUser | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT id, username, password_hash, role, calendar_token, created_at FROM ol_users WHERE id = ?",
      [id],
    );
    return rows[0] ? this.mapUser(rows[0]) : null;
  }

  async getUserByCalendarToken(token: string): Promise<StoredUser | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT id, username, password_hash, role, calendar_token, created_at FROM ol_users WHERE calendar_token = ?",
      [token],
    );
    return rows[0] ? this.mapUser(rows[0]) : null;
  }

  async createUser(
    username: string,
    passwordHash: string,
    role: "user" | "admin" = "user",
  ): Promise<StoredUser> {
    const now = new Date().toISOString();
    const [res] = await this.pool.query<ResultSetHeader>(
      "INSERT INTO ol_users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)",
      [username, passwordHash, role, now],
    );
    return { id: Number(res.insertId), username, passwordHash, role, createdAt: now };
  }

  async updateUserPassword(userId: number, passwordHash: string): Promise<void> {
    await this.pool.query("UPDATE ol_users SET password_hash = ? WHERE id = ?", [
      passwordHash,
      userId,
    ]);
  }

  async setUserCalendarToken(userId: number, token: string): Promise<void> {
    await this.pool.query("UPDATE ol_users SET calendar_token = ? WHERE id = ?", [token, userId]);
  }

  async createSession(
    tokenHash: string,
    userId: number,
    expiresAt: string,
    createdAt: string,
  ): Promise<void> {
    await this.pool.query(
      "INSERT INTO ol_sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
      [tokenHash, userId, expiresAt, createdAt],
    );
    await this.pool.query(
      `DELETE s FROM ol_sessions s
       LEFT JOIN (
         SELECT token_hash FROM ol_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 10
       ) keep ON s.token_hash = keep.token_hash
       WHERE s.user_id = ? AND keep.token_hash IS NULL`,
      [userId, userId],
    );
  }

  async findSessionUser(tokenHash: string, nowIso: string): Promise<UserProfile | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT u.id, u.username, u.role, u.created_at
       FROM ol_sessions s JOIN ol_users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
      [tokenHash, nowIso],
    );
    const r = rows[0];
    if (!r) return null;
    return {
      id: Number(r.id),
      username: String(r.username),
      role: r.role === "admin" ? "admin" : "user",
      createdAt: String(r.created_at),
    };
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.pool.query("DELETE FROM ol_sessions WHERE token_hash = ?", [tokenHash]);
  }

  async deleteUserSessions(userId: number): Promise<void> {
    await this.pool.query("DELETE FROM ol_sessions WHERE user_id = ?", [userId]);
  }

  async checkRateLimit(limitKey: string, max: number, windowMs: number): Promise<boolean> {
    const now = Date.now();
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT hits, expires_at FROM ol_auth_limits WHERE limit_key = ?",
      [limitKey],
    );
    const row = rows[0];
    if (!row || Number(row.expires_at) < now) {
      await this.pool.query(
        "REPLACE INTO ol_auth_limits (limit_key, hits, expires_at) VALUES (?, 1, ?)",
        [limitKey, now + windowMs],
      );
      return true;
    }
    const next = Number(row.hits) + 1;
    await this.pool.query("UPDATE ol_auth_limits SET hits = ? WHERE limit_key = ?", [
      next,
      limitKey,
    ]);
    return next <= max;
  }

  async listRecords(userId: number): Promise<ApplicationRecord[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT * FROM ol_records WHERE user_id = ? ORDER BY updated_at DESC",
      [userId],
    );
    return rows.map((r) => normalizeRow(r));
  }

  async getRecord(id: string, userId: number): Promise<ApplicationRecord | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT * FROM ol_records WHERE id = ? AND user_id = ?",
      [id, userId],
    );
    return rows[0] ? normalizeRow(rows[0]) : null;
  }

  async insertRecord(userId: number, r: ApplicationRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO ol_records
       (id, user_id, company, position, stages, status, url, city, salary, source, priority, next_follow_up_at, last_visited_at, pinned, notes, sealed, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        r.id,
        userId,
        r.company,
        r.position,
        JSON.stringify(r.stages),
        r.status,
        r.url ?? null,
        r.city || "",
        r.salary || "",
        r.source || "",
        r.priority,
        r.nextFollowUpAt ?? null,
        r.lastVisitedAt ?? null,
        r.pinned ? 1 : 0,
        r.notes || "",
        r.sealed ? JSON.stringify(r.sealed) : null,
        r.createdAt,
        r.updatedAt,
      ],
    );
  }

  async updateRecord(userId: number, r: ApplicationRecord): Promise<void> {
    await this.pool.query(
      `UPDATE ol_records
       SET company = ?, position = ?, url = ?, city = ?, salary = ?, source = ?, priority = ?, next_follow_up_at = ?, last_visited_at = ?, notes = ?, sealed = ?, status = ?, pinned = ?, stages = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
      [
        r.company,
        r.position,
        r.url ?? null,
        r.city || "",
        r.salary || "",
        r.source || "",
        r.priority,
        r.nextFollowUpAt ?? null,
        r.lastVisitedAt ?? null,
        r.notes || "",
        r.sealed ? JSON.stringify(r.sealed) : null,
        r.status,
        r.pinned ? 1 : 0,
        JSON.stringify(r.stages),
        r.updatedAt,
        r.id,
        userId,
      ],
    );
  }

  async deleteRecord(id: string, userId: number): Promise<boolean> {
    const [res] = await this.pool.query<ResultSetHeader>(
      "DELETE FROM ol_records WHERE id = ? AND user_id = ?",
      [id, userId],
    );
    return res.affectedRows > 0;
  }

  async pinCompany(userId: number, company: string, pinned: boolean): Promise<number> {
    const [res] = await this.pool.query<ResultSetHeader>(
      "UPDATE ol_records SET pinned = ? WHERE user_id = ? AND company = ?",
      [pinned ? 1 : 0, userId, company],
    );
    return res.affectedRows;
  }

  async visitCompany(userId: number, company: string, visitedAt: string): Promise<number> {
    const [res] = await this.pool.query<ResultSetHeader>(
      "UPDATE ol_records SET last_visited_at = ? WHERE user_id = ? AND company = ?",
      [visitedAt, userId, company],
    );
    return res.affectedRows;
  }

  async visitRecord(userId: number, id: string, visitedAt: string): Promise<boolean> {
    const [res] = await this.pool.query<ResultSetHeader>(
      "UPDATE ol_records SET last_visited_at = ? WHERE id = ? AND user_id = ?",
      [visitedAt, id, userId],
    );
    return res.affectedRows > 0;
  }

  async importRecords(
    userId: number,
    items: ApplicationRecord[],
    mode: "merge" | "overwrite",
  ): Promise<number> {
    const conn = await this.pool.getConnection();
    await conn.beginTransaction();
    try {
      if (mode === "overwrite") {
        await conn.query("DELETE FROM ol_records WHERE user_id = ?", [userId]);
      }
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT id FROM ol_records WHERE user_id = ?",
        [userId],
      );
      const existing = new Set(rows.map((r) => String(r.id)));
      let count = 0;
      for (const r of items) {
        if (existing.has(r.id)) continue;
        await conn.query(
          `INSERT INTO ol_records
           (id, user_id, company, position, stages, status, url, city, salary, source, priority, next_follow_up_at, last_visited_at, pinned, notes, sealed, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            r.id,
            userId,
            r.company,
            r.position,
            JSON.stringify(r.stages),
            r.status,
            r.url ?? null,
            r.city || "",
            r.salary || "",
            r.source || "",
            r.priority,
            r.nextFollowUpAt ?? null,
            r.lastVisitedAt ?? null,
            r.pinned ? 1 : 0,
            r.notes || "",
            r.sealed ? JSON.stringify(r.sealed) : null,
            r.createdAt,
            r.updatedAt,
          ],
        );
        existing.add(r.id);
        count++;
      }
      await conn.commit();
      return count;
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  // ===== Schedule Events =====
  async listEvents(userId: number): Promise<ScheduleEvent[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT * FROM ol_events WHERE user_id = ? ORDER BY start_at ASC",
      [userId],
    );
    return rows.map((r) => normalizeEvent(r));
  }

  async getEvent(id: string, userId: number): Promise<ScheduleEvent | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT * FROM ol_events WHERE id = ? AND user_id = ?",
      [id, userId],
    );
    return rows[0] ? normalizeEvent(rows[0]) : null;
  }

  async insertEvent(userId: number, ev: ScheduleEvent): Promise<void> {
    await this.pool.query(
      `INSERT INTO ol_events
       (id, user_id, record_id, company, position, stage_name, title, kind, start_at, end_at, time_mode, location, source, mail_message_id, mail_subject, mail_from, mail_snippet, status, synced_to_record, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ev.id,
        userId,
        ev.recordId ?? null,
        ev.company,
        ev.position || "",
        ev.stageName ?? null,
        ev.title,
        ev.kind,
        ev.startAt,
        ev.endAt ?? null,
        ev.timeMode || "scheduled",
        ev.location ?? null,
        ev.source,
        ev.mailMessageId ?? null,
        ev.mailSubject ?? null,
        ev.mailFrom ?? null,
        ev.mailSnippet ?? null,
        ev.status,
        ev.syncedToRecord ? 1 : 0,
        ev.notes || "",
        ev.createdAt,
        ev.updatedAt,
      ],
    );
  }

  async updateEvent(userId: number, ev: ScheduleEvent): Promise<void> {
    await this.pool.query(
      `UPDATE ol_events
       SET record_id = ?, company = ?, position = ?, stage_name = ?, title = ?, kind = ?, start_at = ?, end_at = ?, time_mode = ?, location = ?, status = ?, synced_to_record = ?, notes = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
      [
        ev.recordId ?? null,
        ev.company,
        ev.position || "",
        ev.stageName ?? null,
        ev.title,
        ev.kind,
        ev.startAt,
        ev.endAt ?? null,
        ev.timeMode || "scheduled",
        ev.location ?? null,
        ev.status,
        ev.syncedToRecord ? 1 : 0,
        ev.notes || "",
        ev.updatedAt,
        ev.id,
        userId,
      ],
    );
  }

  async deleteEvent(id: string, userId: number): Promise<boolean> {
    const [res] = await this.pool.query<ResultSetHeader>(
      "DELETE FROM ol_events WHERE id = ? AND user_id = ?",
      [id, userId],
    );
    return res.affectedRows > 0;
  }

  // ===== Interview Notes =====
  async listNotes(userId: number): Promise<InterviewNote[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT * FROM ol_notes WHERE user_id = ? ORDER BY updated_at DESC",
      [userId],
    );
    return rows.map((r) => normalizeNote(r));
  }

  async getNote(id: string, userId: number): Promise<InterviewNote | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT * FROM ol_notes WHERE id = ? AND user_id = ?",
      [id, userId],
    );
    return rows[0] ? normalizeNote(rows[0]) : null;
  }

  async insertNote(userId: number, n: InterviewNote): Promise<void> {
    await this.pool.query(
      `INSERT INTO ol_notes
       (id, user_id, record_id, company, position, stage_name, interviewed_at, feeling, content, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        n.id,
        userId,
        n.recordId ?? null,
        n.company,
        n.position || "",
        n.stageName,
        n.interviewedAt ?? null,
        n.feeling,
        n.content,
        n.createdAt,
        n.updatedAt,
      ],
    );
  }

  async updateNote(userId: number, n: InterviewNote): Promise<void> {
    await this.pool.query(
      `UPDATE ol_notes
       SET record_id = ?, company = ?, position = ?, stage_name = ?, interviewed_at = ?, feeling = ?, content = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
      [
        n.recordId ?? null,
        n.company,
        n.position || "",
        n.stageName,
        n.interviewedAt ?? null,
        n.feeling,
        n.content,
        n.updatedAt,
        n.id,
        userId,
      ],
    );
  }

  async deleteNote(id: string, userId: number): Promise<boolean> {
    const [res] = await this.pool.query<ResultSetHeader>(
      "DELETE FROM ol_notes WHERE id = ? AND user_id = ?",
      [id, userId],
    );
    return res.affectedRows > 0;
  }

  // ===== Mail Accounts =====
  async getMailAccount(userId: number): Promise<StoredMailAccount | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT * FROM ol_mail_accounts WHERE user_id = ?",
      [userId],
    );
    return rows[0] ? normalizeMailAccount(rows[0]) : null;
  }

  async listEnabledMailAccounts(): Promise<StoredMailAccount[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT * FROM ol_mail_accounts WHERE enabled = 1",
    );
    return rows.map((r) => normalizeMailAccount(r));
  }

  async upsertMailAccount(acc: StoredMailAccount): Promise<void> {
    await this.pool.query(
      `INSERT INTO ol_mail_accounts
       (user_id, enabled, provider, host, port, secure, email, password_enc, folder, poll_interval_min, lookback_days, last_uid, llm_enabled, llm_base_url, llm_model, llm_key_enc, last_synced_at, last_error, last_matched_count, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
       enabled = VALUES(enabled), provider = VALUES(provider), host = VALUES(host), port = VALUES(port),
       secure = VALUES(secure), email = VALUES(email), password_enc = VALUES(password_enc), folder = VALUES(folder),
       poll_interval_min = VALUES(poll_interval_min), lookback_days = VALUES(lookback_days),
       llm_enabled = VALUES(llm_enabled), llm_base_url = VALUES(llm_base_url), llm_model = VALUES(llm_model),
       llm_key_enc = VALUES(llm_key_enc), updated_at = VALUES(updated_at)`,
      [
        acc.userId,
        acc.enabled ? 1 : 0,
        acc.provider,
        acc.host,
        acc.port,
        acc.secure ? 1 : 0,
        acc.email,
        acc.passwordEnc,
        acc.folder || "INBOX",
        acc.pollIntervalMin,
        acc.lookbackDays,
        acc.lastUid,
        acc.llmEnabled ? 1 : 0,
        acc.llmBaseUrl || "",
        acc.llmModel || "",
        acc.llmKeyEnc || "",
        acc.lastSyncedAt ?? null,
        acc.lastError ?? null,
        acc.lastMatchedCount,
        acc.updatedAt,
      ],
    );
  }

  async updateMailSyncState(
    userId: number,
    patch: { lastUid?: number; lastSyncedAt: string; lastError?: string | null; lastMatchedCount?: number },
  ): Promise<void> {
    const cur = await this.getMailAccount(userId);
    if (!cur) return;
    await this.pool.query(
      `UPDATE ol_mail_accounts
       SET last_uid = ?, last_synced_at = ?, last_error = ?, last_matched_count = ?, updated_at = ?
       WHERE user_id = ?`,
      [
        patch.lastUid ?? cur.lastUid,
        patch.lastSyncedAt,
        patch.lastError === undefined ? cur.lastError ?? null : patch.lastError,
        patch.lastMatchedCount ?? cur.lastMatchedCount,
        patch.lastSyncedAt,
        userId,
      ],
    );
  }

  async deleteMailAccount(userId: number): Promise<void> {
    await this.pool.query("DELETE FROM ol_mail_accounts WHERE user_id = ?", [userId]);
  }

  async hasProcessedMail(userId: number, messageHash: string): Promise<boolean> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT 1 FROM ol_mail_processed WHERE user_id = ? AND message_hash = ?",
      [userId, messageHash],
    );
    return rows.length > 0;
  }

  async markMailProcessed(userId: number, messageHash: string, processedAt: string): Promise<void> {
    await this.pool.query(
      "INSERT IGNORE INTO ol_mail_processed (user_id, message_hash, processed_at) VALUES (?, ?, ?)",
      [userId, messageHash, processedAt],
    );
  }
}

type JsonSnapshot = {
  nextUserId: number;
  users: StoredUser[];
  sessions: { tokenHash: string; userId: number; expiresAt: string; createdAt: string }[];
  records: (ApplicationRecord & { userId: number })[];
  events: (ScheduleEvent & { userId: number })[];
  notes: (InterviewNote & { userId: number })[];
  mailAccounts: StoredMailAccount[];
  mailProcessed: { userId: number; messageHash: string; processedAt: string }[];
  limits: Record<string, { hits: number; expiresAt: number }>;
};

export class JsonFileStore implements Store {
  private data: JsonSnapshot;
  private filePath: string | null;
  private writeQueue = Promise.resolve();

  constructor(filePath: string | null = null) {
    this.filePath = filePath;
    if (filePath && existsSync(filePath)) {
      const parsed = JSON.parse(readFileSync(filePath, "utf8")) as Partial<JsonSnapshot>;
      this.data = {
        nextUserId: parsed.nextUserId ?? 1,
        users: parsed.users ?? [],
        sessions: parsed.sessions ?? [],
        records: parsed.records ?? [],
        events: parsed.events ?? [],
        notes: parsed.notes ?? [],
        mailAccounts: parsed.mailAccounts ?? [],
        mailProcessed: parsed.mailProcessed ?? [],
        limits: parsed.limits ?? {},
      };
    } else {
      this.data = {
        nextUserId: 1,
        users: [],
        sessions: [],
        records: [],
        events: [],
        notes: [],
        mailAccounts: [],
        mailProcessed: [],
        limits: {},
      };
    }
  }

  private persist(): Promise<void> {
    if (!this.filePath) return Promise.resolve();
    const target = this.filePath;
    this.writeQueue = this.writeQueue.then(() => {
      mkdirSync(dirname(target), { recursive: true });
      const tmp = `${target}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.data, null, 2), "utf8");
      renameSync(tmp, target);
    });
    return this.writeQueue;
  }

  async ping() {}
  async close() {
    await this.writeQueue;
  }

  async getUserByUsername(username: string) {
    return this.data.users.find((u) => u.username === username) ?? null;
  }

  async getUserById(id: number) {
    return this.data.users.find((u) => u.id === id) ?? null;
  }

  async getUserByCalendarToken(token: string) {
    return this.data.users.find((u) => u.calendarToken === token) ?? null;
  }

  async createUser(username: string, passwordHash: string, role: "user" | "admin" = "user") {
    if (this.data.users.some((u) => u.username === username)) {
      throw new Error("DUPLICATE_USERNAME");
    }
    const user: StoredUser = {
      id: this.data.nextUserId++,
      username,
      passwordHash,
      role,
      createdAt: new Date().toISOString(),
    };
    this.data.users.push(user);
    await this.persist();
    return user;
  }

  async updateUserPassword(userId: number, passwordHash: string) {
    const user = this.data.users.find((u) => u.id === userId);
    if (user) {
      user.passwordHash = passwordHash;
      await this.persist();
    }
  }

  async setUserCalendarToken(userId: number, token: string) {
    const user = this.data.users.find((u) => u.id === userId);
    if (user) {
      user.calendarToken = token;
      await this.persist();
    }
  }

  async createSession(tokenHash: string, userId: number, expiresAt: string, createdAt: string) {
    this.data.sessions.push({ tokenHash, userId, expiresAt, createdAt });
    const own = this.data.sessions
      .filter((s) => s.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 10);
    const keep = new Set(own.map((s) => s.tokenHash));
    this.data.sessions = this.data.sessions.filter(
      (s) => s.userId !== userId || keep.has(s.tokenHash),
    );
    await this.persist();
  }

  async findSessionUser(tokenHash: string, nowIso: string) {
    const s = this.data.sessions.find((x) => x.tokenHash === tokenHash && x.expiresAt > nowIso);
    if (!s) return null;
    const u = this.data.users.find((x) => x.id === s.userId);
    if (!u) return null;
    return { id: u.id, username: u.username, role: u.role, createdAt: u.createdAt };
  }

  async deleteSession(tokenHash: string) {
    this.data.sessions = this.data.sessions.filter((s) => s.tokenHash !== tokenHash);
    await this.persist();
  }

  async deleteUserSessions(userId: number) {
    this.data.sessions = this.data.sessions.filter((s) => s.userId !== userId);
    await this.persist();
  }

  async checkRateLimit(limitKey: string, max: number, windowMs: number) {
    const now = Date.now();
    const cur = this.data.limits[limitKey];
    if (!cur || cur.expiresAt < now) {
      this.data.limits[limitKey] = { hits: 1, expiresAt: now + windowMs };
      await this.persist();
      return true;
    }
    cur.hits += 1;
    await this.persist();
    return cur.hits <= max;
  }

  async listRecords(userId: number) {
    return this.data.records
      .filter((r) => r.userId === userId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((r) => normalizeRow(r as unknown as Record<string, unknown>));
  }

  async getRecord(id: string, userId: number) {
    const r = this.data.records.find((x) => x.id === id && x.userId === userId);
    return r ? normalizeRow(r as unknown as Record<string, unknown>) : null;
  }

  async insertRecord(userId: number, record: ApplicationRecord) {
    this.data.records.push({ ...record, userId });
    await this.persist();
  }

  async updateRecord(userId: number, record: ApplicationRecord) {
    const idx = this.data.records.findIndex((x) => x.id === record.id && x.userId === userId);
    if (idx !== -1) {
      this.data.records[idx] = { ...record, userId };
      await this.persist();
    }
  }

  async deleteRecord(id: string, userId: number) {
    const before = this.data.records.length;
    this.data.records = this.data.records.filter((x) => !(x.id === id && x.userId === userId));
    if (this.data.records.length !== before) {
      await this.persist();
      return true;
    }
    return false;
  }

  async pinCompany(userId: number, company: string, pinned: boolean) {
    let count = 0;
    for (const r of this.data.records) {
      if (r.userId === userId && r.company === company) {
        r.pinned = pinned;
        count++;
      }
    }
    if (count) await this.persist();
    return count;
  }

  async visitCompany(userId: number, company: string, visitedAt: string) {
    let count = 0;
    for (const r of this.data.records) {
      if (r.userId === userId && r.company === company) {
        r.lastVisitedAt = visitedAt;
        count++;
      }
    }
    if (count) await this.persist();
    return count;
  }

  async visitRecord(userId: number, id: string, visitedAt: string) {
    const r = this.data.records.find((x) => x.id === id && x.userId === userId);
    if (!r) return false;
    r.lastVisitedAt = visitedAt;
    await this.persist();
    return true;
  }

  async importRecords(userId: number, items: ApplicationRecord[], mode: "merge" | "overwrite") {
    if (mode === "overwrite") {
      this.data.records = this.data.records.filter((x) => x.userId !== userId);
    }
    const existing = new Set(
      this.data.records.filter((x) => x.userId === userId).map((x) => x.id),
    );
    let count = 0;
    for (const item of items) {
      if (existing.has(item.id)) continue;
      this.data.records.push({ ...item, userId });
      existing.add(item.id);
      count++;
    }
    await this.persist();
    return count;
  }

  async listEvents(userId: number) {
    return this.data.events
      .filter((e) => e.userId === userId)
      .sort((a, b) => a.startAt.localeCompare(b.startAt))
      .map((e) => normalizeEvent(e as unknown as Record<string, unknown>));
  }

  async getEvent(id: string, userId: number) {
    const e = this.data.events.find((x) => x.id === id && x.userId === userId);
    return e ? normalizeEvent(e as unknown as Record<string, unknown>) : null;
  }

  async insertEvent(userId: number, event: ScheduleEvent) {
    this.data.events.push({ ...event, userId });
    await this.persist();
  }

  async updateEvent(userId: number, event: ScheduleEvent) {
    const idx = this.data.events.findIndex((x) => x.id === event.id && x.userId === userId);
    if (idx !== -1) {
      this.data.events[idx] = { ...event, userId };
      await this.persist();
    }
  }

  async deleteEvent(id: string, userId: number) {
    const before = this.data.events.length;
    this.data.events = this.data.events.filter((x) => !(x.id === id && x.userId === userId));
    if (this.data.events.length !== before) {
      await this.persist();
      return true;
    }
    return false;
  }

  async listNotes(userId: number) {
    return this.data.notes
      .filter((n) => n.userId === userId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((n) => normalizeNote(n as unknown as Record<string, unknown>));
  }

  async getNote(id: string, userId: number) {
    const n = this.data.notes.find((x) => x.id === id && x.userId === userId);
    return n ? normalizeNote(n as unknown as Record<string, unknown>) : null;
  }

  async insertNote(userId: number, note: InterviewNote) {
    this.data.notes.push({ ...note, userId });
    await this.persist();
  }

  async updateNote(userId: number, note: InterviewNote) {
    const idx = this.data.notes.findIndex((x) => x.id === note.id && x.userId === userId);
    if (idx !== -1) {
      this.data.notes[idx] = { ...note, userId };
      await this.persist();
    }
  }

  async deleteNote(id: string, userId: number) {
    const before = this.data.notes.length;
    this.data.notes = this.data.notes.filter((x) => !(x.id === id && x.userId === userId));
    if (this.data.notes.length !== before) {
      await this.persist();
      return true;
    }
    return false;
  }

  async getMailAccount(userId: number) {
    const acc = this.data.mailAccounts.find((m) => m.userId === userId);
    return acc ? normalizeMailAccount(acc as unknown as Record<string, unknown>) : null;
  }

  async listEnabledMailAccounts() {
    return this.data.mailAccounts
      .filter((m) => m.enabled)
      .map((m) => normalizeMailAccount(m as unknown as Record<string, unknown>));
  }

  async upsertMailAccount(account: StoredMailAccount) {
    const idx = this.data.mailAccounts.findIndex((m) => m.userId === account.userId);
    if (idx === -1) this.data.mailAccounts.push(account);
    else this.data.mailAccounts[idx] = { ...account, lastUid: this.data.mailAccounts[idx].lastUid };
    await this.persist();
  }

  async updateMailSyncState(
    userId: number,
    patch: { lastUid?: number; lastSyncedAt: string; lastError?: string | null; lastMatchedCount?: number },
  ) {
    const acc = this.data.mailAccounts.find((m) => m.userId === userId);
    if (!acc) return;
    if (patch.lastUid !== undefined) acc.lastUid = patch.lastUid;
    acc.lastSyncedAt = patch.lastSyncedAt;
    if (patch.lastError !== undefined) acc.lastError = patch.lastError ?? undefined;
    if (patch.lastMatchedCount !== undefined) acc.lastMatchedCount = patch.lastMatchedCount;
    acc.updatedAt = patch.lastSyncedAt;
    await this.persist();
  }

  async deleteMailAccount(userId: number) {
    this.data.mailAccounts = this.data.mailAccounts.filter((m) => m.userId !== userId);
    await this.persist();
  }

  async hasProcessedMail(userId: number, messageHash: string) {
    return this.data.mailProcessed.some(
      (p) => p.userId === userId && p.messageHash === messageHash,
    );
  }

  async markMailProcessed(userId: number, messageHash: string, processedAt: string) {
    if (await this.hasProcessedMail(userId, messageHash)) return;
    this.data.mailProcessed.push({ userId, messageHash, processedAt });
    await this.persist();
  }
}

export async function createStore(): Promise<Store> {
  const mysqlUrl = process.env.DATABASE_URL?.trim();
  if (mysqlUrl) {
    return MysqlStore.create(mysqlUrl);
  }
  const dataDir = process.env.DATA_DIR || "./data";
  return new JsonFileStore(`${dataDir}/offerline.json`);
}
