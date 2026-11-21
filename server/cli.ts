import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { normalizeStage } from "../shared/stages.js";
import type { ApplicationRecord, Stage } from "../shared/types.js";
import { createStore } from "./store.js";
import { hashPassword, randomToken, sanitizeExternalUrl } from "./security.js";

const args = process.argv.slice(2);
const cmd = args[0];
const store = await createStore();

try {
  if (cmd === "bootstrap") {
    const username = (args[1] || "").trim().toLowerCase();
    const rawPass = args[2] || "";
    if (!/^[a-z0-9_]{3,32}$/.test(username)) {
      throw new Error("用法: bootstrap <username> [password]");
    }
    const password = rawPass || randomToken().slice(0, 18);
    if (password.length < 10) throw new Error("密码至少 10 位");
    const existing = await store.getUserByUsername(username);
    if (existing) {
      console.log(`用户 ${username} 已存在`);
    } else {
      await store.createUser(username, hashPassword(password), "admin");
      console.log(`已创建管理员: ${username}`);
      if (!rawPass) console.log(`初始口令（仅此一次显示）: ${password}`);
    }
  } else if (cmd === "reset-password") {
    const username = (args[1] || "").trim().toLowerCase();
    const rawPass = args[2] || "";
    if (!username) throw new Error("用法: reset-password <username> [password]");
    const password = rawPass || randomToken().slice(0, 18);
    if (password.length < 10) throw new Error("密码至少 10 位");
    const user = await store.getUserByUsername(username);
    if (!user) throw new Error(`用户不存在: ${username}`);
    await store.updateUserPassword(user.id, hashPassword(password));
    await store.deleteUserSessions(user.id);
    console.log(`已重置 ${username} 密码并撤销旧会话`);
    if (!rawPass) console.log(`新口令（仅此一次显示）: ${password}`);
  } else if (cmd === "import-json") {
    const jsonPath = args[1];
    const targetUsername = (args[2] || "").trim().toLowerCase();
    if (!jsonPath || !targetUsername) {
      throw new Error("用法: import-json <json-path> <target-username>");
    }
    const user = await store.getUserByUsername(targetUsername);
    if (!user) throw new Error(`目标用户不存在: ${targetUsername}`);
    const rawList = JSON.parse(readFileSync(resolve(jsonPath), "utf8")) as Record<string, unknown>[];
    const now = new Date().toISOString();
    const items: ApplicationRecord[] = rawList.map((r) => ({
      id: String(r.id),
      company: String(r.company).trim(),
      position: String(r.position).trim(),
      stages: (Array.isArray(r.stages) ? r.stages : []).map((s, idx) =>
        normalizeStage((s || {}) as Stage, idx),
      ),
      status: r.status === "archived" ? "archived" : "active",
      url: sanitizeExternalUrl(r.url) || undefined,
      city: typeof r.city === "string" ? r.city : "",
      salary: typeof r.salary === "string" ? r.salary : "",
      source: typeof r.source === "string" ? r.source : "",
      priority: r.priority === "high" || r.priority === "low" ? r.priority : "normal",
      nextFollowUpAt: typeof r.nextFollowUpAt === "string" ? r.nextFollowUpAt : undefined,
      lastVisitedAt: typeof r.lastVisitedAt === "string" ? r.lastVisitedAt : undefined,
      pinned: Boolean(r.pinned),
      notes: typeof r.notes === "string" ? r.notes : "",
      createdAt: typeof r.createdAt === "string" ? r.createdAt : now,
      updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : now,
    }));
    const count = await store.importRecords(user.id, items, "merge");
    console.log(`导入完成：文件 ${items.length} 条，新写入 ${count} 条 -> ${targetUsername}`);
  } else {
    console.error("可用命令: bootstrap | reset-password | import-json");
    process.exitCode = 1;
  }
} finally {
  await store.close();
}
