import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  groupAndSortCompanies,
  hasEnteredInterview,
  isRecordFailed,
  isRecordOffered,
  isRecordTerminated,
  STAGE_STATUS_LABELS,
  visitFreshness,
} from "../../shared/stages";
import type {
  ApplicationRecord,
  InterviewNote,
  MetricFilter,
  ScheduleEvent,
  SortMode,
  Stage,
  StageStatus,
} from "../../shared/types";
import { CompanyLogo } from "./CompanyLogo";
import {
  IconCalendar,
  IconEdit,
  IconExternal,
  IconNote,
  IconPin,
  IconPlus,
  IconSearch,
  IconTrash,
} from "./Icons";

interface PopoverTarget {
  record: ApplicationRecord;
  stageIndex: number;
  stage: Stage;
  rect: DOMRect;
}

const STAGE_ACTIONS: { status: StageStatus; label: string; tone?: string }[] = [
  { status: "pass", label: "通过", tone: "ok" },
  { status: "current", label: "设为当前", tone: "active" },
  { status: "skip", label: "跳过" },
  { status: "fail", label: "未通过", tone: "bad" },
  { status: "rejected", label: "主动拒绝" },
  { status: "pending", label: "重置待定" },
];

const FILTER_LABELS: Record<MetricFilter, string> = {
  all: "全部投递",
  active: "进行中",
  interview: "已进面试",
  offer: "Offer",
  failed: "已挂",
};

function formatShortDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function formatEventQuickTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const todayStr = now.toDateString();
  const tomorrow = new Date(now.getTime() + 86400_000).toDateString();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  if (d.toDateString() === todayStr) return `今天 ${hh}:${mm}`;
  if (d.toDateString() === tomorrow) return `明天 ${hh}:${mm}`;
  return `${d.getMonth() + 1}月${d.getDate()}日 ${hh}:${mm}`;
}

