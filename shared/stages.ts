import {
  STAGE_STATUSES,
  STAGE_TYPES,
  type ApplicationRecord,
  type PriorityLevel,
  type SortMode,
  type Stage,
  type StageDraft,
  type StageStatus,
  type StageType,
} from "./types.js";

export const DEFAULT_STAGE_NAMES = [
  "投递",
  "测评",
  "笔试",
  "简历评估",
  "一面",
  "二面",
  "三面",
  "HR面",
  "谈薪",
  "正式offer",
] as const;

export const STAGE_TEMPLATES: { id: string; label: string; names: readonly string[] }[] = [
  {
    id: "intern",
    label: "实习",
    names: ["投递", "笔试", "简历评估", "一面", "二面", "HR面", "正式offer"],
  },
  {
    id: "campus",
    label: "校招",
    names: DEFAULT_STAGE_NAMES,
  },
  {
    id: "social",
    label: "社招",
    names: ["投递", "简历筛选", "一面", "二面", "三面", "HR面", "谈薪", "正式offer"],
  },
];

export const STAGE_STATUS_LABELS: Record<StageStatus, string> = {
  pending: "待进行",
  current: "进行中",
  pass: "已通过",
  fail: "未通过",
  rejected: "已拒绝",
  skip: "已跳过",
};

export const STAGE_TYPE_LABELS: Record<StageType, string> = {
  application: "投递",
  interview: "面试",
  offer: "录用",
  other: "考核/其他",
};

export const PRIORITY_LABELS: Record<PriorityLevel, string> = {
  high: "重点",
  normal: "常规",
  low: "保底",
};

export function inferStageType(stage: Pick<StageDraft, "name" | "type">): StageType {
  if (stage.type && (STAGE_TYPES as readonly string[]).includes(stage.type)) {
    return stage.type;
  }
  const normalized = stage.name.trim().toLowerCase();
  if (normalized === "投递" || normalized === "网申") return "application";
  if (
    ["一面", "二面", "三面", "四面", "终面", "hr面", "技术面", "电面", "hm面", "技术一面", "技术二面"].includes(
      normalized,
    ) ||
    normalized.includes("面")
  ) {
    return "interview";
  }
  if (normalized === "正式offer" || normalized === "offer" || normalized.includes("录用")) {
    return "offer";
  }
  return "other";
}

export function normalizeStage(raw: StageDraft, index: number): Stage {
  const name = (raw.name || "").trim() || `阶段 ${index + 1}`;
  const id = (raw.id || "").trim() || `stage-${index + 1}`;
  const status: StageStatus =
    raw.status && (STAGE_STATUSES as readonly string[]).includes(raw.status)
      ? raw.status
      : "pending";
  return {
    id,
    name,
    type: inferStageType({ name, type: raw.type }),
    status,
  };
}

export function createStageDraftsFromNames(names: readonly string[]): StageDraft[] {
  return names.map((name, idx) => ({
    id: `stage-${idx + 1}`,
    name,
    type: inferStageType({ name }),
  }));
}

export function createDefaultStageDrafts(): StageDraft[] {
  return DEFAULT_STAGE_NAMES.map((name, idx) => ({
    id: `default-${idx + 1}`,
    name,
    type: inferStageType({ name }),
  }));
}

export function buildInitialStages(drafts: readonly StageDraft[]): Stage[] {
  const stages = drafts.map((d, i) => ({
    ...normalizeStage(d, i),
    status: "pending" as StageStatus,
  }));
  if (!stages.length) return stages;
  const startIdx = stages[0].type === "application" && stages.length > 1 ? 1 : 0;
  if (startIdx === 1) stages[0].status = "pass";
  stages[startIdx].status = "current";
  return stages;
}

export function reconcileEditedStages(
  previous: readonly Stage[],
  drafts: readonly StageDraft[],
): Stage[] {
  const prevById = new Map(previous.map((s) => [s.id, s]));
  const next = drafts.map((d, idx) => {
    const id = (d.id || "").trim() || `stage-${idx + 1}`;
    const existing = prevById.get(id);
    return {
      id,
      name: d.name.trim(),
      type: inferStageType({ name: d.name, type: d.type }),
      status: existing?.status ?? ("pending" as StageStatus),
    };
  });
  const terminated = next.some((s) => s.status === "fail" || s.status === "rejected");
  let hasCurrent = false;
  for (const s of next) {
    if (s.status !== "pending" && s.status !== "current") continue;
    if (!terminated && !hasCurrent) {
      s.status = "current";
      hasCurrent = true;
    } else {
      s.status = "pending";
    }
  }
  return next;
}

