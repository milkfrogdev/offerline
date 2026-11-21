export const STAGE_TYPES = ["application", "interview", "offer", "other"] as const;
export type StageType = (typeof STAGE_TYPES)[number];

export const STAGE_STATUSES = [
  "pending",
  "current",
  "pass",
  "fail",
  "rejected",
  "skip",
] as const;
export type StageStatus = (typeof STAGE_STATUSES)[number];

export const PRIORITY_LEVELS = ["high", "normal", "low"] as const;
export type PriorityLevel = (typeof PRIORITY_LEVELS)[number];

export interface Stage {
  id: string;
  name: string;
  type: StageType;
  status: StageStatus;
}

export interface StageDraft {
  id?: string;
  name: string;
  type?: StageType;
  status?: StageStatus;
}

export interface EncryptedEnvelope {
  v: 1;
  alg: "AES-256-GCM";
  kdf: "PBKDF2-SHA256";
  iterations: number;
  salt: string;
  iv: string;
  ct: string;
}

export interface ApplicationRecord {
  id: string;
  userId?: number;
  company: string;
  position: string;
  stages: Stage[];
  status: "active" | "archived";
  url?: string;
  city?: string;
  salary?: string;
  source?: string;
  priority: PriorityLevel;
  nextFollowUpAt?: string;
  lastVisitedAt?: string;
  pinned: boolean;
  notes?: string;
  /** 可选：客户端用口令加密的私密详情（薪资、笔记等），服务器无法解密 */
  sealed?: EncryptedEnvelope;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfile {
  id: number;
  username: string;
  role: "user" | "admin";
  createdAt?: string;
}

export type SortMode = "progress" | "followup" | "visited" | "updated" | "created" | "company";
export type ViewMode = "table" | "board";
export type FilterStatus = "all" | "active" | "archived";
