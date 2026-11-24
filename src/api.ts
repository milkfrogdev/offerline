import type { ImportedTimelineRecord } from "../shared/import-parser";
import type {
  ApplicationRecord,
  EmailParseResult,
  EventKind,
  EventStatus,
  EventTimeMode,
  InterviewNote,
  MailAccountPublic,
  MailProvider,
  NoteFeeling,
  ScheduleEvent,
  StageDraft,
  StageStatus,
  UserProfile,
} from "../shared/types";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "ERROR",
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const hasBody = init?.body !== undefined;
  const resp = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers || {}),
    },
  });
  const text = await resp.text();
  const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!resp.ok) {
    throw new ApiError(
      resp.status,
      typeof data.error === "string" ? data.error : `请求失败 (${resp.status})`,
      typeof data.code === "string" ? data.code : "ERROR",
    );
  }
  return data as T;
}

export const api = {
  session: () =>
    request<{ user: UserProfile | null; registrationOpen: boolean; clientEntry?: string }>(
      "/api/session",
    ),
  register: (username: string, password: string) =>
    request<{ user: UserProfile }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  login: (username: string, password: string) =>
    request<{ user: UserProfile }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: boolean }>("/api/auth/password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  // Application records
  listRecords: () => request<{ items: ApplicationRecord[] }>("/api/records"),
  createRecord: (payload: {
    company: string;
    position: string;
    url?: string;
    stages?: StageDraft[];
  }) =>
    request<ApplicationRecord>("/api/records", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateRecord: (
    id: string,
    payload: {
      company?: string;
      position?: string;
      url?: string | null;
      status?: "active" | "archived";
      pinned?: boolean;
      stages?: StageDraft[];
    },
  ) =>
    request<ApplicationRecord>(`/api/records/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  updateStageStatus: (id: string, stageIndex: number, status: StageStatus) =>
    request<ApplicationRecord>(`/api/records/${encodeURIComponent(id)}/stage`, {
      method: "PATCH",
      body: JSON.stringify({ stageIndex, status }),
    }),
  pinCompany: (company: string, pinned: boolean) =>
    request<{ ok: boolean }>("/api/records/company-pin", {
      method: "PUT",
      body: JSON.stringify({ company, pinned }),
    }),
  visitCompany: (company: string) =>
    request<{ ok: boolean; lastVisitedAt: string }>("/api/records/company-visit", {
      method: "POST",
      body: JSON.stringify({ company }),
    }),
  deleteRecord: (id: string) =>
    request<{ ok: boolean }>(`/api/records/${encodeURIComponent(id)}`, { method: "DELETE" }),
  importRecords: (data: unknown[], mode: "merge" | "overwrite") =>
    request<{ ok: boolean; count: number }>("/api/records/import", {
      method: "POST",
      body: JSON.stringify({ data, mode }),
    }),
  smartParseRecords: (payload: {
    text: string;
    llm?: { baseUrl: string; model: string; apiKey?: string };
    saveLlmConfig?: boolean;
  }) =>
    request<{
      items: ImportedTimelineRecord[];
      source: "llm" | "json";
      model: string;
      mailConfig?: MailAccountPublic;
    }>("/api/records/smart-parse", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // Schedule events
  listEvents: () => request<{ items: ScheduleEvent[] }>("/api/events"),
  createEvent: (payload: {
    recordId?: string;
    company: string;
    position?: string;
    stageName?: string;
    title: string;
    kind: EventKind;
    startAt: string;
    endAt?: string;
    timeMode?: EventTimeMode;
    location?: string;
    notes?: string;
  }) =>
    request<ScheduleEvent>("/api/events", {
      method: "POST",
      body: JSON.stringify({ ...payload, source: "manual", status: "confirmed" }),
    }),
  updateEvent: (
    id: string,
    payload: {
      recordId?: string | null;
      company?: string;
      position?: string;
      stageName?: string | null;
      title?: string;
      kind?: EventKind;
      startAt?: string;
      endAt?: string | null;
      timeMode?: EventTimeMode;
      location?: string | null;
      status?: EventStatus;
      notes?: string;
    },
  ) =>
    request<ScheduleEvent>(`/api/events/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteEvent: (id: string) =>
    request<{ ok: boolean }>(`/api/events/${encodeURIComponent(id)}`, { method: "DELETE" }),
  getCalendarToken: () => request<{ token: string; subscribeUrl: string }>("/api/calendar/token"),
  rotateCalendarToken: () =>
    request<{ token: string; subscribeUrl: string }>("/api/calendar/token/rotate", {
      method: "POST",
    }),

  // Mail listener
  getMailConfig: () => request<MailAccountPublic>("/api/mail/config"),
  saveMailConfig: (payload: {
    enabled: boolean;
    provider: MailProvider;
    host: string;
    port: number;
    secure: boolean;
    email: string;
    password?: string;
    folder: string;
    pollIntervalMin: number;
    lookbackDays: number;
    llmEnabled?: boolean;
    llmBaseUrl?: string;
    llmModel?: string;
    llmApiKey?: string;
  }) =>
    request<MailAccountPublic>("/api/mail/config", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  saveLlmConfig: (payload: {
    llmEnabled: boolean;
    llmBaseUrl: string;
    llmModel: string;
    llmApiKey?: string;
  }) =>
    request<MailAccountPublic>("/api/mail/llm-config", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  testLlmConfig: (payload: {
    baseUrl: string;
    model: string;
    apiKey?: string;
  }) =>
    request<{
      ok: boolean;
      latencyMs: number;
      normalizedEndpoint: string;
      jsonMode: "native" | "fallback";
    }>("/api/mail/test-llm", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  deleteMailConfig: () =>
    request<MailAccountPublic>("/api/mail/config", { method: "DELETE" }),
  testMailConfig: (payload: {
    host: string;
    port: number;
    secure: boolean;
    email: string;
    password?: string;
    folder: string;
  }) =>
    request<{ ok: boolean; totalMessages: number }>("/api/mail/test", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  syncMailNow: () =>
    request<{
      summary: { scanned: number; created: number; merged: number; skipped: number; syncedAt: string };
      config: MailAccountPublic;
      events: ScheduleEvent[];
    }>("/api/mail/sync", { method: "POST" }),
  parseEmailPreview: (payload: {
    subject: string;
    from: string;
    text: string;
    createEvent: boolean;
  }) =>
    request<{
      parsed: EmailParseResult;
      matchedRecord: { id: string; company: string; position: string; matchType: string } | null;
      event: ScheduleEvent | null;
      merged: boolean;
    }>("/api/mail/parse-preview", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // Interview notes
  listNotes: () => request<{ items: InterviewNote[] }>("/api/notes"),
  createNote: (payload: {
    recordId?: string;
    company: string;
    position?: string;
    stageName: string;
    interviewedAt?: string;
    feeling: NoteFeeling;
    content: string;
  }) =>
    request<InterviewNote>("/api/notes", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateNote: (
    id: string,
    payload: {
      company?: string;
      position?: string;
      stageName?: string;
      interviewedAt?: string | null;
      feeling?: NoteFeeling;
      content?: string;
    },
  ) =>
    request<InterviewNote>(`/api/notes/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteNote: (id: string) =>
    request<{ ok: boolean }>(`/api/notes/${encodeURIComponent(id)}`, { method: "DELETE" }),
};
