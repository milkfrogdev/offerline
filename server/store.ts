import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import mysql, { type Pool, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import { normalizeStage } from "../shared/stages.js";
import type { ApplicationRecord, EncryptedEnvelope, Stage, UserProfile } from "../shared/types.js";

export type StoredUser = UserProfile & { passwordHash: string };

export interface Store {
  ping(): Promise<void>;
  close(): Promise<void>;

  getUserByUsername(username: string): Promise<StoredUser | null>;
  getUserById(id: number): Promise<StoredUser | null>;
  createUser(username: string, passwordHash: string, role?: "user" | "admin"): Promise<StoredUser>;
  updateUserPassword(userId: number, passwordHash: string): Promise<void>;

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
}

function normalizeRow(row: Record<string, unknown>): ApplicationRecord {
  const parsed = typeof row.stages === "string"
    ? (JSON.parse(row.stages) as Stage[])
    : (row.stages as Stage[]);
  let sealed: EncryptedEnvelope | undefined;
  if (row.sealed) {
    try {
      sealed = typeof row.sealed === "string"
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
        created_at VARCHAR(40) NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
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
  }

  async ping() {
    await this.pool.query("SELECT 1");
  }

  async close() {
    await this.pool.end();
  }

  async getUserByUsername(username: string): Promise<StoredUser | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT id, username, password_hash, role, created_at FROM ol_users WHERE username = ?",
      [username],
    );
    const r = rows[0];
    if (!r) return null;
    return {
      id: Number(r.id),
      username: String(r.username),
      passwordHash: String(r.password_hash),
      role: r.role === "admin" ? "admin" : "user",
      createdAt: String(r.created_at),
    };
  }

  async getUserById(id: number): Promise<StoredUser | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT id, username, password_hash, role, created_at FROM ol_users WHERE id = ?",
      [id],
    );
    const r = rows[0];
    if (!r) return null;
    return {
      id: Number(r.id),
      username: String(r.username),
      passwordHash: String(r.password_hash),
      role: r.role === "admin" ? "admin" : "user",
      createdAt: String(r.created_at),
    };
  }

  async createUser(username: string, passwordHash: string, role: "user" | "admin" = "user"): Promise<StoredUser> {
    const now = new Date().toISOString();
    const [res] = await this.pool.query<ResultSetHeader>(
      "INSERT INTO ol_users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)",
      [username, passwordHash, role, now],
    );
    return { id: Number(res.insertId), username, passwordHash, role, createdAt: now };
  }

  async updateUserPassword(userId: number, passwordHash: string): Promise<void> {
    await this.pool.query("UPDATE ol_users SET password_hash = ? WHERE id = ?", [passwordHash, userId]);
  }

  async createSession(tokenHash: string, userId: number, expiresAt: string, createdAt: string): Promise<void> {
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
    await this.pool.query("UPDATE ol_auth_limits SET hits = ? WHERE limit_key = ?", [next, limitKey]);
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

  async importRecords(userId: number, items: ApplicationRecord[], mode: "merge" | "overwrite"): Promise<number> {
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
}

type JsonSnapshot = {
  nextUserId: number;
  users: StoredUser[];
  sessions: { tokenHash: string; userId: number; expiresAt: string; createdAt: string }[];
  records: (ApplicationRecord & { userId: number })[];
  limits: Record<string, { hits: number; expiresAt: number }>;
};

export class JsonFileStore implements Store {
  private data: JsonSnapshot;
  private filePath: string | null;
  private writeQueue = Promise.resolve();

  constructor(filePath: string | null = null) {
    this.filePath = filePath;
    if (filePath && existsSync(filePath)) {
      this.data = JSON.parse(readFileSync(filePath, "utf8")) as JsonSnapshot;
    } else {
      this.data = { nextUserId: 1, users: [], sessions: [], records: [], limits: {} };
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
    const existing = new Set(this.data.records.filter((x) => x.userId === userId).map((x) => x.id));
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
}

export async function createStore(): Promise<Store> {
  const mysqlUrl = process.env.DATABASE_URL?.trim();
  if (mysqlUrl) {
    return MysqlStore.create(mysqlUrl);
  }
  const dataDir = process.env.DATA_DIR || "./data";
  return new JsonFileStore(`${dataDir}/offerline.json`);
}