export function applyStageStatusChange(
  stages: readonly Stage[],
  index: number,
  nextStatus: StageStatus,
): Stage[] {
  const updated = stages.map((s) => ({ ...s }));
  if (index < 0 || index >= updated.length) return updated;

  updated[index].status = nextStatus;

  if (nextStatus === "current") {
    for (let i = 0; i < updated.length; i++) {
      if (i !== index && updated[i].status === "current") {
        updated[i].status = "pending";
      }
    }
  } else if (nextStatus === "pass" || nextStatus === "skip") {
    const hasActiveOrEnded = updated.some(
      (s) => s.status === "current" || s.status === "fail" || s.status === "rejected",
    );
    if (!hasActiveOrEnded) {
      const nextPending = updated.findIndex((s, i) => i > index && s.status === "pending");
      const fallbackPending =
        nextPending !== -1 ? nextPending : updated.findIndex((s) => s.status === "pending");
      if (fallbackPending !== -1) {
        updated[fallbackPending].status = "current";
      }
    }
  } else if (nextStatus === "fail" || nextStatus === "rejected") {
    for (let i = 0; i < updated.length; i++) {
      if (i !== index && updated[i].status === "current") {
        updated[i].status = "pending";
      }
    }
  }
  return updated;
}

/** 将邮箱解析出的阶段名推进到对应阶段，前置未完成阶段自动标为通过/跳过 */
export function advanceStagesToTarget(
  stages: readonly Stage[],
  targetStageName: string,
  outcome: "current" | "pass" | "fail",
): Stage[] {
  const updated = stages.map((s) => ({ ...s }));
  const norm = targetStageName.trim().toLowerCase();
  let idx = updated.findIndex((s) => s.name.toLowerCase() === norm);
  if (idx === -1) {
    idx = updated.findIndex(
      (s) => s.name.toLowerCase().includes(norm) || norm.includes(s.name.toLowerCase()),
    );
  }
  if (idx === -1 && norm.includes("offer")) {
    idx = updated.findIndex((s) => s.type === "offer");
  }
  if (idx === -1 && norm.includes("面")) {
    idx = updated.findIndex((s) => s.type === "interview" && (s.status === "current" || s.status === "pending"));
  }
  if (idx === -1) {
    idx = updated.findIndex((s) => s.status === "current");
  }
  if (idx === -1) return updated;

  for (let i = 0; i < idx; i++) {
    if (updated[i].status === "pending" || updated[i].status === "current") {
      updated[i].status = "pass";
    }
  }
  return applyStageStatusChange(updated, idx, outcome);
}

export function validateStageDrafts(value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) return "流程至少保留一个阶段";
  if (value.length > 30) return "流程最多支持 30 个阶段";
  const ids = new Set<string>();
  for (const [idx, item] of value.entries()) {
    if (!item || typeof item !== "object" || typeof (item as StageDraft).name !== "string") {
      return "阶段格式无效";
    }
    const name = (item as StageDraft).name.trim();
    if (!name) return "阶段名称不能为空";
    if (name.length > 40) return "阶段名称不能超过 40 个字符";
    const id = ((item as StageDraft).id || "").trim() || `stage-${idx + 1}`;
    if (ids.has(id)) return "阶段标识不能重复";
    ids.add(id);
  }
  return null;
}

export function isRecordFailed(stages: readonly Stage[]): boolean {
  return stages.some((s) => s.status === "fail");
}

export function isRecordRejected(stages: readonly Stage[]): boolean {
  return stages.some((s) => s.status === "rejected");
}

export function isRecordTerminated(stages: readonly Stage[]): boolean {
  return stages.some((s) => s.status === "fail" || s.status === "rejected");
}

export function isRecordOffered(stages: readonly Stage[]): boolean {
  return stages.some((s) => s.type === "offer" && s.status === "pass");
}

export function hasEnteredInterview(stages: readonly Stage[]): boolean {
  return stages.some(
    (s) => s.type === "interview" && (s.status === "current" || s.status === "pass"),
  );
}

export function stageProgress(stages: readonly Stage[]): number {
  if (!stages.length) return 0;
  const done = stages.filter((s) => s.status === "pass" || s.status === "skip").length;
  return done / stages.length;
}

export function currentStageLabel(stages: readonly Stage[]): {
  label: string;
  tone: "active" | "ok" | "bad" | "muted";
} {
  if (isRecordOffered(stages)) return { label: "已获 Offer", tone: "ok" };
  const failed = stages.find((s) => s.status === "fail");
  if (failed) return { label: `${failed.name} 未通过`, tone: "bad" };
  const rejected = stages.find((s) => s.status === "rejected");
  if (rejected) return { label: `${rejected.name} 已拒绝`, tone: "muted" };
  const current = stages.find((s) => s.status === "current");
  if (current) return { label: current.name, tone: "active" };
  const lastDone = [...stages].reverse().find((s) => s.status === "pass" || s.status === "skip");
  if (lastDone) return { label: `${lastDone.name} 已完成`, tone: "ok" };
  return { label: stages[0]?.name || "未开始", tone: "muted" };
}

