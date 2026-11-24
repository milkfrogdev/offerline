import { normalizeCompanyName } from "./companies.js";
import { buildInitialStages, DEFAULT_STAGE_NAMES, inferStageType } from "./stages.js";
import type { Stage, StageDraft, StageStatus } from "./types.js";

export interface ImportedTimelineRecord {
  company: string;
  position: string;
  url?: string;
  createdAt?: string;
  stages: Stage[];
}

export const BATCH_TIMELINE_IMPORT_PROMPT = `你是 OfferLine 求职进度结构化助手。请将下方我提供的表格、Excel 文本或备忘录整理成可直接导入的纯 JSON。

严格要求：
1. 只输出合法的 JSON 数组（可用 \`\`\`json 代码块包裹），不要输出任何解释文字或总结。
2. 数组每一项代表一条「公司 + 岗位」投递记录：
   - company (string, 必填): 简洁常用公司简称（如 "字节跳动"、"腾讯"、"华为"、"科大讯飞"、"美团"）
   - position (string, 必填): 投递岗位名（未写填 "通用岗位"）
   - url (string, 可选): 官网投递链接（无则省略）
   - createdAt (string, 可选): YYYY-MM-DD 格式投递日期（无则省略）
   - stages (数组, 必填): 按顺序排列的阶段列表，每项为 {"name": string, "status": "pass" | "current" | "fail" | "rejected" | "skip" | "pending"}
     * 校招常用阶段参考：投递、测评、笔试、简历评估、一面、二面、三面、HR面、谈薪、正式offer（可按实际流程增减）
     * status 语义：
       - "pass": 已通过 / 已完成
       - "current": 当前所处或刚约好待进行（一条进行中记录最多 1 个 "current"）
       - "fail": 该环节未通过 / 感谢信 / 流程结束
       - "rejected": 主动拒绝 / 放弃
       - "skip": 跳过（如免笔试）
       - "pending": 尚未到达的后续阶段
3. 严禁编造原文未出现的公司；同一公司不同岗位拆成多条对象。

输出示例：
\`\`\`json
[
  {
    "company": "字节跳动",
    "position": "后端开发工程师",
    "stages": [
      {"name": "投递", "status": "pass"},
      {"name": "笔试", "status": "pass"},
      {"name": "一面", "status": "pass"},
      {"name": "二面", "status": "current"},
      {"name": "三面", "status": "pending"},
      {"name": "HR面", "status": "pending"},
      {"name": "正式offer", "status": "pending"}
    ]
  }
]
\`\`\`

待整理内容如下：
`;

export const MAIL_SELF_PARSE_PROMPT = `你是 OfferLine 求职邮件解析助手。请提取下方邮件里的面试/笔试/测评/Offer 信息，只输出一个纯 JSON 对象（可用 \`\`\`json 包裹，不要任何多余文字）：

字段规范：
- matched (boolean): 面试/笔试/测评/Offer 邀请填 true；拒信、感谢信、广告、调研问卷、纯投递回执、验证码填 false
- company (string): 简洁公司简称（如 "字节跳动"、"腾讯"、"科大讯飞"）
- position (string): 邮件明确写出的岗位名，没写填 ""
- stageName (string): 只能选 "一面" | "二面" | "三面" | "终面" | "HR面" | "面试" | "笔试" | "测评" | "录用意向" | "正式Offer"（未写轮次填 "面试"）
- kind (string): "interview" | "written_test" | "assessment" | "offer" | "other"
- actionHint (string): 常规日程填 "schedule"，Offer/意向填 "offer"，拒信填 "fail"
- timeMode (string): 有明确开始时刻填 "scheduled"；只有截止日期填 "deadline"；未定具体时间填 "flexible"
- startAt (string | null): ISO-8601 时间（如 "2026-11-28T14:00:00+08:00"），flexible 填 null
- endAt (string | null): 结束时间 ISO-8601，无或 deadline/flexible 填 null
- location (string | null): 会议链接、面试地点或笔试网址（不要写图片或退订链接）
- reason (string, 可选): 若 matched=false 简写原因

待解析邮件：
`;

/**
 * 容错提取模型返回的 JSON（支持对象 {...} 或数组 [...]）：
 * 自动剥离 <think>...</think> 思考块与 Markdown 代码块围栏，定位首个配对括号并解析。
 */
