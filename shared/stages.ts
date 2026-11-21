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
  "Offer评估",
  "正式offer",
] as const;

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
  high: "高意向",
  normal: "常规",
  low: "保底",
};

export function inferStageType(stage: Pick<StageDraft, "name" | "type">): StageType {
  if (stage.type && (STAGE_TYPES as readonly string[]).includes(stage.type)) {
    return stage.type;
  }
  const normalized = stage.name.trim().toLowerCase();
  if (normalized === "投递") return "application";
  if (["一面", "二面", "三面", "hr面"].includes(normalized)) return "interview";
  if (normalized === "正式offer" || normalized === "offer") return "offer";
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
      const fallbackPending = nextPending !== -1 ? nextPending : updated.findIndex((s) => s.status === "pending");
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
  if (failed) return { label: `${failed.name} · 未通过`, tone: "bad" };
  const rejected = stages.find((s) => s.status === "rejected");
  if (rejected) return { label: `${rejected.name} · 已拒绝`, tone: "muted" };
  const current = stages.find((s) => s.status === "current");
  if (current) return { label: current.name, tone: "active" };
  const lastDone = [...stages].reverse().find((s) => s.status === "pass" || s.status === "skip");
  if (lastDone) return { label: `${lastDone.name} · 已完成`, tone: "ok" };
  return { label: stages[0]?.name || "未开始", tone: "muted" };
}

export type BoardLane = "screening" | "assessment" | "interview" | "closed";

export function classifyBoardLane(record: ApplicationRecord): BoardLane {
  if (record.status === "archived" || isRecordTerminated(record.stages) || isRecordOffered(record.stages)) {
    return "closed";
  }
  const current = record.stages.find((s) => s.status === "current");
  if (!current) return "screening";
  if (current.type === "interview" || current.type === "offer") return "interview";
  if (current.type === "application") return "screening";
  return "assessment";
}

export function computePipelineMetrics(records: readonly ApplicationRecord[], todayStr = new Date().toISOString().slice(0, 10)) {
  const total = records.length;
  const active = records.filter(
    (r) => r.status === "active" && !isRecordTerminated(r.stages) && !isRecordOffered(r.stages),
  ).length;
  const offered = records.filter((r) => isRecordOffered(r.stages)).length;
  const interviewed = records.filter((r) => hasEnteredInterview(r.stages)).length;
  const interviewRate = total > 0 ? Math.round((interviewed / total) * 100) : 0;
  const upcomingFollowUps = records.filter(
    (r) =>
      r.status === "active" &&
      !isRecordTerminated(r.stages) &&
      r.nextFollowUpAt &&
      r.nextFollowUpAt >= todayStr,
  ).length;
  return { total, active, offered, interviewed, interviewRate, upcomingFollowUps };
}

export function visitFreshness(iso?: string, nowMs = Date.now()): {
  text: string;
  level: "fresh" | "warm" | "stale" | "none";
} {
  if (!iso) return { text: "未访问", level: "none" };
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return { text: "未访问", level: "none" };
  const hours = Math.max(0, (nowMs - ts) / 3600000);
  if (hours < 24) return { text: "今天看过", level: "fresh" };
  const days = Math.floor(hours / 24);
  if (days <= 3) return { text: `${days} 天前`, level: "fresh" };
  if (days <= 7) return { text: `${days} 天前`, level: "warm" };
  return { text: `${days} 天前`, level: "stale" };
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
  nearestFollowUp: string;
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
    const followUps = sortedRecords
      .map((r) => r.nextFollowUpAt)
      .filter((x): x is string => !!x)
      .sort();
    const nearestFollowUp = followUps[0] || "";
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
      nearestFollowUp,
      latestUpdatedAt,
      earliestCreatedAt,
    });
  }

  return groups.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.allTerminated !== b.allTerminated) return a.allTerminated ? 1 : -1;
    if (sortBy === "company") return a.company.localeCompare(b.company, "zh-CN");
    if (sortBy === "followup") {
      if (a.nearestFollowUp && b.nearestFollowUp) {
        return a.nearestFollowUp.localeCompare(b.nearestFollowUp);
      }
      if (a.nearestFollowUp !== b.nearestFollowUp) return a.nearestFollowUp ? -1 : 1;
      return b.latestUpdatedAt.localeCompare(a.latestUpdatedAt);
    }
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