export function computePipelineMetrics(records: readonly ApplicationRecord[]) {
  const total = records.length;
  const active = records.filter(
    (r) => r.status === "active" && !isRecordTerminated(r.stages) && !isRecordOffered(r.stages),
  ).length;
  const offered = records.filter((r) => isRecordOffered(r.stages)).length;
  const failed = records.filter((r) => isRecordFailed(r.stages)).length;
  const rejected = records.filter((r) => isRecordRejected(r.stages)).length;
  const interviewed = records.filter((r) => hasEnteredInterview(r.stages)).length;
  const interviewRate = total > 0 ? Math.round((interviewed / total) * 100) : 0;
  return { total, active, offered, failed, rejected, interviewed, interviewRate };
}

export function visitFreshness(iso?: string, nowMs = Date.now()): {
  text: string;
  level: "fresh" | "warm" | "orange" | "stale" | "none";
} {
  if (!iso) return { text: "未访问", level: "none" };
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return { text: "未访问", level: "none" };
  const hours = Math.max(0, (nowMs - ts) / 3600000);
  if (hours < 1) return { text: "刚刚访问", level: "fresh" };
  if (hours < 24) return { text: `${Math.floor(hours)}小时前访问`, level: "fresh" };
  const days = Math.floor(hours / 24);
  if (days <= 2) return { text: `${days}天前访问`, level: "fresh" };
  if (days <= 5) return { text: `${days}天前访问`, level: "warm" };
  if (days <= 10) return { text: `${days}天前访问`, level: "orange" };
  return { text: `${days}天前访问`, level: "stale" };
}

export interface CompanyGroup {
  company: string;
  pinned: boolean;
  url?: string;
  lastVisitedAt?: string;
  records: ApplicationRecord[];
  bestProgress: number;
  allTerminated: boolean;
  hasOffer: boolean;
  latestUpdatedAt: string;
  earliestCreatedAt: string;
}

export function groupAndSortCompanies(
  records: readonly ApplicationRecord[],
  sortBy: SortMode,
): CompanyGroup[] {
  const byCompany = new Map<string, ApplicationRecord[]>();
  for (const r of records) {
    const key = r.company.trim();
    const list = byCompany.get(key) || [];
    list.push(r);
    byCompany.set(key, list);
  }

  const groups: CompanyGroup[] = [];
  for (const [company, list] of byCompany) {
    const sortedRecords = [...list].sort((a, b) => {
      const aTerm = isRecordTerminated(a.stages) ? 1 : 0;
      const bTerm = isRecordTerminated(b.stages) ? 1 : 0;
      if (aTerm !== bTerm) return aTerm - bTerm;
      return stageProgress(b.stages) - stageProgress(a.stages);
    });
    const pinned = sortedRecords.some((r) => r.pinned);
    const url = sortedRecords.find((r) => r.url)?.url;
    const visitTimes = sortedRecords
      .map((r) => r.lastVisitedAt)
      .filter((x): x is string => !!x)
      .sort();
    const lastVisitedAt = visitTimes.at(-1);
    const bestProgress = Math.max(...sortedRecords.map((r) => stageProgress(r.stages)));
    const allTerminated = sortedRecords.every((r) => isRecordTerminated(r.stages));
    const hasOffer = sortedRecords.some((r) => isRecordOffered(r.stages));
    const latestUpdatedAt = sortedRecords.map((r) => r.updatedAt).sort().at(-1) || "";
    const earliestCreatedAt = sortedRecords.map((r) => r.createdAt).sort()[0] || "";
    groups.push({
      company,
      pinned,
      url,
      lastVisitedAt,
      records: sortedRecords,
      bestProgress,
      allTerminated,
      hasOffer,
      latestUpdatedAt,
      earliestCreatedAt,
    });
  }

  return groups.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.allTerminated !== b.allTerminated) return a.allTerminated ? 1 : -1;
    if (sortBy === "company") return a.company.localeCompare(b.company, "zh-CN");
    if (sortBy === "visited") {
      return (b.lastVisitedAt || "").localeCompare(a.lastVisitedAt || "");
    }
    if (sortBy === "created") {
      return b.earliestCreatedAt.localeCompare(a.earliestCreatedAt);
    }
    if (sortBy === "updated") {
      return b.latestUpdatedAt.localeCompare(a.latestUpdatedAt);
    }
    if (b.bestProgress !== a.bestProgress) return b.bestProgress - a.bestProgress;
    return b.latestUpdatedAt.localeCompare(a.latestUpdatedAt);
  });
}