export function extractJsonValue(raw: string): unknown | null {
  if (!raw || typeof raw !== "string") return null;
  const cleaned = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, " ")
    .replace(/```(?:json)?\s*([\s\S]*?)```/gi, "$1")
    .trim();

  if (
    (cleaned.startsWith("{") && cleaned.endsWith("}")) ||
    (cleaned.startsWith("[") && cleaned.endsWith("]"))
  ) {
    try {
      return JSON.parse(cleaned);
    } catch {
      // Fall through to balanced scanner
    }
  }

  const objIdx = cleaned.indexOf("{");
  const arrIdx = cleaned.indexOf("[");
  if (objIdx === -1 && arrIdx === -1) return null;

  const tryParseFrom = (start: number, openChar: "{" | "[", closeChar: "}" | "]"): unknown | null => {
    if (start === -1) return null;
    let depth = 0;
    let inStr = false;
    let escaped = false;
    for (let i = start; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (inStr) {
        if (escaped) {
          escaped = false;
        } else if (ch === "\\") {
          escaped = true;
        } else if (ch === '"') {
          inStr = false;
        }
        continue;
      }
      if (ch === '"') {
        inStr = true;
      } else if (ch === openChar) {
        depth++;
      } else if (ch === closeChar) {
        depth--;
        if (depth === 0) {
          const candidate = cleaned.slice(start, i + 1);
          try {
            return JSON.parse(candidate);
          } catch {
            return null;
          }
        }
      }
    }
    return null;
  };

  if (arrIdx !== -1 && (objIdx === -1 || arrIdx < objIdx)) {
    return tryParseFrom(arrIdx, "[", "]") ?? tryParseFrom(objIdx, "{", "}");
  }
  return tryParseFrom(objIdx, "{", "}") ?? tryParseFrom(arrIdx, "[", "]");
}

const STATUS_SYNONYMS: Record<string, StageStatus> = {
  pass: "pass",
  passed: "pass",
  done: "pass",
  completed: "pass",
  "通过": "pass",
  "已通过": "pass",
  "完成": "pass",
  "已完成": "pass",
  current: "current",
  active: "current",
  in_progress: "current",
  ongoing: "current",
  "当前": "current",
  "进行中": "current",
  "待面": "current",
  "待面试": "current",
  "约面": "current",
  fail: "fail",
  failed: "fail",
  eliminated: "fail",
  "挂了": "fail",
  "已挂": "fail",
  "未通过": "fail",
  "淘汰": "fail",
  "感谢信": "fail",
  rejected: "rejected",
  declined: "rejected",
  withdrawn: "rejected",
  "拒绝": "rejected",
  "已拒绝": "rejected",
  "放弃": "rejected",
  "主动拒绝": "rejected",
  skip: "skip",
  skipped: "skip",
  "跳过": "skip",
  "已跳过": "skip",
  "免笔试": "skip",
  pending: "pending",
  todo: "pending",
  "待进行": "pending",
  "待定": "pending",
  "未开始": "pending",
};

function normalizeStageStatus(raw: unknown): StageStatus {
  if (typeof raw !== "string") return "pending";
  const key = raw.trim().toLowerCase();
  if (STATUS_SYNONYMS[key]) return STATUS_SYNONYMS[key];
  if (STATUS_SYNONYMS[raw.trim()]) return STATUS_SYNONYMS[raw.trim()];
  if (/通过|完成|pass/i.test(raw)) return "pass";
  if (/挂|淘汰|感谢|fail|未过/i.test(raw)) return "fail";
  if (/拒绝|放弃|reject/i.test(raw)) return "rejected";
  if (/跳过|免|skip/i.test(raw)) return "skip";
  if (/当前|进行|约面|waiting|current/i.test(raw)) return "current";
  return "pending";
}

function rescueStagesFromHint(statusHint: string): Stage[] {
  const names: string[] = [...DEFAULT_STAGE_NAMES];
  const base = buildInitialStages(names.map((name, i) => ({ id: `stage-${i + 1}`, name })));
  const hint = statusHint.trim();
  if (!hint) return base;

  const stageNamesLower = names.map((n) => n.toLowerCase());
  const isFail = /挂|淘汰|感谢|未通过|fail/i.test(hint);
  const isRejected = /放弃|拒绝|rejected/i.test(hint);
  const isOffer = /正式\s*offer|拿到?\s*offer|录用|已\s*offer|意向/i.test(hint);

  let targetIdx = -1;
  if (isOffer) {
    targetIdx = names.length - 1;
  } else {
    for (let i = names.length - 1; i >= 0; i--) {
      if (hint.toLowerCase().includes(stageNamesLower[i])) {
        targetIdx = i;
        break;
      }
    }
    if (targetIdx === -1 && /终面/.test(hint)) {
      targetIdx = names.indexOf("三面");
    }
  }

  if (targetIdx === -1) {
    if (isFail) {
      base[1].status = "fail";
    }
    return base;
  }

  return base.map((st, idx) => {
    if (idx < targetIdx) return { ...st, status: "pass" };
    if (idx === targetIdx) {
      if (isFail) return { ...st, status: "fail" };
      if (isRejected) return { ...st, status: "rejected" };
      if (isOffer) return { ...st, status: "pass" };
      if (/通过|已过|pass/i.test(hint)) return { ...st, status: "pass" };
      return { ...st, status: "current" };
    }
    return { ...st, status: "pending" };
  });
}

