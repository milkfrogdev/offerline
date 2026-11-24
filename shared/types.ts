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

export const EVENT_KINDS = [
  "interview",
  "written_test",
  "assessment",
  "offer",
  "other",
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export const EVENT_STATUSES = [
  "pending_confirm",
  "confirmed",
  "completed",
  "dismissed",
] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const EVENT_TIME_MODES = ["scheduled", "deadline", "flexible"] as const;
export type EventTimeMode = (typeof EVENT_TIME_MODES)[number];

export const NOTE_FEELINGS = ["great", "normal", "hard"] as const;
export type NoteFeeling = (typeof NOTE_FEELINGS)[number];

export const MAIL_PROVIDERS = [
  "qq",
  "163",
  "126",
  "gmail",
  "outlook",
  "exmail",
  "custom",
] as const;
export type MailProvider = (typeof MAIL_PROVIDERS)[number];

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
  /** 可选：客户端口令加密的私密详情 */
  sealed?: EncryptedEnvelope;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleEvent {
  id: string;
  userId?: number;
  recordId?: string;
  company: string;
  position: string;
  stageName?: string;
  title: string;
  kind: EventKind;
  startAt: string;
  endAt?: string;
  timeMode?: EventTimeMode;
  location?: string;
  source: "email" | "manual";
  mailMessageId?: string;
  mailSubject?: string;
  mailFrom?: string;
  mailSnippet?: string;
  status: EventStatus;
  syncedToRecord: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InterviewNote {
  id: string;
  userId?: number;
  recordId?: string;
  company: string;
  position: string;
  stageName: string;
  interviewedAt?: string;
  feeling: NoteFeeling;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface MailAccountPublic {
  configured: boolean;
  enabled: boolean;
  provider: MailProvider;
  host: string;
  port: number;
  secure: boolean;
  email: string;
  hasPassword: boolean;
  folder: string;
  pollIntervalMin: number;
  lookbackDays: number;
  llmEnabled: boolean;
  llmBaseUrl: string;
  llmModel: string;
  hasLlmKey: boolean;
  lastSyncedAt?: string;
  lastError?: string;
  lastMatchedCount: number;
}

export interface EmailParseResult {
  matched: boolean;
  confidence: number;
  company: string;
  position: string;
  stageName: string;
  title: string;
  kind: EventKind;
  actionHint: "schedule" | "pass" | "fail" | "offer" | "applied";
  startAt?: string;
  endAt?: string;
  timeMode?: EventTimeMode;
  location?: string;
  snippet: string;
  reason?: string;
  parserSource?: "rules" | "llm";
}

export interface UserProfile {
  id: number;
  username: string;
  role: "user" | "admin";
  createdAt?: string;
}

export type SortMode = "progress" | "visited" | "created" | "updated" | "company";
export type MainTab = "home" | "pipeline" | "schedule" | "notes" | "account";
export type MetricFilter = "all" | "active" | "interview" | "offer" | "failed";
