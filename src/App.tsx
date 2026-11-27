import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
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
import { AccountView } from "./components/AccountView";
import { AuthView } from "./components/AuthView";
import { HomeView } from "./components/HomeView";
import { IconAlertCircle, IconCheckCircle } from "./components/Icons";
import {
  CalendarSubscribeModal,
  EventModal,
  MailSettingsModal,
  NoteModal,
  RecordModal,
} from "./components/Modals";
import { NotesView } from "./components/NotesView";
import { PipelineView } from "./components/PipelineView";
import { ScheduleView } from "./components/ScheduleView";
import { Sidebar } from "./components/Sidebar";
import { SmartImportModal } from "./components/SmartImportModal";
import { StarPromptCard } from "./components/StarPromptCard";
import { TooltipHost } from "./components/TooltipHost";
import { dismissStarPrompt, getStarPromptRemainingMs } from "./starPrompt";

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

  const [activeTab, setActiveTab] = useState<MainTab>("home");
  const [records, setRecords] = useState<ApplicationRecord[]>([]);
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [notes, setNotes] = useState<InterviewNote[]>([]);
  const [mailConfig, setMailConfig] = useState<MailAccountPublic | null>(null);
  const [syncingMail, setSyncingMail] = useState(false);

  const [pipelineFilter, setPipelineFilter] = useState<MetricFilter | null>(null);
  const [pipelineQuery, setPipelineQuery] = useState("");
  const [notesFilter, setNotesFilter] = useState("");
  const [initialNoteId, setInitialNoteId] = useState<string | null>(null);
  const [latestNoteId, setLatestNoteId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [starPromptOpen, setStarPromptOpen] = useState(false);
  const lastVersionCheckRef = useRef(0);
  const lastEventsRefreshRef = useRef(0);
  const knownPendingIdsRef = useRef<Set<string> | null>(null);
  const eventsDigestRef = useRef("");
  const mailDigestRef = useRef("");

  // Modals
  const [recordModal, setRecordModal] = useState<{
    open: boolean;
    editing: ApplicationRecord | null;
    presetCompany?: string;
    presetUrl?: string;
  }>({ open: false, editing: null });
  const [mailModal, setMailModal] = useState<{ open: boolean; tab: "imap" | "llm" | "parse" }>({
    open: false,
    tab: "imap",
  });
  const [eventModal, setEventModal] = useState<{
    open: boolean;
    editing?: ScheduleEvent | null;
    preset?: { recordId?: string; company?: string; position?: string; stageName?: string };
  }>({ open: false, editing: null });
  const [noteModal, setNoteModal] = useState<{
    open: boolean;
    editing: InterviewNote | null;
    preset?: { recordId?: string; company?: string; position?: string; stageName?: string };
  }>({ open: false, editing: null });
  const [subscribeOpen, setSubscribeOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

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

  const handleToggleTheme = useCallback(() => {
    const next = theme === "dark" ? "light" : "dark";
    const root = document.documentElement;
    const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const docWithVt = document as Document & {
      startViewTransition?: (cb: () => void) => { finished: Promise<void> };
    };

    const commitTheme = () => {
      root.classList.add("theme-switching");
      root.dataset.theme = next;
      localStorage.setItem(THEME_KEY, next);
      flushSync(() => {
        setTheme(next);
      });
    };

    if (typeof docWithVt.startViewTransition === "function" && !prefersReduced) {
      const transition = docWithVt.startViewTransition(commitTheme);
      void transition.finished.finally(() => {
        root.classList.remove("theme-switching");
      });
    } else {
      commitTheme();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          root.classList.remove("theme-switching");
        });
      });
    }
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
    eventsDigestRef.current = JSON.stringify(evRes.items);
    mailDigestRef.current = JSON.stringify(mailRes);
    knownPendingIdsRef.current = new Set(
      evRes.items.filter((e) => e.status === "pending_confirm").map((e) => e.id),
    );
    lastEventsRefreshRef.current = Date.now();
  }, []);

  const refreshEventsSilently = useCallback(
    async (force = false) => {
      const now = Date.now();
      if (!force && now - lastEventsRefreshRef.current < 15_000) return;
      lastEventsRefreshRef.current = now;
      try {
        const [evRes, mailRes] = await Promise.all([api.listEvents(), api.getMailConfig()]);
        const nextEvDigest = JSON.stringify(evRes.items);
        if (nextEvDigest !== eventsDigestRef.current) {
          eventsDigestRef.current = nextEvDigest;
          const prevKnown = knownPendingIdsRef.current;
          const nextPending = evRes.items.filter((e) => e.status === "pending_confirm");
          if (prevKnown) {
            const addedCount = nextPending.filter((e) => !prevKnown.has(e.id)).length;
            if (addedCount > 0) {
              showToast(`邮箱监听发现 ${addedCount} 条新待确认日程`);
            }
          }
          knownPendingIdsRef.current = new Set(nextPending.map((e) => e.id));
          setEvents(evRes.items);
        }
        const nextMailDigest = JSON.stringify(mailRes);
        if (nextMailDigest !== mailDigestRef.current) {
          mailDigestRef.current = nextMailDigest;
          setMailConfig(mailRes);
        }
      } catch {
        // 后台静默刷新失败不弹出打扰用户的报错提示
      }
    },
    [showToast],
  );

  const checkClientVersion = useCallback((serverClientEntry?: string) => {
    if (!serverClientEntry) return;
    const running = document
      .querySelector('script[type="module"][src*="/assets/index-"]')
      ?.getAttribute("src");
    if (running && running !== serverClientEntry) {
      setUpdateAvailable(true);
    }
  }, []);

  useEffect(() => {
    void api
      .session()
      .then(async (res) => {
        checkClientVersion(res.clientEntry);
        setUser(res.user);
        setRegistrationOpen(res.registrationOpen);
        if (res.user) {
          await loadAllData();
        }
      })
      .finally(() => setLoading(false));
  }, [checkClientVersion, loadAllData]);

  useEffect(() => {
    const checkOnWake = () => {
      if (document.visibilityState && document.visibilityState !== "visible") return;
      if (user) {
        void refreshEventsSilently();
      }
      const now = Date.now();
      if (now - lastVersionCheckRef.current < 60_000) return;
      lastVersionCheckRef.current = now;
      void api
        .session()
        .then((res) => checkClientVersion(res.clientEntry))
        .catch(() => {});
    };
    window.addEventListener("focus", checkOnWake);
    document.addEventListener("visibilitychange", checkOnWake);
    return () => {
      window.removeEventListener("focus", checkOnWake);
      document.removeEventListener("visibilitychange", checkOnWake);
    };
  }, [checkClientVersion, refreshEventsSilently, user]);

  useEffect(() => {
    if (!user || !mailConfig?.enabled) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState && document.visibilityState !== "visible") return;
      void refreshEventsSilently(true);
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [mailConfig?.enabled, refreshEventsSilently, user]);

  useEffect(() => {
    if (!user) {
      setStarPromptOpen(false);
      return;
    }

    let timer: number | undefined;
    const evaluateStarPrompt = () => {
      const remaining = getStarPromptRemainingMs(user.createdAt);
      if (remaining === null) {
        setStarPromptOpen(false);
        return;
      }
      if (remaining <= 0) {
        setStarPromptOpen(true);
        return;
      }
      setStarPromptOpen(false);
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(evaluateStarPrompt, Math.min(remaining, 60 * 60 * 1000));
    };

    evaluateStarPrompt();
    const onWake = () => {
      if (!document.visibilityState || document.visibilityState === "visible") {
        evaluateStarPrompt();
      }
    };
    window.addEventListener("focus", onWake);
    document.addEventListener("visibilitychange", onWake);
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      window.removeEventListener("focus", onWake);
      document.removeEventListener("visibilitychange", onWake);
    };
  }, [user]);

  const handleDismissStarPrompt = useCallback(() => {
    dismissStarPrompt();
    setStarPromptOpen(false);
  }, []);

  const handleStarPromptClick = useCallback(() => {
    dismissStarPrompt();
    setStarPromptOpen(false);
    showToast("感谢支持 OfferLine");
  }, [showToast]);

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
    if (!window.confirm(`确定删除「${record.company} ${record.position}」吗？`)) return;
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
      eventsDigestRef.current = JSON.stringify(res.events);
      mailDigestRef.current = JSON.stringify(res.config);
      knownPendingIdsRef.current = new Set(
        res.events.filter((e) => e.status === "pending_confirm").map((e) => e.id),
      );
      lastEventsRefreshRef.current = Date.now();
      const { created, merged, scanned } = res.summary;
      if (created > 0 && merged > 0) {
        showToast(`同步完成，新发现 ${created} 条日程，已合并 ${merged} 封重复提醒`);
      } else if (created > 0) {
        showToast(`同步完成，新发现 ${created} 条日程`);
      } else if (merged > 0) {
        showToast(`同步完成，已合并 ${merged} 封重复提醒到已有日程`);
      } else {
        showToast(`同步完成，扫描 ${scanned} 封邮件，暂无新日程`);
      }
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

  function handleOpenRecordInPipeline(company: string) {
    setPipelineFilter("all");
    setPipelineQuery(company);
    setActiveTab("pipeline");
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
    if (!window.confirm(`确定删除「${note.company} ${note.stageName}」的面经吗？`)) return;
    try {
      await api.deleteNote(note.id);
      setNotes((prev) => prev.filter((n) => n.id !== note.id));
      showToast("已删除面经");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "删除失败。", "err");
    }
  }

  async function handleUpdateNoteInline(
    id: string,
    payload: {
      stageName: string;
      interviewedAt: string | null;
      feeling: InterviewNote["feeling"];
      content: string;
    },
  ) {
    try {
      const updated = await api.updateNote(id, payload);
      setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
      showToast("已保存面经修改");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "保存失败。", "err");
      throw err;
    }
  }

  if (loading) {
    return <div className="boot-screen">正在加载…</div>;
  }

  if (!user) {
    return (
      <>
        {updateAvailable && (
          <div className="version-update-bar" role="status">
            <span>页面已发布新版，刷新后切换最新版本</span>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => window.location.reload()}>
              立即刷新
            </button>
          </div>
        )}
        <AuthView
          registrationOpen={registrationOpen}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          onLogin={handleLogin}
          onRegister={handleRegister}
        />
        <TooltipHost />
      </>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar
        user={user}
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        recordCount={records.length}
        pendingEventCount={pendingEventCount}
        upcomingEventCount={upcomingEventCount}
        noteCount={notes.length}
        mailConfig={mailConfig}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onOpenMailModal={() => setMailModal({ open: true, tab: "imap" })}
        onLogout={() => void handleLogout()}
      />

      <main className="main-area">
        <div key={activeTab} className="view-stage">
        {activeTab === "home" && (
          <HomeView
            user={user}
            records={records}
            events={events}
            notes={notes}
            mailConfig={mailConfig}
            onNavigatePipeline={(filter) => {
              if (filter) setPipelineFilter(filter);
              setActiveTab("pipeline");
            }}
            onNavigateSchedule={() => setActiveTab("schedule")}
            onOpenNoteById={(noteId) => {
              setInitialNoteId(noteId);
              setActiveTab("notes");
            }}
            onOpenNotesForCompany={(company) => {
              setNotesFilter(company);
              setActiveTab("notes");
            }}
            onAddRecord={() => setRecordModal({ open: true, editing: null })}
            onAddEvent={() => setEventModal({ open: true })}
            onAddNote={(preset) => setNoteModal({ open: true, editing: null, preset })}
            onConfirmEvent={handleConfirmEvent}
            onEditEvent={(ev) => setEventModal({ open: true, editing: ev })}
            onDismissEvent={handleDismissEvent}
            onOpenRecordInPipeline={handleOpenRecordInPipeline}
            onVisitCompany={handleVisitCompany}
            onOpenMailModal={() => setMailModal({ open: true, tab: "imap" })}
            onOpenParseModal={() => setMailModal({ open: true, tab: "parse" })}
          />
        )}

        {activeTab === "pipeline" && (
          <PipelineView
            records={records}
            notes={notes}
            initialFilter={pipelineFilter}
            onClearInitialFilter={() => setPipelineFilter(null)}
            initialQuery={pipelineQuery}
            onClearInitialQuery={() => setPipelineQuery("")}
            onAddRecord={() => setRecordModal({ open: true, editing: null })}
            onOpenSmartImport={() => setImportOpen(true)}
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
            onOpenNotesForRecord={(company) => {
              setNotesFilter(company);
              setActiveTab("notes");
            }}
          />
        )}

        {activeTab === "schedule" && (
          <ScheduleView
            events={events}
            records={records}
            mailConfig={mailConfig}
            syncing={syncingMail}
            onSyncMail={handleSyncMail}
            onOpenMailSettings={() => setMailModal({ open: true, tab: "imap" })}
            onOpenParseModal={() => setMailModal({ open: true, tab: "parse" })}
            onOpenSubscribeModal={() => setSubscribeOpen(true)}
            onAddEvent={() => setEventModal({ open: true, editing: null })}
            onConfirmEvent={handleConfirmEvent}
            onEditEvent={(ev) => setEventModal({ open: true, editing: ev })}
            onOpenRecordInPipeline={handleOpenRecordInPipeline}
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
            records={records}
            initialFilter={notesFilter}
            initialNoteId={initialNoteId}
            latestCreatedId={latestNoteId}
            onClearInitialFilter={() => setNotesFilter("")}
            onClearInitialNoteId={() => setInitialNoteId(null)}
            onAddNote={(preset) => setNoteModal({ open: true, editing: null, preset })}
            onUpdateNoteInline={handleUpdateNoteInline}
            onDeleteNote={(n) => void handleDeleteNote(n)}
          />
        )}

        {activeTab === "account" && (
          <AccountView
            user={user}
            records={records}
            events={events}
            notes={notes}
            mailConfig={mailConfig}
            onMailConfigUpdated={setMailConfig}
            onImported={loadAllData}
            onShowToast={showToast}
            onStarred={handleStarPromptClick}
            onLogout={() => void handleLogout()}
          />
        )}
        </div>
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
            setEvents((prev) => {
              const exists = prev.some((x) => x.id === ev.id);
              return exists ? prev.map((x) => (x.id === ev.id ? ev : x)) : [ev, ...prev];
            });
            setActiveTab("schedule");
          }}
        />
      )}

      {eventModal.open && (
        <EventModal
          editing={eventModal.editing}
          preset={eventModal.preset}
          records={records}
          existingCompanies={existingCompanies}
          onClose={() => setEventModal({ open: false, editing: null })}
          onSaved={(saved, isEdit, confirmedNow) => {
            setEvents((prev) =>
              isEdit ? prev.map((e) => (e.id === saved.id ? saved : e)) : [...prev, saved],
            );
            showToast(
              confirmedNow
                ? "已保存修改并加入日程"
                : isEdit
                  ? "已更新日程"
                  : "已创建日程",
            );
          }}
        />
      )}

      {subscribeOpen && <CalendarSubscribeModal onClose={() => setSubscribeOpen(false)} />}

      {noteModal.open && (
        <NoteModal
          editing={noteModal.editing}
          preset={noteModal.preset}
          records={records}
          existingCompanies={existingCompanies}
          onClose={() => setNoteModal({ open: false, editing: null })}
          onSaved={(saved, isEdit) => {
            setNotes((prev) =>
              isEdit ? prev.map((n) => (n.id === saved.id ? saved : n)) : [saved, ...prev],
            );
            if (!isEdit) setLatestNoteId(saved.id);
            showToast(isEdit ? "已更新面经记录" : "已保存面经记录");
          }}
        />
      )}

      {importOpen && (
        <SmartImportModal
          records={records}
          mailConfig={mailConfig}
          onClose={() => setImportOpen(false)}
          onMailConfigUpdated={(cfg) => setMailConfig(cfg)}
          onImported={async (msg) => {
            await loadAllData();
            showToast(msg);
          }}
        />
      )}

      {starPromptOpen &&
        !recordModal.open &&
        !mailModal.open &&
        !eventModal.open &&
        !noteModal.open &&
        !subscribeOpen &&
        !importOpen && (
          <StarPromptCard onStar={handleStarPromptClick} onDismiss={handleDismissStarPrompt} />
        )}

      {updateAvailable && (
        <div className="version-update-bar" role="status">
          <span>页面已发布新版，刷新后切换最新版本</span>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => window.location.reload()}>
            立即刷新
          </button>
        </div>
      )}

      {toast && (
        <div key={toast.text} className={`toast toast-${toast.kind}`} role="status">
          <span className="toast-ico" aria-hidden="true">
            {toast.kind === "err" ? <IconAlertCircle size={15} /> : <IconCheckCircle size={15} />}
          </span>
          <span>{toast.text}</span>
        </div>
      )}

      <TooltipHost />
    </div>
  );
}
