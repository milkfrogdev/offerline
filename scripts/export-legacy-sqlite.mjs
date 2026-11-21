// 一次性离线转换辅助脚本：将旧版 SQLite 备份转换为 OfferLine 标准 JSON，便于迁移或导入。
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const [srcPath, outPath] = process.argv.slice(2);
if (!srcPath || !outPath) {
  console.error("用法: node scripts/export-legacy-sqlite.mjs <app.db> <export.json>");
  process.exit(1);
}

const db = new DatabaseSync(resolve(srcPath), { readOnly: true });
const rows = db
  .prepare(
    "SELECT id, company, position, stages, status, url, last_visited_at, pinned, created_at, updated_at FROM interviews",
  )
  .all();
db.close();

const records = rows.map((r) => ({
  id: String(r.id),
  company: String(r.company),
  position: String(r.position),
  stages: JSON.parse(String(r.stages || "[]")),
  status: r.status === "archived" ? "archived" : "active",
  url: r.url ? String(r.url) : undefined,
  lastVisitedAt: r.last_visited_at ? String(r.last_visited_at) : undefined,
  pinned: Boolean(r.pinned),
  createdAt: String(r.created_at),
  updatedAt: String(r.updated_at),
}));

writeFileSync(resolve(outPath), JSON.stringify(records, null, 2), "utf8");
console.log(`已转换 ${records.length} 条记录 -> ${resolve(outPath)}`);
