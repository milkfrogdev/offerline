import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { EventKind, MailAccountPublic, ScheduleEvent } from "../../shared/types";
import { CompanyLogo } from "./CompanyLogo";
import {
  IconCalendar,
  IconCheck,
  IconChevron,
  IconChevronLeft,
  IconChevronRight,
  IconClose,
  IconCode,
  IconDownload,
  IconExternal,
  IconInbox,
  IconMail,
  IconMapPin,
  IconNote,
  IconPlus,
  IconRefresh,
  IconSpark,
  IconTrash,
  IconVideo,
} from "./Icons";

const KIND_LABELS: Record<EventKind, string> = {
  interview: "面试",
  written_test: "笔试",
  assessment: "测评",
  offer: "Offer",
  other: "跟进",
};

type KindFilter = "all" | "interview" | "test" | "offer";

const KIND_FILTERS: { key: KindFilter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "interview", label: "面试" },
  { key: "test", label: "笔试与测评" },
  { key: "offer", label: "Offer" },
];

const WEEKDAYS_MON = ["一", "二", "三", "四", "五", "六", "日"];
const WEEKDAY_NAMES = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isoToLocalKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return localDateKey(d);
}

function formatClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatTimeRange(startIso: string, endIso?: string): string {
  const s = formatClock(startIso);
  if (!s) return startIso;
  if (!endIso) return s;
  const e = formatClock(endIso);
  return e ? `${s}–${e}` : s;
}

function formatDuration(startIso: string, endIso?: string): string {
  if (!endIso) return "";
  const mins = Math.round((Date.parse(endIso) - Date.parse(startIso)) / 60_000);
  if (!Number.isFinite(mins) || mins <= 0 || mins > 720) return "";
  if (mins < 60) return `${mins} 分钟`;
  const h = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem === 0 ? `${h} 小时` : `${h} 小时 ${rem} 分`;
}

function formatDayMeta(iso: string): {
  dayNum: string;
  label: string;
  isToday: boolean;
  isTomorrow: boolean;
} {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return { dayNum: "--", label: "未定日期", isToday: false, isTomorrow: false };
  }
  const now = new Date();
  const todayKey = localDateKey(now);
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const tomorrowKey = localDateKey(tomorrow);
  const key = localDateKey(d);
  const isToday = key === todayKey;
  const isTomorrow = key === tomorrowKey;
  const wd = WEEKDAY_NAMES[d.getDay()];
  const month = d.getMonth() + 1;
  const dayNum = String(d.getDate()).padStart(2, "0");
  const label = isToday
    ? `今天（${month}月${d.getDate()}日 ${wd}）`
    : isTomorrow
      ? `明天（${month}月${d.getDate()}日 ${wd}）`
      : `${month}月${d.getDate()}日 ${wd}`;
  return { dayNum, label, isToday, isTomorrow };
}

function formatQuickDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const todayKey = localDateKey(now);
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const key = localDateKey(d);
  const time = formatClock(iso);
  if (key === todayKey) return `今天 ${time}`;
  if (key === localDateKey(tomorrow)) return `明天 ${time}`;
  return `${d.getMonth() + 1}月${d.getDate()}日 ${time}`;
}

function formatSyncAgo(iso?: string): string {
  if (!iso) return "尚未同步";
  const diffMin = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 60_000));
  if (diffMin < 1) return "刚刚已同步";
  if (diffMin < 60) return `${diffMin} 分钟前已同步`;
  const h = Math.floor(diffMin / 60);
  if (h < 24) return `${h} 小时前已同步`;
  return `${Math.floor(h / 24)} 天前已同步`;
}

function meetingMetaForUrl(url: string, kind: EventKind): { label: string; isExam: boolean } {
  const lower = url.toLowerCase();
  if (lower.includes("feishu.cn") || lower.includes("larksuite.com")) return { label: "进入飞书会议", isExam: false };
  if (lower.includes("meeting.tencent.com")) return { label: "进入腾讯会议", isExam: false };
  if (lower.includes("zoom.us") || lower.includes("zoom.com")) return { label: "进入 Zoom", isExam: false };
  if (lower.includes("dingtalk.com")) return { label: "进入钉钉会议", isExam: false };
  if (lower.includes("teams.microsoft.com")) return { label: "进入 Teams", isExam: false };
  if (
    kind === "written_test" ||
    kind === "assessment" ||
    lower.includes("exam") ||
    lower.includes("nowcoder") ||
    lower.includes("code.")
  ) {
    return { label: "打开在线笔试", isExam: true };
  }
  return { label: "进入线上会议", isExam: false };
}

