import React, { useEffect, useMemo, useState } from "react";
import {
  computePipelineMetrics,
  currentStageLabel,
  isRecordOffered,
  isRecordTerminated,
  STAGE_STATUS_LABELS,
  stageProgress,
  visitFreshness,
} from "../../shared/stages";
import type {
  ApplicationRecord,
  EventKind,
  InterviewNote,
  MailAccountPublic,
  MetricFilter,
  NoteFeeling,
  ScheduleEvent,
  UserProfile,
} from "../../shared/types";
import { CompanyLogo } from "./CompanyLogo";
import {
  IconArrowRight,
  IconCalendar,
  IconCheck,
  IconClock,
  IconCode,
  IconExternal,
  IconInbox,
  IconMail,
  IconMapPin,
  IconNote,
  IconPlus,
  IconSpark,
  IconStar,
  IconVideo,
} from "./Icons";
import { stripMarkdownForPreview } from "./NoteEditor";

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"] as const;
const WEEKDAYS_SHORT = ["日", "一", "二", "三", "四", "五", "六"] as const;

const KIND_LABELS: Record<EventKind, string> = {
  interview: "面试",
  written_test: "笔试",
  assessment: "测评",
  offer: "Offer 沟通",
  other: "跟进",
};

const FEELING_LABELS: Record<NoteFeeling, string> = {
  great: "发挥顺畅",
  normal: "正常发挥",
  hard: "难度偏高",
};

function toLocalDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatFriendlyDay(iso: string, nowMs: number): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date(nowMs);
  const key = toLocalDayKey(d);
  if (key === toLocalDayKey(now)) return `今天 ${formatClock(iso)}`;
  const tmr = new Date(now);
  tmr.setDate(tmr.getDate() + 1);
  if (key === toLocalDayKey(tmr)) return `明天 ${formatClock(iso)}`;
  return `${d.getMonth() + 1}月${d.getDate()}日 ${formatClock(iso)}`;
}

function formatCountdown(startIso: string, nowMs: number): { text: string; urgent: boolean } {
  const diffMin = Math.round((Date.parse(startIso) - nowMs) / 60_000);
  if (diffMin <= 0 && diffMin > -45) return { text: "正在进行", urgent: true };
  if (diffMin <= 60) return { text: `${Math.max(1, diffMin)} 分钟后开始`, urgent: true };
  if (diffMin < 24 * 60) {
    const h = Math.floor(diffMin / 60);
    const m = diffMin % 60;
    return { text: m > 0 ? `${h} 小时 ${m} 分后` : `${h} 小时后`, urgent: h <= 3 };
  }
  const days = Math.floor(diffMin / (24 * 60));
  return { text: days === 1 ? "明天开始" : `${days} 天后`, urgent: false };
}

function meetingActionMeta(url: string, kind: EventKind): { label: string; isExam: boolean } {
  const u = url.toLowerCase();
  if (kind === "offer") return { label: "查看录用意向", isExam: false };
  if (kind === "assessment" || /eztest|talovative/.test(u)) {
    return { label: "打开在线测评", isExam: true };
  }
  if (kind === "written_test" || /nowcoder|acmcoder|leetcode|exam|code\./.test(u)) {
    return { label: "进入在线笔试", isExam: true };
  }
  if (u.includes("meeting.tencent.com") || u.includes("wemeet")) {
    return { label: "进入腾讯会议", isExam: false };
  }
  if (u.includes("feishu.cn") || u.includes("larksuite.com") || u.includes("zijieimg.com")) {
    return { label: "进入飞书会议", isExam: false };
  }
  if (u.includes("zoom.")) return { label: "进入 Zoom", isExam: false };
  if (u.includes("teams.microsoft")) return { label: "进入 Teams", isExam: false };
  return { label: "打开会议链接", isExam: false };
}

