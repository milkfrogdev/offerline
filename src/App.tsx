import React, { useCallback, useEffect, useMemo, useState } from "react";
import { computePipelineMetrics } from "../shared/stages";
import type {
  ApplicationRecord,
  InterviewNote,
  MailAccountPublic,
  MainTab,
  MetricFilter,
  ScheduleEvent,
  StageStatus,
  UserProfile,
} from "../shared/types";
import { api } from "./api";
import { AuthView } from "./components/AuthView";
import {
  CalendarSubscribeModal,
  EventModal,
  MailSettingsModal,
  NoteModal,
  RecordModal,
  VaultModal,
} from "./components/Modals";
import { NotesView } from "./components/NotesView";
import { PipelineView } from "./components/PipelineView";
import { ScheduleView } from "./components/ScheduleView";
import { Sidebar } from "./components/Sidebar";

const THEME_KEY = "offerline.theme";

function loadInitialTheme(): "light" | "dark" {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function App() {
  const [theme, setTheme] = useState<"light" | "dark">(loadInitialTheme);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [registrationOpen, setRegistrationOpen] = useState(true);

  const [activeTab, setActiveTab] = useState<MainTab>("pipeline");
  const [metricFilter, setMetricFilter] = useState<MetricFilter>("all");
  const [records, setRecords] = useState<ApplicationRecord[]>([]);
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [notes, setNotes] = useState<InterviewNote[]>([]);
  const [mailConfig, setMailConfig] = useState<MailAccountPublic | null>(null);
  const [syncingMail, setSyncingMail] = useState(false);

  const [notesFilter, setNotesFilter] = useState("");
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Modals
  const [recordModal, setRecordModal] = useState<{
    open: boolean;
    editing: ApplicationRecord | null;
    presetCompany?: string;
    presetUrl?: string;
  }>({ open: false, editing: null });
  const [mailModal, setMailModal] = useState<{ open: boolean; tab: "imap" | "parse" }>({
    open: false,
    tab: "imap",
  });
  const [eventModal, setEventModal] = useState<{
    open: boolean;
    preset?: { recordId?: string; company?: string; position?: string; stageName?: string };
  }>({ open: false });
  const [noteModal, setNoteModal] = useState<{
    open: boolean;
    editing: InterviewNote | null;
    preset?: { recordId?: string; company?: string; position?: string; stageName?: string };
  }>({ open: false, editing: null });
  const [subscribeOpen, setSubscribeOpen] = useState(false);
  const [vaultOpen, setVaultOpen] = useState(false);

  const showToast = useCallback((text: string, kind: "ok" | "err" = "ok") => {
    setToast({ kind, text });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const loadAllData = useCallback(async () => {
    const [recRes, evRes, noteRes, mailRes] = await Promise.all([
      api.listRecords(),
      api.listEvents(),
      api.listNotes(),
      api.getMailConfig(),
    ]);
    setRecords(recRes.items);
    setEvents(evRes.items);
    setNotes(noteRes.items);
    setMailConfig(mailRes);
  }, []);

  useEffect(() => {
    void api
      .session()
      .then(async (res) => {
        setUser(res.user);
        setRegistrationOpen(res.registrationOpen);
        if (res.user) {
          await loadAllData();
        }
      })
      .finally(() => setLoading(false));
  }, [loadAllData]);

  const existingCompanies = useMemo(() => {
    const map = new Map<string, string | undefined>();
    for (const r of records) {
      const name = r.company.trim();
      if (!name) continue;
      if (!map.has(name) || (!map.get(name) && r.url)) {
        map.set(name, r.url);
      }
    }
    return [...map.entries()].map(([company, url]) => ({ company, url }));
  }, [records]);

  const metrics = useMemo(() => computePipelineMetrics(records), [records]);

  const pendingEventCount = useMemo(
    () => events.filter((e) => e.status === "pending_confirm").length,
    [events],
  );
  const upcomingEventCount = useMemo(() => {
    const now = Date.now() - 30 * 60_000;
    return events.filter((e) => e.status === "confirmed" && Date.parse(e.startAt) >= now).length;
  }, [events]);

  async function handleLogin(username: string, password: string) {
    const res = await api.login(username, password);
    setUser(res.user);
    await loadAllData();
  }

  async function handleRegister(username: string, password: string) {
    const res = await api.register(username, password);
    setUser(res.user);
    await loadAllData();
  }

  async function handleLogout() {
    await api.logout();
    setUser(null);
    setRecords([]);
    setEvents([]);
    setNotes([]);
    setMailConfig(null);
  }

  async function handleChangeStageStatus(recordId: string, stageIndex: number, status: StageStatus) {
    try {
      const updated = await api.updateStageStatus(recordId, stageIndex, status);
      setRecords((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    } catch (err) {
      showToast(err instanceof Error ? err.message : "状态更新失败。", "err");
    }
  }

  async function handlePinCompany(company: string, pinned: boolean) {
    try {
      await api.pinCompany(company, pinned);
      setRecords((prev) => prev.map((r) => (r.company === company ? { ...r, pinned } : r)));
      showToast(pinned ? `已置顶 ${company}` : `已取消置顶 ${company}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "操作失败。", "err");
    }
  }

  async function handleVisitCompany(company: string, url?: string) {
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    try {
      const res = await api.visitCompany(company);
      setRecords((prev) =>
        prev.map((r) => (r.company === company ? { ...r, lastVisitedAt: res.lastVisitedAt } : r)),
      );
    } catch {
      // 忽略访问打卡异常
    }
  }

  async function handleDeleteRecord(record: ApplicationRecord) {
    if (!window.confirm(`确定删除「${record.company} · ${record.position}」吗？`)) return;
    try {
      await api.deleteRecord(record.id);
      setRecords((prev) => prev.filter((r) => r.id !== record.id));
      showToast("已删除投递记录");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "删除失败。", "err");
    }
  }

  async function handleSyncMail() {
    setSyncingMail(true);
    try {
      const res = await api.syncMailNow();
      setMailConfig(res.config);
      setEvents(res.events);
      showToast(
        res.summary.created > 0
          ? `同步完成，新发现 ${res.summary.created} 条日程`
          : `同步完成，扫描 ${res.summary.scanned} 封邮件，暂无新日程`,
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : "邮箱同步失败。", "err");
    } finally {
      setSyncingMail(false);
    }
  }

  async function handleConfirmEvent(ev: ScheduleEvent) {
    try {
      const updated = await api.updateEvent(ev.id, { status: "confirmed" });
      setEvents((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
      showToast("已加入日程");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "确认失败。", "err");
    }
  }

  async function handleSyncEventToRecord(ev: ScheduleEvent) {
    try {
      const res = await api.syncEventToRecord(ev.id);
      setEvents((prev) => prev.map((e) => (e.id === res.event.id ? res.event : e)));
      setRecords((prev) => {
        const exists = prev.some((r) => r.id === res.record.id);
        return exists
          ? prev.map((r) => (r.id === res.record.id ? res.record : r))
          : [res.record, ...prev];
      });
      showToast(`已同步「${res.record.company}」进度到时间线`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "同步进度失败。", "err");
    }
  }

  async function handleToggleCompleteEvent(ev: ScheduleEvent) {
    try {
      const updated = await api.updateEvent(ev.id, { status: "completed" });
      setEvents((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
      showToast("已标记完成");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "操作失败。", "err");
    }
  }

  async function handleDismissEvent(ev: ScheduleEvent) {
    try {
      const updated = await api.updateEvent(ev.id, { status: "dismissed" });
      setEvents((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    } catch (err) {
      showToast(err instanceof Error ? err.message : "忽略失败。", "err");
    }
  }

  async function handleDeleteEvent(ev: ScheduleEvent) {
    try {
      await api.deleteEvent(ev.id);
      setEvents((prev) => prev.filter((e) => e.id !== ev.id));
      showToast("已删除日程");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "删除失败。", "err");
    }
  }

  async function handleDeleteNote(note: InterviewNote) {
    if (!window.confirm(`确定删除「${note.company} · ${note.stageName}」的面经吗？`)) return;
    try {
      await api.deleteNote(note.id);
      setNotes((prev) => prev.filter((n) => n.id !== note.id));
      showToast("已删除面经");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "删除失败。", "err");
    }
  }

  if (loading) {
    return <div className="boot-screen">正在加载…</div>;
  }

  if (!user) {
    return (
      <AuthView
        registrationOpen={registrationOpen}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
        onLogin={handleLogin}
        onRegister={handleRegister}
      />
    );
  }

  return (
    <div className="app-shell">
      <Sidebar
        user={user}
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        metrics={metrics}
        metricFilter={metricFilter}
        onSelectMetricFilter={(f) => {
          setMetricFilter((cur) => (activeTab === "pipeline" && cur === f && f !== "all" ? "all" : f));
          setActiveTab("pipeline");
        }}
        pendingEventCount={pendingEventCount}
        upcomingEventCount={upcomingEventCount}
        noteCount={notes.length}
        mailConfig={mailConfig}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
        onOpenMailModal={() => setMailModal({ open: true, tab: "imap" })}
        onOpenVaultModal={() => setVaultOpen(true)}
        onLogout={() => void handleLogout()}
      />

      <main className="main-area">
        {activeTab === "pipeline" && (
          <PipelineView
            records={records}
            events={events}
            notes={notes}
            metricFilter={metricFilter}
            onClearMetricFilter={() => setMetricFilter("all")}
            onAddRecord={() => setRecordModal({ open: true, editing: null })}
            onAddForCompany={(company, url) =>
              setRecordModal({ open: true, editing: null, presetCompany: company, presetUrl: url })
            }
            onEditRecord={(rec) => setRecordModal({ open: true, editing: rec })}
            onDeleteRecord={(rec) => void handleDeleteRecord(rec)}
            onChangeStageStatus={handleChangeStageStatus}
            onPinCompany={handlePinCompany}
            onVisitCompany={handleVisitCompany}
            onScheduleForStage={(rec, stageName) =>
              setEventModal({
                open: true,
                preset: {
                  recordId: rec.id,
                  company: rec.company,
                  position: rec.position,
                  stageName,
                },
              })
            }
            onWriteNoteForStage={(rec, stageName) =>
              setNoteModal({
                open: true,
                editing: null,
                preset: {
                  recordId: rec.id,
                  company: rec.company,
                  position: rec.position,
                  stageName,
                },
              })
            }
            onOpenScheduleTab={() => setActiveTab("schedule")}
            onOpenNotesForRecord={(company) => {
              setNotesFilter(company);
              setActiveTab("notes");
            }}
          />
        )}

        {activeTab === "schedule" && (
          <ScheduleView
            events={events}
            mailConfig={mailConfig}
            syncing={syncingMail}
            onSyncMail={handleSyncMail}
            onOpenMailSettings={() => setMailModal({ open: true, tab: "imap" })}
            onOpenParseModal={() => setMailModal({ open: true, tab: "parse" })}
            onOpenSubscribeModal={() => setSubscribeOpen(true)}
            onAddEvent={() => setEventModal({ open: true })}
            onConfirmEvent={handleConfirmEvent}
            onSyncEventToRecord={handleSyncEventToRecord}
            onToggleComplete={handleToggleCompleteEvent}
            onDismissEvent={handleDismissEvent}
            onDeleteEvent={handleDeleteEvent}
            onWriteNoteFromEvent={(ev) =>
              setNoteModal({
                open: true,
                editing: null,
                preset: {
                  recordId: ev.recordId,
                  company: ev.company,
                  position: ev.position,
                  stageName: ev.stageName || "一面",
                },
              })
            }
          />
        )}

        {activeTab === "notes" && (
          <NotesView
            notes={notes}
            initialFilter={notesFilter}
            onClearInitialFilter={() => setNotesFilter("")}
            onAddNote={() => setNoteModal({ open: true, editing: null })}
            onEditNote={(n) => setNoteModal({ open: true, editing: n })}
            onDeleteNote={(n) => void handleDeleteNote(n)}
          />
        )}
      </main>

      {recordModal.open && (
        <RecordModal
          editing={recordModal.editing}
          presetCompany={recordModal.presetCompany}
          presetUrl={recordModal.presetUrl}
          existingCompanies={existingCompanies}
          onClose={() => setRecordModal({ open: false, editing: null })}
          onSaved={(saved, isEdit) => {
            setRecords((prev) =>
              isEdit ? prev.map((r) => (r.id === saved.id ? saved : r)) : [saved, ...prev],
            );
            showToast(isEdit ? "已更新投递记录" : "已添加投递记录");
          }}
        />
      )}

      {mailModal.open && (
        <MailSettingsModal
          config={mailConfig}
          initialTab={mailModal.tab}
          onClose={() => setMailModal({ open: false, tab: "imap" })}
          onConfigUpdated={(cfg) => setMailConfig(cfg)}
          onEventCreated={(ev) => {
            setEvents((prev) => [ev, ...prev]);
            setActiveTab("schedule");
          }}
        />
      )}

      {eventModal.open && (
        <EventModal
          preset={eventModal.preset}
          existingCompanies={existingCompanies}
          onClose={() => setEventModal({ open: false })}
          onCreated={(ev) => {
            setEvents((prev) => [...prev, ev]);
            showToast("已创建日程");
          }}
        />
      )}

      {subscribeOpen && <CalendarSubscribeModal onClose={() => setSubscribeOpen(false)} />}

      {noteModal.open && (
        <NoteModal
          editing={noteModal.editing}
          preset={noteModal.preset}
          existingCompanies={existingCompanies}
          onClose={() => setNoteModal({ open: false, editing: null })}
          onSaved={(saved, isEdit) => {
            setNotes((prev) =>
              isEdit ? prev.map((n) => (n.id === saved.id ? saved : n)) : [saved, ...prev],
            );
            showToast(isEdit ? "已更新面经记录" : "已保存面经记录");
          }}
        />
      )}

      {vaultOpen && (
        <VaultModal
          records={records}
          onClose={() => setVaultOpen(false)}
          onImported={loadAllData}
        />
      )}

      {toast && (
        <div className={`toast toast-${toast.kind}`} role="status">
          {toast.text}
        </div>
      )}
    </div>
  );
}