function matchesKindFilter(ev: ScheduleEvent, filter: KindFilter): boolean {
  if (filter === "all") return true;
  if (filter === "interview") return ev.kind === "interview";
  if (filter === "test") return ev.kind === "written_test" || ev.kind === "assessment";
  if (filter === "offer") return ev.kind === "offer";
  return true;
}

function buildMonthGrid(year: number, month: number): { date: Date; key: string; inMonth: boolean }[] {
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = (firstOfMonth.getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = startOffset + daysInMonth <= 35 ? 35 : 42;
  const cells: { date: Date; key: string; inMonth: boolean }[] = [];
  for (let i = 0; i < totalCells; i++) {
    const d = new Date(year, month, 1 - startOffset + i);
    cells.push({
      date: d,
      key: localDateKey(d),
      inMonth: d.getMonth() === month,
    });
  }
  return cells;
}

export function ScheduleView({
  events,
  mailConfig,
  syncing,
  onSyncMail,
  onOpenMailSettings,
  onOpenParseModal,
  onOpenSubscribeModal,
  onAddEvent,
  onConfirmEvent,
  onSyncEventToRecord,
  onToggleComplete,
  onDismissEvent,
  onDeleteEvent,
  onWriteNoteFromEvent,
}: {
  events: ScheduleEvent[];
  mailConfig: MailAccountPublic | null;
  syncing: boolean;
  onSyncMail: () => Promise<void>;
  onOpenMailSettings: () => void;
  onOpenParseModal: () => void;
  onOpenSubscribeModal: () => void;
  onAddEvent: () => void;
  onConfirmEvent: (event: ScheduleEvent) => Promise<void>;
  onSyncEventToRecord: (event: ScheduleEvent) => Promise<void>;
  onToggleComplete: (event: ScheduleEvent) => Promise<void>;
  onDismissEvent: (event: ScheduleEvent) => Promise<void>;
  onDeleteEvent: (event: ScheduleEvent) => Promise<void>;
  onWriteNoteFromEvent: (event: ScheduleEvent) => void;
}) {
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [completedOpen, setCompletedOpen] = useState(false);
  const segRef = useRef<HTMLDivElement>(null);
  const [segThumb, setSegThumb] = useState<{ left: number; width: number; ready: boolean }>({
    left: 0,
    width: 0,
    ready: false,
  });

  useLayoutEffect(() => {
    const wrap = segRef.current;
    if (!wrap) return;
    const measure = () => {
      const activeBtn = wrap.querySelector<HTMLButtonElement>(".seg-btn.active");
      if (!activeBtn) return;
      setSegThumb({
        left: activeBtn.offsetLeft,
        width: activeBtn.offsetWidth,
        ready: true,
      });
    };
    measure();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(measure);
      ro.observe(wrap);
      return () => ro.disconnect();
    }
    return undefined;
  }, [kindFilter]);

  const now = useMemo(() => new Date(), []);
  const todayKey = useMemo(() => localDateKey(now), [now]);
  const [calMonth, setCalMonth] = useState<{ year: number; month: number }>(() => ({
    year: now.getFullYear(),
    month: now.getMonth(),
  }));

  const pendingEvents = useMemo(
    () =>
      events
        .filter((e) => e.status === "pending_confirm" && matchesKindFilter(e, kindFilter))
        .sort((a, b) => a.startAt.localeCompare(b.startAt)),
    [events, kindFilter],
  );

  const confirmedEvents = useMemo(
    () =>
      events
        .filter((e) => e.status === "confirmed")
        .sort((a, b) => a.startAt.localeCompare(b.startAt)),
    [events],
  );

  const upcomingGroups = useMemo(() => {
    const active = confirmedEvents.filter((e) => {
      if (!matchesKindFilter(e, kindFilter)) return false;
      if (selectedDayKey && isoToLocalKey(e.startAt) !== selectedDayKey) return false;
      return true;
    });
    const map = new Map<
      string,
      {
        key: string;
        dayNum: string;
        label: string;
        isToday: boolean;
        items: ScheduleEvent[];
      }
    >();
    for (const ev of active) {
      const key = isoToLocalKey(ev.startAt);
      let entry = map.get(key);
      if (!entry) {
        const meta = formatDayMeta(ev.startAt);
        entry = { key, dayNum: meta.dayNum, label: meta.label, isToday: meta.isToday, items: [] };
        map.set(key, entry);
      }
      entry.items.push(ev);
    }
    return [...map.values()];
  }, [confirmedEvents, kindFilter, selectedDayKey]);

  const completedEvents = useMemo(
    () =>
      events
        .filter((e) => e.status === "completed")
        .sort((a, b) => b.startAt.localeCompare(a.startAt)),
    [events],
  );

  const nextUpcomingEvent = useMemo(() => {
    const cutoff = Date.now() - 30 * 60_000;
    return confirmedEvents.find((e) => Date.parse(e.startAt) >= cutoff) || confirmedEvents[0] || null;
  }, [confirmedEvents]);

  const dayMarkers = useMemo(() => {
    const map = new Map<string, { confirmed: number; pending: number; items: ScheduleEvent[] }>();
    const sorted = [...events]
      .filter((ev) => ev.status === "confirmed" || ev.status === "pending_confirm")
      .sort((a, b) => a.startAt.localeCompare(b.startAt));
    for (const ev of sorted) {
      const key = isoToLocalKey(ev.startAt);
      const curr = map.get(key) || { confirmed: 0, pending: 0, items: [] };
      if (ev.status === "confirmed") curr.confirmed += 1;
      if (ev.status === "pending_confirm") curr.pending += 1;
      curr.items.push(ev);
      map.set(key, curr);
    }
    return map;
  }, [events]);

  const monthCells = useMemo(
    () => buildMonthGrid(calMonth.year, calMonth.month),
    [calMonth.year, calMonth.month],
  );

  const totalUpcomingVisible = upcomingGroups.reduce((acc, g) => acc + g.items.length, 0);

  function shiftMonth(delta: -1 | 1) {
    setCalMonth((prev) => {
      const nextDate = new Date(prev.year, prev.month + delta, 1);
      return { year: nextDate.getFullYear(), month: nextDate.getMonth() };
    });
  }

  function jumpToToday() {
    setCalMonth({ year: now.getFullYear(), month: now.getMonth() });
    setSelectedDayKey(null);
  }

  return (
    <div className="page-container">
      {/* 顶部紧凑操作条（左侧分类滑块 + 右侧三项精选动作，彻底消除五按钮拥挤感） */}
      <div className="schedule-toolbar">
        <div className="seg-control" ref={segRef} role="tablist" aria-label="按类型筛选日程">
          <span
            className={`seg-thumb${segThumb.ready ? " is-ready" : ""}`}
            style={{
              transform: `translate3d(${segThumb.left}px, 0, 0)`,
              width: `${segThumb.width}px`,
            }}
            aria-hidden="true"
          />
          {KIND_FILTERS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={kindFilter === tab.key}
              className={`seg-btn${kindFilter === tab.key ? " active" : ""}`}
              onClick={() => setKindFilter(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="toolbar-actions">
          <button type="button" className="btn btn-ghost" onClick={onOpenParseModal}>
            <IconSpark size={14} />
            <span>粘贴邮件解析</span>
          </button>
          <button type="button" className="btn btn-ghost" onClick={onOpenSubscribeModal}>
            <IconCalendar size={14} />
            <span>日历订阅</span>
          </button>
          <button type="button" className="btn btn-primary" onClick={onAddEvent}>
            <IconPlus size={14} />
            <span>新建日程</span>
          </button>
        </div>
      </div>

      {/* Cron / Notion Calendar 级双栏工作台 */}
      <div className="schedule-layout">
        {/* 左主栏：待确认收件箱 + 按日时间轨议程 + 可折叠已完成 */}
        <div className="schedule-main">
          {pendingEvents.length > 0 && (
            <section className="schedule-section">
              <div className="section-head">
                <span className="section-head-icon tone-accent" aria-hidden="true">
                  <IconInbox size={15} />
                </span>
                <h2 className="section-title">邮箱待确认通知</h2>
                <span className="section-count-pill">{pendingEvents.length}</span>
              </div>

              <div className="agenda-surface is-inbox">
                {pendingEvents.map((ev) => {
                  const isLink = !!(ev.location && /^https?:\/\//i.test(ev.location));
                  return (
                    <article key={ev.id} className="inbox-row">
                      <div className="inbox-row-main">
                        <CompanyLogo company={ev.company} size="md" />
                        <div className="inbox-row-body">
                          <div className="event-title-row">
                            <span className="event-title">{ev.title}</span>
                            <span className="event-kind">{KIND_LABELS[ev.kind]}</span>
                          </div>
                          <div className="event-meta-row">
                            <span className="event-time">
                              {formatQuickDateTime(ev.startAt)}
                              {ev.endAt ? `–${formatClock(ev.endAt)}` : ""}
                            </span>
                            {ev.location &&
                              (isLink ? (
                                (() => {
                                  const m = meetingMetaForUrl(ev.location, ev.kind);
                                  return (
                                    <a
                                      href={ev.location}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="meeting-link"
                                    >
                                      {m.isExam ? <IconCode size={13} /> : <IconVideo size={13} />}
                                      <span>{m.label}</span>
                                      <IconExternal size={11} />
                                    </a>
                                  );
                                })()
                              ) : (
                                <span className="event-loc">
                                  <IconMapPin size={12} />
                                  <span>{ev.location}</span>
                                </span>
                              ))}
                          </div>
                          {ev.mailSubject && (
                            <div className="event-mail-quote">
                              <IconMail size={12} />
                              <span>{ev.mailSubject}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="inbox-row-actions">
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => void onSyncEventToRecord(ev)}
                        >
                          <IconCheck size={13} />
                          <span>确认并同步进度</span>
                        </button>
                        <button
                          type="button"
                          className="btn btn-soft btn-sm"
                          onClick={() => void onConfirmEvent(ev)}
                        >
                          仅加入日程
                        </button>
                        <button
                          type="button"
                          className="btn-text-muted"
                          onClick={() => void onDismissEvent(ev)}
                        >
                          忽略
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          {/* 按日时间轨议程 */}
          <section className="schedule-section">
            <div className="section-head-spread">
              <div className="section-head">
                <h2 className="section-title">即将到来</h2>
                <span className="section-meta">{totalUpcomingVisible} 场</span>
              </div>

              {selectedDayKey && (
                <button
                  type="button"
                  className="date-filter-chip"
                  onClick={() => setSelectedDayKey(null)}
                >
                  <span>已按 {selectedDayKey.slice(5).replace("-", "月")}日 筛选</span>
                  <IconClose size={12} />
                </button>
              )}
            </div>

            {upcomingGroups.length === 0 ? (
              <div className="empty-panel compact">
                <p className="empty-title">
                  {selectedDayKey ? "当天没有已确认的面试或笔试" : "暂无待办面试或笔试日程"}
                </p>
                <p className="empty-desc">
                  {selectedDayKey
                    ? "点击右侧日历中带标记的日期查看其他安排，或清除日期筛选查看全部。"
                    : "开启邮箱监听后，收到的笔试与面试通知会自动归集到这里，也可以粘贴一封邀约邮件立即解析。"}
                </p>
                {selectedDayKey && (
                  <button
                    type="button"
                    className="btn btn-soft btn-sm"
                    onClick={() => setSelectedDayKey(null)}
                  >
                    显示全部日程
                  </button>
                )}
              </div>
            ) : (
              <div className="day-groups">
                {upcomingGroups.map((group) => (
                  <div key={group.key} className="day-group">
                    <div className="day-head">
                      <div className="day-head-left">
                        <span className={`day-num-badge${group.isToday ? " is-today" : ""}`}>
                          {group.dayNum}
                        </span>
                        <span className={`day-heading${group.isToday ? " is-today" : ""}`}>
                          {group.label}
                        </span>
                      </div>
                      <span className="day-count">{group.items.length} 场</span>
                    </div>

                    <div className="agenda-surface">
                      {group.items.map((ev) => {
                        const isLink = !!(ev.location && /^https?:\/\//i.test(ev.location));
                        const dur = formatDuration(ev.startAt, ev.endAt);
                        return (
                          <article key={ev.id} className="agenda-row">
                            <div className="agenda-time-col">
                              <span className="agenda-start">{formatClock(ev.startAt)}</span>
                              {ev.endAt && (
                                <span className="agenda-end">至 {formatClock(ev.endAt)}</span>
                              )}
                              {dur && <span className="agenda-dur">{dur}</span>}
                            </div>

                            <span className="agenda-vline" aria-hidden="true" />

                            <div className="agenda-content">
                              <CompanyLogo company={ev.company} size="md" />
                              <div className="event-body">
                                <div className="event-title-row">
                                  <span className="event-title">{ev.title}</span>
                                  <span className="event-kind">{KIND_LABELS[ev.kind]}</span>
                                </div>
                                <div className="event-meta-row">
                                  {ev.position && <span>{ev.position}</span>}
                                  {ev.location &&
                                    (isLink ? (
                                      (() => {
                                        const m = meetingMetaForUrl(ev.location, ev.kind);
                                        return (
                                          <a
                                            href={ev.location}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="meeting-link"
                                          >
                                            {m.isExam ? <IconCode size={13} /> : <IconVideo size={13} />}
                                            <span>{m.label}</span>
                                            <IconExternal size={11} />
                                          </a>
                                        );
                                      })()
                                    ) : (
                                      <span className="event-loc">
                                        <IconMapPin size={12} />
                                        <span>{ev.location}</span>
                                      </span>
                                    ))}
                                </div>
                                {ev.notes && <div className="event-notes-text">{ev.notes}</div>}
                              </div>
                            </div>

                            <div className="agenda-actions">
                              {!ev.syncedToRecord && (
                                <button
                                  type="button"
                                  className="btn-inline-sync"
                                  onClick={() => void onSyncEventToRecord(ev)}
                                  data-tip="自动推进对应岗位的投递时间线"
                                >
                                  同步进度
                                </button>
                              )}
                              <a
                                href={`/api/events/${encodeURIComponent(ev.id)}/ics`}
                                className="row-icon-btn agenda-icon-btn"
                                data-tip="导出 .ics 到系统日历"
                                aria-label="导出日历文件"
                              >
                                <IconDownload size={17} />
                              </a>
                              <button
                                type="button"
                                className="row-icon-btn agenda-icon-btn"
                                onClick={() => onWriteNoteFromEvent(ev)}
                                data-tip="面后记录面经"
                                aria-label="写面经"
                              >
                                <IconNote size={17} />
                              </button>
                              <button
                                type="button"
                                className="row-icon-btn agenda-icon-btn ok"
                                onClick={() => void onToggleComplete(ev)}
                                data-tip="标记为已完成"
                                aria-label="标记已完成"
                              >
                                <IconCheck size={17} />
                              </button>
                              <button
                                type="button"
                                className="row-icon-btn agenda-icon-btn danger"
                                onClick={() => void onDeleteEvent(ev)}
                                data-tip="删除日程"
                                aria-label="删除日程"
                              >
                                <IconTrash size={17} />
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 可折叠已完成区 */}
          {completedEvents.length > 0 && (
            <section className="schedule-section">
              <button
                type="button"
                className={`disclosure-head${completedOpen ? " is-open" : ""}`}
                onClick={() => setCompletedOpen((v) => !v)}
                aria-expanded={completedOpen}
              >
                <span className="disclosure-chevron">
                  <IconChevron size={14} />
                </span>
                <span className="section-title">已完成</span>
                <span className="section-meta">{completedEvents.length} 场</span>
              </button>

              {completedOpen && (
                <div className="agenda-surface is-completed">
                  {completedEvents.map((ev) => (
                    <article key={ev.id} className="completed-row">
                      <div className="completed-row-main">
                        <span className="completed-date">{isoToLocalKey(ev.startAt).slice(5)}</span>
                        <CompanyLogo company={ev.company} size="sm" />
                        <span className="completed-title">{ev.title}</span>
                        <span className="event-kind">{KIND_LABELS[ev.kind]}</span>
                      </div>
                      <div className="completed-row-actions">
                        <button
                          type="button"
                          className="subtle-btn"
                          onClick={() => onWriteNoteFromEvent(ev)}
                        >
                          <IconNote size={13} />
                          <span>补面经</span>
                        </button>
                        <button
                          type="button"
                          className="row-icon-btn danger"
                          onClick={() => void onDeleteEvent(ev)}
                          data-tip="删除日程"
                          aria-label="删除日程"
                        >
                          <IconTrash size={16} />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>

        {/* 右侧粘性陪伴栏：迷你月历 + 下一场焦点 + 邮箱监听状态 */}
        <aside className="schedule-rail" aria-label="日历与邮箱概览">
          <div className="rail-card">
            {/* 交互式迷你月历 */}
            <div className="rail-section">
              <div className="cal-head">
                <span className="cal-month-title">
                  {calMonth.year}年 {calMonth.month + 1}月
                </span>
                <div className="cal-nav">
                  <button type="button" className="cal-today-btn" onClick={jumpToToday}>
                    今天
                  </button>
                  <button
                    type="button"
                    className="cal-arrow-btn"
                    onClick={() => shiftMonth(-1)}
                    aria-label="上个月"
                  >
                    <IconChevronLeft size={14} />
                  </button>
                  <button
                    type="button"
                    className="cal-arrow-btn"
                    onClick={() => shiftMonth(1)}
                    aria-label="下个月"
                  >
                    <IconChevronRight size={14} />
                  </button>
                </div>
              </div>

              <div className="cal-weekdays" aria-hidden="true">
                {WEEKDAYS_MON.map((w) => (
                  <span key={w}>{w}</span>
                ))}
              </div>

              <div className="cal-grid">
                {monthCells.map((cell) => {
                  const mark = dayMarkers.get(cell.key);
                  const isToday = cell.key === todayKey;
                  const isSelected = cell.key === selectedDayKey;
                  const hasEvent = !!(mark && mark.items.length > 0);
                  const dayHead = `${cell.date.getMonth() + 1}月${cell.date.getDate()}日 ${isToday ? "今天" : WEEKDAY_NAMES[cell.date.getDay()]}`;
                  let dayTip = `${dayHead}\n暂无面试或笔试安排`;
                  if (mark && mark.items.length > 0) {
                    const previewLines = mark.items.slice(0, 3).map((ev) => {
                      const stage = ev.stageName || KIND_LABELS[ev.kind];
                      const tag = ev.status === "pending_confirm" ? " [待确认]" : "";
                      return `${formatClock(ev.startAt)} ${ev.company} ${stage}${tag}`;
                    });
                    if (mark.items.length > 3) {
                      previewLines.push(`另有 ${mark.items.length - 3} 场安排`);
                    }
                    dayTip = `${dayHead}（${mark.items.length} 场，点击筛选）\n${previewLines.join("\n")}`;
                  }
                  return (
                    <button
                      key={cell.key}
                      type="button"
                      className={`cal-day${!cell.inMonth ? " is-out" : ""}${isToday ? " is-today" : ""}${isSelected ? " is-selected" : ""}${hasEvent ? " has-event" : ""}`}
                      onClick={() =>
                        setSelectedDayKey((prev) => (prev === cell.key ? null : cell.key))
                      }
                      data-tip={dayTip}
                      aria-label={`${dayHead}${mark ? `，${mark.items.length} 场安排` : ""}`}
                      aria-pressed={isSelected}
                    >
                      <span className="cal-day-num">{cell.date.getDate()}</span>
                      {hasEvent && (
                        <span className="cal-ticks" aria-hidden="true">
                          {mark && mark.confirmed > 0 && <span className="cal-tick is-confirmed" />}
                          {mark && mark.pending > 0 && <span className="cal-tick is-pending" />}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 下一场焦点 */}
            {nextUpcomingEvent && (
              <div className="rail-section rail-next">
                <div className="rail-label-row">
                  <span className="rail-label">下一场</span>
                  <span className="rail-next-time">
                    {formatQuickDateTime(nextUpcomingEvent.startAt)}
                  </span>
                </div>
                <div className="rail-next-head">
                  <CompanyLogo company={nextUpcomingEvent.company} size="md" />
                  <div className="rail-next-info">
                    <div className="rail-next-title">{nextUpcomingEvent.title}</div>
                    <div className="rail-next-sub">
                      <span>{formatTimeRange(nextUpcomingEvent.startAt, nextUpcomingEvent.endAt)}</span>
                      {nextUpcomingEvent.position && <span>{nextUpcomingEvent.position}</span>}
                    </div>
                  </div>
                </div>
                <div className="rail-next-actions">
                  {nextUpcomingEvent.location && /^https?:\/\//i.test(nextUpcomingEvent.location) ? (
                    (() => {
                      const m = meetingMetaForUrl(nextUpcomingEvent.location, nextUpcomingEvent.kind);
                      return (
                        <a
                          href={nextUpcomingEvent.location}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-primary btn-sm rail-cta-grow"
                        >
                          {m.isExam ? <IconCode size={13} /> : <IconVideo size={13} />}
                          <span>{m.label}</span>
                        </a>
                      );
                    })()
                  ) : (
                    <button
                      type="button"
                      className="btn btn-soft btn-sm rail-cta-grow"
                      onClick={() => onWriteNoteFromEvent(nextUpcomingEvent)}
                    >
                      <IconNote size={13} />
                      <span>记录本轮面经</span>
                    </button>
                  )}
                  <a
                    href={`/api/events/${encodeURIComponent(nextUpcomingEvent.id)}/ics`}
                    className="btn btn-soft btn-sm"
                    data-tip="导出 .ics 到系统日历"
                    aria-label="导出日历文件"
                  >
                    <IconDownload size={15} />
                  </a>
                </div>
              </div>
            )}
          </div>

          {/* 紧凑邮箱监听状态卡 */}
          <div className="rail-card rail-mail">
            <div className="rail-mail-head">
              <span className={`mail-status-icon${mailConfig?.enabled ? " is-live" : ""}`}>
                <IconMail size={15} />
              </span>
              <div className="rail-mail-meta">
                <div className="rail-mail-title">
                  {mailConfig?.configured
                    ? mailConfig.enabled
                      ? "邮箱自动监听中"
                      : "邮箱监听已暂停"
                    : "连接求职邮箱"}
                </div>
                <div className="rail-mail-addr">
                  {mailConfig?.configured ? mailConfig.email : "支持 QQ / 163 / Gmail IMAP"}
                </div>
              </div>
            </div>

            <div className="rail-mail-sub">
              {mailConfig?.configured ? (
                mailConfig.lastError ? (
                  `上次同步异常：${mailConfig.lastError}`
                ) : (
                  <>
                    <span>每 {mailConfig.pollIntervalMin} 分钟检查</span>
                    <span>{formatSyncAgo(mailConfig.lastSyncedAt)}</span>
                  </>
                )
              ) : (
                "自动识别面试与笔试邮件并归集到待确认收件箱。"
              )}
            </div>

            <div className="rail-mail-actions">
              {mailConfig?.configured && (
                <button
                  type="button"
                  className="btn btn-soft btn-sm rail-cta-grow"
                  disabled={syncing}
                  onClick={() => void onSyncMail()}
                >
                  <span className={syncing ? "ico-spin" : undefined}>
                    <IconRefresh size={13} />
                  </span>
                  <span>{syncing ? "同步中…" : "立即同步"}</span>
                </button>
              )}
              <button
                type="button"
                className="btn btn-soft btn-sm rail-cta-grow"
                onClick={onOpenMailSettings}
              >
                <span>{mailConfig?.configured ? "邮箱设置" : "立即接入"}</span>
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