function formatDurationShort(startIso: string, endIso?: string): string {
  if (!endIso) return "待定";
  const mins = Math.round((Date.parse(endIso) - Date.parse(startIso)) / 60_000);
  if (!Number.isFinite(mins) || mins <= 0 || mins > 720) return "待定";
  if (mins < 60) return `${mins} 分钟`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} 小时` : `${h} 小时 ${m} 分`;
}

function timeGreeting(now: Date): string {
  const h = now.getHours();
  if (h < 6) return "夜深了";
  if (h < 11) return "早上好";
  if (h < 14) return "中午好";
  if (h < 18) return "下午好";
  return "晚上好";
}

function formatEventShortTime(ev: ScheduleEvent, nowMs: number): string {
  if (ev.timeMode === "flexible") return "时间自定";
  if (ev.timeMode === "deadline") {
    const d = new Date(ev.startAt);
    if (Number.isNaN(d.getTime())) return "待定截止";
    return `截止 ${d.getMonth() + 1}月${d.getDate()}日`;
  }
  return formatFriendlyDay(ev.startAt, nowMs);
}

export function HomeView({
  user,
  records,
  events,
  notes,
  mailConfig,
  onNavigatePipeline,
  onNavigateSchedule,
  onOpenNoteById,
  onAddRecord,
  onAddEvent,
  onAddNote,
  onConfirmEvent,
  onDismissEvent,
  onOpenRecordInPipeline,
  onVisitCompany,
  onOpenMailModal,
  onOpenParseModal,
}: {
  user: UserProfile;
  records: ApplicationRecord[];
  events: ScheduleEvent[];
  notes: InterviewNote[];
  mailConfig: MailAccountPublic | null;
  onNavigatePipeline: (filter?: MetricFilter) => void;
  onNavigateSchedule: () => void;
  onOpenNoteById: (noteId: string) => void;
  onAddRecord: () => void;
  onAddEvent: () => void;
  onAddNote: (preset?: {
    recordId?: string;
    company?: string;
    position?: string;
    stageName?: string;
  }) => void;
  onConfirmEvent: (ev: ScheduleEvent) => Promise<void>;
  onDismissEvent: (ev: ScheduleEvent) => Promise<void>;
  onOpenRecordInPipeline: (company: string) => void;
  onVisitCompany: (company: string, url?: string) => Promise<void>;
  onOpenMailModal: () => void;
  onOpenParseModal: () => void;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const nowDate = useMemo(() => new Date(nowMs), [nowMs]);
  const todayKey = useMemo(() => toLocalDayKey(nowDate), [nowDate]);

  const metrics = useMemo(() => computePipelineMetrics(records), [records]);

  const funnelStages = useMemo(() => {
    const total = records.length;
    const screened = records.filter((r) => {
      const doneCount = r.stages.filter((s) => s.status === "pass" || s.status === "skip").length;
      return doneCount >= 2 || r.stages.some((s) => s.type === "interview" && s.status !== "pending");
    }).length;
    const lateStage = records.filter((r) => {
      if (isRecordOffered(r.stages)) return true;
      return r.stages.some(
        (s) =>
          (s.name.includes("HR") ||
            s.name.includes("hr") ||
            s.name.includes("Offer") ||
            s.name.includes("谈薪") ||
            s.type === "offer") &&
          (s.status === "current" || s.status === "pass"),
      );
    }).length;

    const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
    return [
      { key: "all" as MetricFilter, label: "已投递", count: total, pct: total > 0 ? 100 : 0, tone: "ink" },
      { key: "active" as MetricFilter, label: "通过初筛", count: screened, pct: pct(screened), tone: "slate" },
      { key: "interview" as MetricFilter, label: "进入面试", count: metrics.interviewed, pct: metrics.interviewRate, tone: "accent" },
      { key: "offer" as MetricFilter, label: "终面与 Offer", count: lateStage, pct: pct(lateStage), tone: "ok" },
    ];
  }, [records, metrics]);

  const pendingEvents = useMemo(
    () =>
      events
        .filter((e) => e.status === "pending_confirm")
        .sort((a, b) => a.startAt.localeCompare(b.startAt)),
    [events],
  );

  const recordMap = useMemo(() => {
    const map = new Map<string, ApplicationRecord>();
    for (const r of records) map.set(r.id, r);
    return map;
  }, [records]);

  const upcomingConfirmed = useMemo(() => {
    const cutoff = nowMs - 45 * 60_000;
    return events
      .filter(
        (e) =>
          e.status === "confirmed" &&
          e.timeMode !== "flexible" &&
          Date.parse(e.startAt) >= cutoff,
      )
      .sort((a, b) => a.startAt.localeCompare(b.startAt));
  }, [events, nowMs]);

  const nextUpcoming = upcomingConfirmed[0] || null;

  // Build 7-day interactive rhythm strip
  const rhythmDays = useMemo(() => {
    const itemsMap = new Map<string, ScheduleEvent[]>();
    const sorted = [...events]
      .filter(
        (ev) =>
          (ev.status === "confirmed" || ev.status === "pending_confirm") &&
          ev.timeMode !== "flexible",
      )
      .sort((a, b) => a.startAt.localeCompare(b.startAt));
    for (const ev of sorted) {
      const d = new Date(ev.startAt);
      if (Number.isNaN(d.getTime())) continue;
      const k = toLocalDayKey(d);
      const list = itemsMap.get(k) || [];
      list.push(ev);
      itemsMap.set(k, list);
    }

    return Array.from({ length: 7 }, (_, offset) => {
      const d = new Date(nowDate);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() + offset);
      const key = toLocalDayKey(d);
      const dayItems = itemsMap.get(key) || [];
      const confirmedCount = dayItems.filter((x) => x.status === "confirmed").length;
      const pendingCount = dayItems.filter((x) => x.status === "pending_confirm").length;
      const head = `${d.getMonth() + 1}月${d.getDate()}日 ${offset === 0 ? "今天" : WEEKDAYS[d.getDay()]}`;
      let tip = `${head}\n暂无面试或笔试安排`;
      if (dayItems.length > 0) {
        const lines = dayItems.slice(0, 3).map((ev) => {
          const st = ev.stageName || KIND_LABELS[ev.kind];
          const tag = ev.status === "pending_confirm" ? " [待确认]" : "";
          const prefix = ev.timeMode === "deadline" ? "截止" : formatClock(ev.startAt);
          return `${prefix} ${ev.company} ${st}${tag}`;
        });
        if (dayItems.length > 3) lines.push(`另有 ${dayItems.length - 3} 场安排`);
        tip = `${head}（${dayItems.length} 场，点击筛选）\n${lines.join("\n")}`;
      }
      return {
        key,
        weekday: WEEKDAYS_SHORT[d.getDay()],
        dayNum: d.getDate(),
        isToday: offset === 0,
        confirmedCount,
        pendingCount,
        tip,
      };
    });
  }, [events, nowDate]);

  const rhythmAgenda = useMemo(() => {
    if (!selectedDayKey) return upcomingConfirmed.slice(0, 4);
    return upcomingConfirmed.filter((ev) => {
      const d = new Date(ev.startAt);
      return !Number.isNaN(d.getTime()) && toLocalDayKey(d) === selectedDayKey;
    });
  }, [upcomingConfirmed, selectedDayKey]);

  // Focus & Sprint Records (pinned active first, then highest progress active)
  const focusRecords = useMemo(() => {
    const activeOnes = records.filter((r) => !isRecordTerminated(r.stages));
    return [...activeOnes]
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        const aOffer = isRecordOffered(a.stages) ? 1 : 0;
        const bOffer = isRecordOffered(b.stages) ? 1 : 0;
        if (aOffer !== bOffer) return bOffer - aOffer;
        return stageProgress(b.stages) - stageProgress(a.stages);
      })
      .slice(0, 5);
  }, [records]);

  const recentNotes = useMemo(
    () =>
      [...notes]
        .sort((a, b) => (b.interviewedAt || b.updatedAt).localeCompare(a.interviewedAt || a.updatedAt))
        .slice(0, 3),
    [notes],
  );

  const topSprintRecord = focusRecords[0] || null;
  const countdown = nextUpcoming ? formatCountdown(nextUpcoming.startAt, nowMs) : null;
  const nextIsLink = Boolean(nextUpcoming?.location && /^https?:\/\//i.test(nextUpcoming.location));
  const nextMeetingMeta =
    nextUpcoming && nextIsLink && nextUpcoming.location
      ? meetingActionMeta(nextUpcoming.location, nextUpcoming.kind)
      : null;

  return (
    <div className="page-container home-page">
      {/* 顶部极简问候与快捷动作 */}
      <header className="home-topbar">
        <div className="home-greet-wrap">
          <h1 className="home-greeting">
            {timeGreeting(nowDate)}，{user.username}
          </h1>
          <span className="home-date-pill">
            {nowDate.getMonth() + 1}月{nowDate.getDate()}日 {WEEKDAYS[nowDate.getDay()]}
          </span>
        </div>

        <div className="home-quick-actions">
          <button type="button" className="btn btn-soft" onClick={() => onAddNote()}>
            <IconNote size={14} />
            <span>记面经</span>
          </button>
          <button type="button" className="btn btn-soft" onClick={onAddEvent}>
            <IconCalendar size={14} />
            <span>新日程</span>
          </button>
          <button type="button" className="btn btn-primary" onClick={onAddRecord}>
            <IconPlus size={14} />
            <span>添加投递</span>
          </button>
        </div>
      </header>

      {/* Row 1：非对称首屏指挥舱（高对比深墨焦点卡 + 交互漏斗态势卡） */}
      <section className="home-hero-grid" aria-label="今日焦点与漏斗概览">
        {/* 左主角卡：下一场焦点舱 */}
        <article className="home-spotlight">
          {nextUpcoming ? (
            <>
              <div className="spotlight-top">
                <div className="spotlight-kicker-group">
                  <span className="spotlight-live-dot" aria-hidden="true" />
                  <span className="spotlight-kicker">下一场安排</span>
                  <span className="spotlight-kind-pill">{KIND_LABELS[nextUpcoming.kind]}</span>
                </div>
                {countdown && (
                  <span className={`spotlight-countdown${countdown.urgent ? " is-urgent" : ""}`}>
                    <IconClock size={13} />
                    <span>{countdown.text}</span>
                  </span>
                )}
              </div>

              <div className="spotlight-main">
                <div className="spotlight-logo-frame">
                  <CompanyLogo company={nextUpcoming.company} size="md" />
                </div>
                <div className="spotlight-body">
                  <h2 className="spotlight-title">{nextUpcoming.title}</h2>
                  <div className="spotlight-meta">
                    {nextUpcoming.position && <span>{nextUpcoming.position}</span>}
                    {nextUpcoming.location && !nextIsLink && (
                      <span className="spotlight-loc">
                        <IconMapPin size={12} />
                        <span>{nextUpcoming.location}</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="spotlight-specs">
                <div className="spotlight-spec">
                  <span className="spotlight-spec-k">开始时间</span>
                  <span className="spotlight-spec-v">
                    {formatFriendlyDay(nextUpcoming.startAt, nowMs)}
                    {nextUpcoming.endAt ? ` – ${formatClock(nextUpcoming.endAt)}` : ""}
                  </span>
                </div>
                <div className="spotlight-spec">
                  <span className="spotlight-spec-k">预计时长</span>
                  <span className="spotlight-spec-v">
                    {formatDurationShort(nextUpcoming.startAt, nextUpcoming.endAt)}
                  </span>
                </div>
                <div className="spotlight-spec">
                  <span className="spotlight-spec-k">当前环节</span>
                  <span className="spotlight-spec-v">
                    {nextUpcoming.stageName || KIND_LABELS[nextUpcoming.kind]}
                  </span>
                </div>
              </div>

              <div className="spotlight-foot">
                <div className="spotlight-cta-row">
                  {nextIsLink && nextUpcoming.location && nextMeetingMeta ? (
                    <a
                      href={nextUpcoming.location}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="spotlight-primary-btn"
                    >
                      {nextMeetingMeta.isExam ? <IconCode size={14} /> : <IconVideo size={14} />}
                      <span>{nextMeetingMeta.label}</span>
                      <IconExternal size={12} />
                    </a>
                  ) : (
                    <button
                      type="button"
                      className="spotlight-primary-btn"
                      onClick={onNavigateSchedule}
                    >
                      <IconCalendar size={14} />
                      <span>查看日程详情</span>
                    </button>
                  )}

                  <button
                    type="button"
                    className="spotlight-ghost-btn"
                    onClick={() =>
                      onAddNote({
                        recordId: nextUpcoming.recordId,
                        company: nextUpcoming.company,
                        position: nextUpcoming.position,
                        stageName: nextUpcoming.stageName || "一面",
                      })
                    }
                  >
                    <IconNote size={14} />
                    <span>面后写复盘</span>
                  </button>
                </div>

                {upcomingConfirmed.length > 1 && (
                  <button
                    type="button"
                    className="spotlight-more-link"
                    onClick={onNavigateSchedule}
                  >
                    <span>后续还有 {upcomingConfirmed.length - 1} 场</span>
                    <IconArrowRight size={13} />
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="spotlight-top">
                <div className="spotlight-kicker-group">
                  <span className="spotlight-kicker">近期日程清净</span>
                </div>
                <span className="spotlight-countdown">
                  <IconMail size={13} />
                  <span>{mailConfig?.enabled ? "邮箱监听运行中" : "未开启邮箱监听"}</span>
                </span>
              </div>

              <div className="spotlight-main">
                {topSprintRecord ? (
                  <>
                    <div className="spotlight-logo-frame">
                      <CompanyLogo company={topSprintRecord.company} url={topSprintRecord.url} size="md" />
                    </div>
                    <div className="spotlight-body">
                      <h2 className="spotlight-title">
                        正在跟进 {topSprintRecord.company}
                      </h2>
                      <div className="spotlight-meta">
                        <span>{topSprintRecord.position}</span>
                        <span className="spotlight-time-slot">
                          进展至 {currentStageLabel(topSprintRecord.stages).label}
                        </span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="spotlight-body">
                    <h2 className="spotlight-title">把每一次投递和面试排成清晰时间线</h2>
                    <div className="spotlight-meta">
                      <span>录入目标岗位或粘贴一封邀约邮件，系统自动梳理推进节奏</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="spotlight-foot">
                <div className="spotlight-cta-row">
                  <button type="button" className="spotlight-primary-btn" onClick={onAddEvent}>
                    <IconCalendar size={14} />
                    <span>安排面试日程</span>
                  </button>
                  <button type="button" className="spotlight-ghost-btn" onClick={onOpenParseModal}>
                    <IconSpark size={14} />
                    <span>粘贴邮件解析</span>
                  </button>
                </div>
                <button
                  type="button"
                  className="spotlight-more-link"
                  onClick={() => onNavigatePipeline("all")}
                >
                  <span>进入投递列表</span>
                  <IconArrowRight size={13} />
                </button>
              </div>
            </>
          )}
        </article>

        {/* 右侧统计卡：关键指标 + 可点击进度条 */}
        <article className="home-card home-funnel-card">
          <div className="home-card-head">
            <h2 className="home-card-title">投递统计</h2>
            <button
              type="button"
              className="home-card-link"
              onClick={() => onNavigatePipeline("all")}
            >
              <span>全部投递</span>
              <IconArrowRight size={13} />
            </button>
          </div>

          <div className="home-kpi-strip">
            <button
              type="button"
              className="home-kpi-cell"
              onClick={() => onNavigatePipeline("all")}
              data-tip="查看全部投递岗位"
            >
              <span className="home-kpi-val">{metrics.total}</span>
              <span className="home-kpi-label">总投递</span>
            </button>
            <button
              type="button"
              className="home-kpi-cell"
              onClick={() => onNavigatePipeline("active")}
              data-tip="筛选正在推进的岗位"
            >
              <span className="home-kpi-val tone-accent">{metrics.active}</span>
              <span className="home-kpi-label">推进中</span>
            </button>
            <button
              type="button"
              className="home-kpi-cell"
              onClick={() => onNavigatePipeline("interview")}
              data-tip="筛选已进入面试的岗位"
            >
              <span className="home-kpi-val">{metrics.interviewRate}%</span>
              <span className="home-kpi-label">进面率</span>
            </button>
            <button
              type="button"
              className="home-kpi-cell"
              onClick={() => onNavigatePipeline("offer")}
              data-tip="筛选已获 Offer 的岗位"
            >
              <span className="home-kpi-val tone-ok">{metrics.offered}</span>
              <span className="home-kpi-label">Offer</span>
            </button>
          </div>

          <div className="home-funnel-list">
            {funnelStages.map((step) => (
              <button
                key={step.label}
                type="button"
                className="funnel-row"
                onClick={() => onNavigatePipeline(step.key)}
              >
                <div className="funnel-row-head">
                  <span className="funnel-label">{step.label}</span>
                  <span className="funnel-nums">
                    <strong>{step.count}</strong>
                    <span>{step.pct}%</span>
                  </span>
                </div>
                <div className="funnel-track" aria-hidden="true">
                  <div
                    className={`funnel-fill tone-${step.tone}`}
                    style={{ width: `${Math.max(step.count > 0 ? 6 : 0, step.pct)}%` }}
                  />
                </div>
              </button>
            ))}
          </div>
        </article>
      </section>

      {/* Row 2：业务主操作双栏 */}
      <div className="home-main-grid">
        {/* 左栏：待确认邮箱动态 + 置顶冲刺队列 */}
        <div className="home-col-main">
          {pendingEvents.length > 0 && (
            <section className="home-card home-triage-card" aria-label="邮箱新通知">
              <div className="home-card-head">
                <div className="home-card-title-group">
                  <span className="home-head-ico tone-accent" aria-hidden="true">
                    <IconInbox size={15} />
                  </span>
                  <h2 className="home-card-title">邮箱待确认通知</h2>
                  <span className="section-count-pill">{pendingEvents.length}</span>
                </div>
                <button type="button" className="home-card-link" onClick={onNavigateSchedule}>
                  <span>处理全部</span>
                  <IconArrowRight size={13} />
                </button>
              </div>

              <div className="home-triage-list">
                {pendingEvents.slice(0, 2).map((ev) => {
                  const linked = ev.recordId ? recordMap.get(ev.recordId) : undefined;
                  return (
                    <div key={ev.id} className="home-triage-row">
                      <div className="home-triage-ident">
                        <CompanyLogo company={ev.company} size="sm" />
                        <div className="home-triage-info">
                          <div className="home-triage-title">{ev.title}</div>
                          <div className="home-triage-meta">
                            <span className="home-triage-time">
                              {formatEventShortTime(ev, nowMs)}
                            </span>
                            {ev.stageName && <span className="event-kind">{ev.stageName}</span>}
                            {linked && (
                              <button
                                type="button"
                                className="event-record-link"
                                onClick={() => onOpenRecordInPipeline(linked.company)}
                                data-tip="已自动关联该投递，点击前往手动更新进度"
                              >
                                <span>关联：{linked.position}</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="home-triage-ops">
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => void onConfirmEvent(ev)}
                        >
                          <IconCheck size={13} />
                          <span>加入日程</span>
                        </button>
                        {linked && (
                          <button
                            type="button"
                            className="btn btn-soft btn-sm"
                            onClick={() => onOpenRecordInPipeline(linked.company)}
                          >
                            更新进度
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn-text-muted"
                          onClick={() => void onDismissEvent(ev)}
                        >
                          忽略
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* 置顶与进行中列表 */}
          <section className="home-card" aria-label="置顶与进行中">
            <div className="home-card-head">
              <div className="home-card-title-group">
                <span className="group-star-icon" aria-hidden="true">
                  <IconStar size={15} filled />
                </span>
                <h2 className="home-card-title">置顶与进行中</h2>
                <span className="home-card-count">{focusRecords.length}</span>
              </div>
              <button
                type="button"
                className="home-card-link"
                onClick={() => onNavigatePipeline("active")}
              >
                <span>查看全部</span>
                <IconArrowRight size={13} />
              </button>
            </div>

            {focusRecords.length === 0 ? (
              <div className="home-empty-inline">
                <span>暂无进行中的投递记录</span>
                <button type="button" className="btn btn-soft btn-sm" onClick={onAddRecord}>
                  <IconPlus size={13} />
                  <span>添加第一条</span>
                </button>
              </div>
            ) : (
              <div className="home-focus-list">
                {focusRecords.map((rec) => {
                  const stageState = currentStageLabel(rec.stages);
                  const fresh = visitFreshness(rec.lastVisitedAt, nowMs);
                  const activeStageName =
                    rec.stages.find((s) => s.status === "current")?.name || "一面";
                  return (
                    <div key={rec.id} className="home-focus-row">
                      <div className="home-focus-left">
                        <CompanyLogo company={rec.company} url={rec.url} size="md" />
                        <div className="home-focus-info">
                          <div className="home-focus-name-row">
                            <span className="home-focus-company">{rec.company}</span>
                            {rec.pinned && (
                              <span className="home-pin-mark" data-tip="已置顶">
                                <IconStar size={12} filled />
                              </span>
                            )}
                            <span className={`home-stage-pill tone-${stageState.tone}`}>
                              {stageState.label}
                            </span>
                          </div>
                          <div className="home-focus-pos">{rec.position}</div>
                        </div>
                      </div>

                      <div className="home-mini-stepper" aria-label={`${rec.company} 阶段进度`}>
                        {rec.stages.map((st) => (
                          <span
                            key={st.id}
                            className={`home-step-seg st-${st.status}`}
                            data-tip={`${st.name}（${STAGE_STATUS_LABELS[st.status]}）`}
                          />
                        ))}
                      </div>

                      <div className="home-focus-right">
                        <span className={`freshness-text fresh-${fresh.level}`}>{fresh.text}</span>
                        <div className="home-focus-ops">
                          <button
                            type="button"
                            className="row-icon-btn"
                            onClick={() =>
                              onAddNote({
                                recordId: rec.id,
                                company: rec.company,
                                position: rec.position,
                                stageName: activeStageName,
                              })
                            }
                            data-tip="记录该岗位面经"
                            aria-label="记录面经"
                          >
                            <IconNote size={16} />
                          </button>
                          {rec.url && (
                            <button
                              type="button"
                              className="row-icon-btn"
                              onClick={() => void onVisitCompany(rec.company, rec.url)}
                              data-tip="打开官网进度并打卡"
                              aria-label="打开官网进度"
                            >
                              <IconExternal size={15} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* 右栏：7 天日程节奏 + 最近面经沉淀 */}
        <aside className="home-col-rail">
          {/* 7 天节奏带 */}
          <section className="home-card" aria-label="近 7 天日程节奏">
            <div className="home-card-head">
              <h2 className="home-card-title">近 7 天日程</h2>
              <button type="button" className="home-card-link" onClick={onNavigateSchedule}>
                <span>完整日历</span>
                <IconArrowRight size={13} />
              </button>
            </div>

            <div className="rhythm-strip" role="group" aria-label="按日期查看近期日程">
              {rhythmDays.map((day) => {
                const isSelected = selectedDayKey === day.key;
                const hasEvents = day.confirmedCount > 0 || day.pendingCount > 0;
                return (
                  <button
                    key={day.key}
                    type="button"
                    className={`rhythm-day${day.isToday ? " is-today" : ""}${isSelected ? " is-selected" : ""}${hasEvents ? " has-events" : ""}`}
                    onClick={() => setSelectedDayKey((prev) => (prev === day.key ? null : day.key))}
                    data-tip={day.tip}
                  >
                    <span className="rhythm-wd">{day.isToday ? "今" : day.weekday}</span>
                    <span className="rhythm-num">{day.dayNum}</span>
                    <span className="rhythm-ticks" aria-hidden="true">
                      {day.confirmedCount > 0 && <span className="cal-tick is-confirmed" />}
                      {day.pendingCount > 0 && <span className="cal-tick is-pending" />}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="rhythm-agenda">
              {rhythmAgenda.length === 0 ? (
                <div className="home-empty-inline compact">
                  <span>{selectedDayKey ? "所选日期暂无安排" : "近期暂无待办日程"}</span>
                  {selectedDayKey ? (
                    <button
                      type="button"
                      className="btn-link"
                      onClick={() => setSelectedDayKey(null)}
                    >
                      查看全部
                    </button>
                  ) : (
                    <button type="button" className="btn-link" onClick={onOpenMailModal}>
                      配置邮箱同步
                    </button>
                  )}
                </div>
              ) : (
                rhythmAgenda.map((ev) => {
                  const evDayKey = toLocalDayKey(new Date(ev.startAt));
                  const isLink = Boolean(ev.location && /^https?:\/\//i.test(ev.location));
                  const m = isLink && ev.location ? meetingActionMeta(ev.location, ev.kind) : null;
                  return (
                    <div key={ev.id} className="rhythm-row">
                      <div className="rhythm-time">
                        <span className="rhythm-clock">{formatClock(ev.startAt)}</span>
                        <span className="rhythm-day-tag">
                          {evDayKey === todayKey
                            ? "今天"
                            : `${new Date(ev.startAt).getMonth() + 1}/${new Date(ev.startAt).getDate()}`}
                        </span>
                      </div>
                      <span className="rhythm-vline" aria-hidden="true" />
                      <CompanyLogo company={ev.company} size="sm" />
                      <div className="rhythm-info">
                        <div className="rhythm-title">{ev.title}</div>
                        {ev.position && <div className="rhythm-sub">{ev.position}</div>}
                      </div>
                      {isLink && ev.location && m && (
                        <a
                          href={ev.location}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="row-icon-btn"
                          data-tip={m.label}
                          aria-label={m.label}
                        >
                          {m.isExam ? <IconCode size={15} /> : <IconVideo size={15} />}
                        </a>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* 最近面经沉淀 */}
          <section className="home-card" aria-label="最近面经沉淀">
            <div className="home-card-head">
              <h2 className="home-card-title">最近面经</h2>
              <button type="button" className="home-card-link" onClick={() => onAddNote()}>
                <span>记一篇</span>
                <IconPlus size={13} />
              </button>
            </div>

            {recentNotes.length === 0 ? (
              <div className="home-empty-inline compact">
                <span>还没有面经记录</span>
                <button type="button" className="btn-link" onClick={() => onAddNote()}>
                  立即记录
                </button>
              </div>
            ) : (
              <div className="home-notes-list">
                {recentNotes.map((note) => (
                  <button
                    key={note.id}
                    type="button"
                    className="home-note-row"
                    onClick={() => onOpenNoteById(note.id)}
                  >
                    <div className="home-note-top">
                      <div className="home-note-ident">
                        <CompanyLogo company={note.company} size="sm" />
                        <span className="home-note-company">{note.company}</span>
                        <span className="note-stage">{note.stageName}</span>
                      </div>
                      <span className={`note-feeling feel-${note.feeling}`}>
                        {FEELING_LABELS[note.feeling]}
                      </span>
                    </div>
                    <div className="home-note-excerpt">
                      {stripMarkdownForPreview(note.content)}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