export function PipelineView({
  records,
  events,
  notes,
  metricFilter,
  onClearMetricFilter,
  onAddRecord,
  onAddForCompany,
  onEditRecord,
  onDeleteRecord,
  onChangeStageStatus,
  onPinCompany,
  onVisitCompany,
  onScheduleForStage,
  onWriteNoteForStage,
  onOpenScheduleTab,
  onOpenNotesForRecord,
}: {
  records: ApplicationRecord[];
  events: ScheduleEvent[];
  notes: InterviewNote[];
  metricFilter: MetricFilter;
  onClearMetricFilter: () => void;
  onAddRecord: () => void;
  onAddForCompany: (company: string, url?: string) => void;
  onEditRecord: (record: ApplicationRecord) => void;
  onDeleteRecord: (record: ApplicationRecord) => void;
  onChangeStageStatus: (recordId: string, stageIndex: number, status: StageStatus) => Promise<void>;
  onPinCompany: (company: string, pinned: boolean) => Promise<void>;
  onVisitCompany: (company: string, url?: string) => Promise<void>;
  onScheduleForStage: (record: ApplicationRecord, stageName: string) => void;
  onWriteNoteForStage: (record: ApplicationRecord, stageName: string) => void;
  onOpenScheduleTab: () => void;
  onOpenNotesForRecord: (company: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortMode>("progress");
  const [popover, setPopover] = useState<PopoverTarget | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPopover(null);
      } else if (
        e.key === "/" &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!popover) return;
    const onDocDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopover(null);
      }
    };
    const onScroll = () => setPopover(null);
    document.addEventListener("mousedown", onDocDown);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [popover]);

  const noteCountByRecord = useMemo(() => {
    const map = new Map<string, number>();
    for (const n of notes) {
      if (n.recordId) map.set(n.recordId, (map.get(n.recordId) || 0) + 1);
    }
    return map;
  }, [notes]);

  const filteredRecords = useMemo(() => {
    const q = query.trim().toLowerCase();
    return records.filter((r) => {
      if (q && !r.company.toLowerCase().includes(q) && !r.position.toLowerCase().includes(q)) {
        return false;
      }
      if (metricFilter === "active") {
        return r.status === "active" && !isRecordTerminated(r.stages) && !isRecordOffered(r.stages);
      }
      if (metricFilter === "interview") return hasEnteredInterview(r.stages);
      if (metricFilter === "offer") return isRecordOffered(r.stages);
      if (metricFilter === "failed") return isRecordFailed(r.stages);
      return true;
    });
  }, [records, query, metricFilter]);

  const groups = useMemo(
    () => groupAndSortCompanies(filteredRecords, sortBy),
    [filteredRecords, sortBy],
  );

  const pendingEmailEvents = useMemo(
    () => events.filter((e) => e.status === "pending_confirm"),
    [events],
  );

  const nextUpcomingEvent = useMemo(() => {
    const now = Date.now() - 30 * 60_000;
    return events
      .filter((e) => e.status === "confirmed" && Date.parse(e.startAt) >= now)
      .sort((a, b) => a.startAt.localeCompare(b.startAt))[0];
  }, [events]);

  function openStagePopover(
    e: React.MouseEvent<HTMLButtonElement>,
    record: ApplicationRecord,
    stageIndex: number,
    stage: Stage,
  ) {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setPopover((prev) =>
      prev && prev.record.id === record.id && prev.stageIndex === stageIndex
        ? null
        : { record, stageIndex, stage, rect },
    );
  }

  const popoverStyle = useMemo(() => {
    if (!popover) return undefined;
    const width = 264;
    const margin = 12;
    let left = popover.rect.left + popover.rect.width / 2 - width / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
    const spaceBelow = window.innerHeight - popover.rect.bottom;
    const top = spaceBelow > 190 ? popover.rect.bottom + 8 : Math.max(margin, popover.rect.top - 176);
    return { left, top, width };
  }, [popover]);

  return (
    <div className="page-container">
      {/* 顶部极简操作栏 */}
      <div className="toolbar">
        <div className="toolbar-left-group">
          <div className="search-box">
            <IconSearch size={15} />
            <input
              ref={searchRef}
              type="search"
              className="search-input"
              placeholder="搜索公司或职位…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {metricFilter !== "all" && (
            <button
              type="button"
              className="filter-clear-btn"
              onClick={onClearMetricFilter}
              title="点击恢复全部投递"
            >
              <span>{FILTER_LABELS[metricFilter]}</span>
              <span aria-hidden="true">×</span>
            </button>
          )}
        </div>

        <div className="toolbar-actions">
          <select
            className="select-minimal"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortMode)}
            aria-label="排序方式"
          >
            <option value="progress">按进度</option>
            <option value="visited">按最近访问</option>
            <option value="updated">按最近更新</option>
            <option value="created">按投递时间</option>
            <option value="company">按公司名</option>
          </select>

          <button type="button" className="btn btn-primary" onClick={onAddRecord}>
            <IconPlus size={14} />
            <span>添加投递</span>
          </button>
        </div>
      </div>

      {/* 克制的日程 / 邮箱提醒带（无待办时不渲染） */}
      {(pendingEmailEvents.length > 0 || nextUpcomingEvent) && (
        <section className="schedule-banner">
          {pendingEmailEvents.length > 0 ? (
            <div className="schedule-banner-row">
              <div className="schedule-banner-main">
                <span className="banner-kicker tone-accent">邮箱发现新通知</span>
                <span className="banner-text">
                  检测到 {pendingEmailEvents.length} 条来自邮箱的面试或笔试动态（如「{pendingEmailEvents[0].title}」）
                </span>
              </div>
              <button type="button" className="btn-link" onClick={onOpenScheduleTab}>
                前往确认 →
              </button>
            </div>
          ) : (
            nextUpcomingEvent && (
              <div className="schedule-banner-row">
                <div className="schedule-banner-main">
                  <CompanyLogo company={nextUpcomingEvent.company} size="sm" />
                  <span className="banner-time">{formatEventQuickTime(nextUpcomingEvent.startAt)}</span>
                  <span className="banner-text">{nextUpcomingEvent.title}</span>
                </div>
                <div className="schedule-banner-actions">
                  {nextUpcomingEvent.location && /^https?:\/\//i.test(nextUpcomingEvent.location) && (
                    <a
                      href={nextUpcomingEvent.location}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-link"
                    >
                      进入会议
                      <IconExternal size={12} />
                    </a>
                  )}
                  <button type="button" className="btn-link muted" onClick={onOpenScheduleTab}>
                    查看日程 →
                  </button>
                </div>
              </div>
            )
          )}
        </section>
      )}

      {/* 公司聚合列表 */}
      {groups.length === 0 ? (
        <div className="empty-panel">
          <p className="empty-title">
            {records.length === 0 ? "还没有投递记录" : "没有符合当前筛选条件的公司"}
          </p>
          {records.length === 0 && (
            <button type="button" className="btn btn-primary" onClick={onAddRecord}>
              <IconPlus size={14} />
              <span>添加第一条投递</span>
            </button>
          )}
        </div>
      ) : (
        <div className="company-list">
          {groups.map((group) => {
            const fresh = visitFreshness(group.lastVisitedAt);
            return (
              <article
                key={group.company}
                className={`company-card${group.pinned ? " is-pinned" : ""}${group.allTerminated ? " is-ended" : ""}`}
              >
                <div className="company-head">
                  <div className="company-ident">
                    <CompanyLogo company={group.company} size="md" />
                    <div className="company-title-wrap">
                      <h2 className="company-name">{group.company}</h2>
                      <span className="company-count">{group.records.length} 个岗位</span>
                      {group.pinned && <span className="company-pin-tag">已置顶</span>}
                    </div>
                  </div>

                  <div className="company-meta">
                    <span className={`freshness-text fresh-${fresh.level}`}>{fresh.text}</span>
                    {group.url && (
                      <button
                        type="button"
                        className="meta-link"
                        onClick={() => void onVisitCompany(group.company, group.url)}
                        title="打开官网投递进度并刷新访问时间"
                      >
                        <span>官网进度</span>
                        <IconExternal size={12} />
                      </button>
                    )}
                    <div className="company-hover-ops">
                      <button
                        type="button"
                        className="subtle-btn"
                        onClick={() => onAddForCompany(group.company, group.url)}
                        title="为该公司新增岗位"
                      >
                        <IconPlus size={13} />
                        <span>加岗</span>
                      </button>
                      <button
                        type="button"
                        className={`subtle-btn${group.pinned ? " is-active" : ""}`}
                        onClick={() => void onPinCompany(group.company, !group.pinned)}
                        title={group.pinned ? "取消置顶" : "置顶该公司"}
                      >
                        <IconPin size={13} filled={group.pinned} />
                        <span>{group.pinned ? "取消置顶" : "置顶"}</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="position-list">
                  {group.records.map((rec) => {
                    const ended = isRecordTerminated(rec.stages);
                    const recNotes = noteCountByRecord.get(rec.id) || 0;
                    return (
                      <div key={rec.id} className={`position-row${ended ? " is-ended" : ""}`}>
                        <div className="position-info">
                          <div className="position-name" title={rec.position}>
                            {rec.position}
                          </div>
                          <div className="position-sub">
                            <span>{formatShortDate(rec.createdAt)}</span>
                            {recNotes > 0 && (
                              <button
                                type="button"
                                className="inline-note-btn"
                                onClick={() => onOpenNotesForRecord(rec.company)}
                              >
                                <IconNote size={12} />
                                <span>面经 {recNotes}</span>
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="timeline-track" role="list" aria-label={`${rec.position} 流程`}>
                          {rec.stages.map((st, idx) => {
                            const isOpen =
                              popover?.record.id === rec.id && popover?.stageIndex === idx;
                            const isFirst = idx === 0;
                            const isLast = idx === rec.stages.length - 1;
                            const prevStatus = idx > 0 ? rec.stages[idx - 1].status : null;
                            const leftLineClass =
                              prevStatus === "pass"
                                ? "line-pass"
                                : prevStatus === "skip"
                                  ? "line-skip"
                                  : "line-pending";
                            const rightLineClass =
                              st.status === "pass"
                                ? "line-pass"
                                : st.status === "skip"
                                  ? "line-skip"
                                  : "line-pending";
                            return (
                              <button
                                key={st.id}
                                type="button"
                                role="listitem"
                                className={`tl-node st-${st.status}${isOpen ? " is-selected" : ""}${isFirst ? " is-first" : ""}${isLast ? " is-last" : ""}`}
                                onClick={(e) => openStagePopover(e, rec, idx, st)}
                                title={`${st.name} · ${STAGE_STATUS_LABELS[st.status]}（点击切换状态）`}
                              >
                                <span className="tl-dot-row">
                                  {!isFirst && <span className={`tl-arm tl-arm-left ${leftLineClass}`} />}
                                  <span className="tl-dot">
                                    {st.status === "pass" && (
                                      <svg viewBox="0 0 12 12" className="tl-mark" aria-hidden="true">
                                        <path d="M2.6 6.2 5 8.5 9.5 3.6" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                                      </svg>
                                    )}
                                    {st.status === "fail" && (
                                      <svg viewBox="0 0 12 12" className="tl-mark" aria-hidden="true">
                                        <path d="M3.5 3.5 8.5 8.5M8.5 3.5 3.5 8.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                                      </svg>
                                    )}
                                    {st.status === "rejected" && (
                                      <svg viewBox="0 0 12 12" className="tl-mark" aria-hidden="true">
                                        <path d="M3.2 6h5.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                                      </svg>
                                    )}
                                    {st.status === "skip" && (
                                      <svg viewBox="0 0 12 12" className="tl-mark" aria-hidden="true">
                                        <path d="M3.5 8.5 8.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                      </svg>
                                    )}
                                  </span>
                                  {!isLast && <span className={`tl-arm tl-arm-right ${rightLineClass}`} />}
                                </span>
                                <span className="tl-label">{st.name}</span>
                              </button>
                            );
                          })}
                        </div>

                        <div className="row-ops">
                          <button
                            type="button"
                            className="row-icon-btn"
                            onClick={() =>
                              onWriteNoteForStage(
                                rec,
                                rec.stages.find((s) => s.status === "current")?.name || "一面",
                              )
                            }
                            title="记录面经"
                            aria-label="记录面经"
                          >
                            <IconNote size={14} />
                          </button>
                          <button
                            type="button"
                            className="row-icon-btn"
                            onClick={() => onEditRecord(rec)}
                            title="编辑岗位与阶段"
                            aria-label="编辑岗位"
                          >
                            <IconEdit size={14} />
                          </button>
                          <button
                            type="button"
                            className="row-icon-btn danger"
                            onClick={() => onDeleteRecord(rec)}
                            title="删除该岗位"
                            aria-label="删除岗位"
                          >
                            <IconTrash size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* 就地 1-Click 阶段操作浮层 */}
      {popover && popoverStyle && (
        <div
          ref={popoverRef}
          className="stage-popover"
          style={popoverStyle}
          role="dialog"
          aria-label="更新阶段状态"
        >
          <div className="popover-head">
            <span className="popover-title">{popover.stage.name}</span>
            <span className="popover-status">{STAGE_STATUS_LABELS[popover.stage.status]}</span>
          </div>

          <div className="popover-grid">
            {STAGE_ACTIONS.map((act) => (
              <button
                key={act.status}
                type="button"
                className={`popover-choice${act.tone ? ` tone-${act.tone}` : ""}${popover.stage.status === act.status ? " is-current" : ""}`}
                onClick={async () => {
                  const target = popover;
                  setPopover(null);
                  await onChangeStageStatus(target.record.id, target.stageIndex, act.status);
                }}
              >
                {act.label}
              </button>
            ))}
          </div>

          <div className="popover-footer">
            <button
              type="button"
              className="popover-link"
              onClick={() => {
                const target = popover;
                setPopover(null);
                onScheduleForStage(target.record, target.stage.name);
              }}
            >
              <IconCalendar size={13} />
              <span>安排日程</span>
            </button>
            <button
              type="button"
              className="popover-link"
              onClick={() => {
                const target = popover;
                setPopover(null);
                onWriteNoteForStage(target.record, target.stage.name);
              }}
            >
              <IconNote size={13} />
              <span>写本轮面经</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