function buildNormalizedStages(rawStages: unknown, fallbackStatusHint: string): Stage[] {
  if (!Array.isArray(rawStages) || rawStages.length === 0) {
    return rescueStagesFromHint(fallbackStatusHint);
  }

  const normalized: Stage[] = [];
  for (let i = 0; i < rawStages.length; i++) {
    const item = rawStages[i];
    if (typeof item === "string") {
      const name = item.trim();
      if (!name) continue;
      normalized.push({
        id: `stage-${normalized.length + 1}`,
        name: name.slice(0, 40),
        type: inferStageType({ name }),
        status: "pending",
      });
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const rec = item as Partial<StageDraft> & { stage?: string; title?: string; state?: string };
    const name = String(rec.name || rec.stage || rec.title || "").trim();
    if (!name) continue;
    const status = normalizeStageStatus(rec.status ?? rec.state);
    normalized.push({
      id: typeof rec.id === "string" && rec.id.trim() ? rec.id.trim().slice(0, 40) : `stage-${normalized.length + 1}`,
      name: name.slice(0, 40),
      type: inferStageType({ name, type: rec.type }),
      status,
    });
  }

  if (normalized.length === 0) {
    return rescueStagesFromHint(fallbackStatusHint);
  }

  // Ensure only 1 active current if user's LLM emitted multiple currents; and ensure initial stage isn't all pending
  let seenCurrent = false;
  let hasAnyNonPending = false;
  for (const st of normalized) {
    if (st.status !== "pending") hasAnyNonPending = true;
    if (st.status === "current") {
      if (seenCurrent) st.status = "pending";
      seenCurrent = true;
    }
  }
  if (!hasAnyNonPending) {
    return buildInitialStages(normalized);
  }
  return normalized;
}

function sanitizeHttpUrl(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  try {
    const u = new URL(trimmed);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString().slice(0, 1000) : undefined;
  } catch {
    return undefined;
  }
}

export function looksLikeJsonPayload(raw: string): boolean {
  const stripped = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/```(?:json)?/gi, "")
    .trim();
  return stripped.startsWith("[") || stripped.startsWith("{");
}

export function parseImportedPipelineRecords(
  rawInput: string | unknown,
): { ok: true; items: ImportedTimelineRecord[] } | { ok: false; error: string } {
  let root: unknown;
  if (typeof rawInput === "string") {
    root = extractJsonValue(rawInput);
    if (root === null) {
      return {
        ok: false,
        error: "未识别到合法的 JSON 结构。请贴入大模型输出的 JSON 数组，或使用个人大模型直接解析。",
      };
    }
  } else {
    root = rawInput;
  }

  let list: unknown[] | null = null;
  if (Array.isArray(root)) {
    list = root;
  } else if (root && typeof root === "object") {
    const obj = root as Record<string, unknown>;
    if (Array.isArray(obj.records)) list = obj.records;
    else if (Array.isArray(obj.items)) list = obj.items;
    else if (Array.isArray(obj.data)) list = obj.data;
    else if (typeof obj.company === "string") list = [obj];
  }

  if (!list || list.length === 0) {
    return {
      ok: false,
      error: "解析结果为空，未发现有效投递记录。",
    };
  }

  const items: ImportedTimelineRecord[] = [];
  for (const entry of list.slice(0, 200)) {
    if (!entry || typeof entry !== "object") continue;
    const r = entry as Record<string, unknown>;
    const rawCompany = String(r.company ?? r["公司"] ?? "").trim();
    if (!rawCompany) continue;
    const company = (normalizeCompanyName(rawCompany) || rawCompany).slice(0, 100);
    const rawPos = String(r.position ?? r.role ?? r.job ?? r["岗位"] ?? "").trim();
    const position = (rawPos || "通用岗位").slice(0, 100);
    const url = sanitizeHttpUrl(r.url ?? r.link ?? r["链接"]);
    const rawDate = String(r.createdAt ?? r.appliedAt ?? r.date ?? r["投递时间"] ?? "").trim();
    const parsedTime = rawDate ? Date.parse(rawDate) : Number.NaN;
    const createdAt = !Number.isNaN(parsedTime) ? new Date(parsedTime).toISOString() : undefined;
    const statusHint = String(r.status ?? r.stage ?? r.currentStage ?? r["当前状态"] ?? r["进度"] ?? "");
    const stages = buildNormalizedStages(r.stages ?? r.timeline ?? r["阶段"], statusHint);
    items.push({ company, position, url, createdAt, stages });
  }

  if (items.length === 0) {
    return {
      ok: false,
      error: "JSON 中缺少有效的 company 字段，无法构建时间线记录。",
    };
  }
  return { ok: true, items };
}
