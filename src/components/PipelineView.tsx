import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  computePipelineMetrics,
  groupAndSortCompanies,
  hasEnteredInterview,
  isRecordFailed,
  isRecordOffered,
  isRecordTerminated,
  STAGE_STATUS_LABELS,
  visitFreshness,
  type CompanyGroup,
} from "../../shared/stages";
import type {
  ApplicationRecord,
  InterviewNote,
  MetricFilter,
  SortMode,
  Stage,
  StageStatus,
} from "../../shared/types";
import { CompanyLogo } from "./CompanyLogo";
import {
  IconCalendar,
  IconCheck,
  IconChevron,
  IconClose,
  IconEdit,
  IconExternal,
  IconNote,
  IconPlus,
  IconSearch,
  IconSort,
  IconStar,
  IconTrash,
} from "./Icons";

interface PopoverTarget {
  record: ApplicationRecord;
  stageIndex: number;
  stage: Stage;
  rect: DOMRect;
}

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "progress", label: "按进度" },
  { value: "visited", label: "按最近访问" },
  { value: "updated", label: "按最近更新" },
  { value: "created", label: "按投递时间" },
  { value: "company", label: "按公司名" },
];

const STAGE_ACTIONS: { status: StageStatus; label: string; tone?: string }[] = [
  { status: "pass", label: "通过", tone: "ok" },
  { status: "current", label: "设为当前", tone: "active" },
  { status: "skip", label: "跳过" },
  { status: "fail", label: "未通过", tone: "bad" },
  { status: "rejected", label: "主动拒绝" },
  { status: "pending", label: "重置待定" },
];

function StageChoiceGlyph({ status }: { status: StageStatus }) {
  if (status === "pass") {
    return (
      <svg viewBox="0 0 12 12" className="choice-glyph" aria-hidden="true">
        <path
          d="M2.4 6.2 4.9 8.6 9.6 3.5"
          stroke="currentColor"
          strokeWidth="1.7"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (status === "current") {
    return (
      <svg viewBox="0 0 12 12" className="choice-glyph" aria-hidden="true">
        <circle cx="6" cy="6" r="3.2" fill="currentColor" />
      </svg>
    );
  }
  if (status === "fail") {
    return (
      <svg viewBox="0 0 12 12" className="choice-glyph" aria-hidden="true">
        <path d="M3.4 3.4 8.6 8.6M8.6 3.4 3.4 8.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  if (status === "skip") {
    return (
      <svg viewBox="0 0 12 12" className="choice-glyph" aria-hidden="true">
        <path d="M3.2 8.8 8.8 3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (status === "rejected") {
    return (
      <svg viewBox="0 0 12 12" className="choice-glyph" aria-hidden="true">
        <path d="M3 6h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 12 12" className="choice-glyph" aria-hidden="true">
      <circle cx="6" cy="6" r="3.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function formatShortDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export function PipelineView({
  records,
  notes,
  initialFilter,
  onClearInitialFilter,
  initialQuery,
  onClearInitialQuery,
  onAddRecord,
  onAddForCompany,
  onEditRecord,
  onDeleteRecord,
  onChangeStageStatus,
  onPinCompany,
  onVisitCompany,
  onScheduleForStage,
  onWriteNoteForStage,
  onOpenNotesForRecord,
}: {
  records: ApplicationRecord[];
  notes: InterviewNote[];
  initialFilter?: MetricFilter | null;
  onClearInitialFilter?: () => void;
  initialQuery?: string;
  onClearInitialQuery?: () => void;
  onAddRecord: () => void;
  onAddForCompany: (company: string, url?: string) => void;
  onEditRecord: (record: ApplicationRecord) => void;
  onDeleteRecord: (record: ApplicationRecord) => void;
  onChangeStageStatus: (recordId: string, stageIndex: number, status: StageStatus) => Promise<void>;
  onPinCompany: (company: string, pinned: boolean) => Promise<void>;
  onVisitCompany: (company: string, url?: string) => Promise<void>;
  onScheduleForStage: (record: ApplicationRecord, stageName: string) => void;
  onWriteNoteForStage: (record: ApplicationRecord, stageName: string) => void;
  onOpenNotesForRecord: (company: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortMode>("progress");
  const [sortOpen, setSortOpen] = useState(false);
  const [metricFilter, setMetricFilter] = useState<MetricFilter>(initialFilter || "all");
  const [popover, setPopover] = useState<PopoverTarget | null>(null);
  const [justUpdatedKeys, setJustUpdatedKeys] = useState<string[]>([]);
  const [justPinnedCompany, setJustPinnedCompany] = useState<string | null>(null);
  const prevStageMapRef = useRef<Map<string, StageStatus>>(new Map());

  useEffect(() => {
    if (!initialFilter) return;
    setMetricFilter(initialFilter);
    onClearInitialFilter?.();
  }, [initialFilter, onClearInitialFilter]);

  useEffect(() => {
    if (!initialQuery) return;
    setQuery(initialQuery);
    onClearInitialQuery?.();
  }, [initialQuery, onClearInitialQuery]);

  const popoverRef = useRef<HTMLDivElement>(null);
  const sortRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const [inkBar, setInkBar] = useState<{ left: number; width: number; ready: boolean }>({
    left: 0,
    width: 0,
    ready: false,
  });

  const metrics = useMemo(() => computePipelineMetrics(records), [records]);

  const filterTabs = useMemo(
    (): { key: MetricFilter; label: string; count: number }[] => [
      { key: "all", label: "全部", count: metrics.total },
      { key: "active", label: "进行中", count: metrics.active },
      { key: "interview", label: "已进面试", count: metrics.interviewed },
      { key: "offer", label: "Offer", count: metrics.offered },
      { key: "failed", label: "已挂", count: metrics.failed },
    ],
    [metrics],
  );

  useLayoutEffect(() => {
    const wrap = tabsRef.current;
    if (!wrap) return;
    const measure = () => {
      const activeBtn = wrap.querySelector<HTMLButtonElement>(".filter-tab.active");
      if (!activeBtn) return;
      const padL = parseFloat(getComputedStyle(activeBtn).paddingLeft) || 0;
      const padR = parseFloat(getComputedStyle(activeBtn).paddingRight) || 0;
      setInkBar({
        left: activeBtn.offsetLeft + padL,
        width: Math.max(20, activeBtn.offsetWidth - padL - padR),
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
  }, [metricFilter, filterTabs]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPopover(null);
        setSortOpen(false);
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
    if (!sortOpen) return;
    const onDocDown = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setSortOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [sortOpen]);

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

  // 追踪发生状态跃迁的节点（例如当前点 pass + 下一节点自动亮起 current 同步弹跳）
  useEffect(() => {
    const prev = prevStageMapRef.current;
    const next = new Map<string, StageStatus>();
    const changed: string[] = [];
    for (const r of records) {
      r.stages.forEach((st, idx) => {
        const key = `${r.id}:${idx}`;
        next.set(key, st.status);
        const oldStatus = prev.get(key);
        if (oldStatus && oldStatus !== st.status) {
          changed.push(key);
        }
      });
    }
    prevStageMapRef.current = next;
    if (changed.length > 0) {
      setJustUpdatedKeys(changed);
    }
  }, [records]);

  useEffect(() => {
    if (!justUpdatedKeys.length) return;
    const t = setTimeout(() => setJustUpdatedKeys([]), 680);
    return () => clearTimeout(t);
  }, [justUpdatedKeys]);

  useEffect(() => {
    if (!justPinnedCompany) return;
    const t = setTimeout(() => setJustPinnedCompany(null), 480);
    return () => clearTimeout(t);
  }, [justPinnedCompany]);

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

  const sections = useMemo(() => {
    const pinned = groups.filter((g) => g.pinned);
    const active = groups.filter((g) => !g.pinned && !g.allTerminated);
    const ended = groups.filter((g) => !g.pinned && g.allTerminated);
    const list: { key: string; label: string; starred?: boolean; items: CompanyGroup[] }[] = [];
    if (pinned.length) list.push({ key: "pinned", label: "置顶", starred: true, items: pinned });
    if (active.length) list.push({ key: "active", label: "推进中", items: active });
    if (ended.length) list.push({ key: "ended", label: "已结束", items: ended });
    return list;
  }, [groups]);

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

  const popoverPlacement = useMemo(() => {
    if (!popover) return null;
    const width = 282;
    const margin = 12;
    let left = popover.rect.left + popover.rect.width / 2 - width / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
    const spaceBelow = window.innerHeight - popover.rect.bottom;
    const placement: "bottom" | "top" = spaceBelow > 205 ? "bottom" : "top";
    const top =
      placement === "bottom"
        ? popover.rect.bottom + 9
        : Math.max(margin, popover.rect.top - 186);
    return { style: { left, top, width }, placement };
  }, [popover]);

  const currentSortLabel =
    SORT_OPTIONS.find((o) => o.value === sortBy)?.label || "按进度";

  function renderCompanyCard(group: CompanyGroup, cardIdx: number) {
    const fresh = visitFreshness(group.lastVisitedAt);
    const isStarPopping = justPinnedCompany === group.company;
    return (
      <article
        key={group.company}
        className={`company-card${group.allTerminated && !group.pinned ? " is-ended" : ""}`}
        style={{ "--stagger": Math.min(cardIdx, 6) } as React.CSSProperties}
      >
        <div className="company-head">
          <div className="company-ident">
            <CompanyLogo company={group.company} url={group.url} size="md" />
            <div className="company-title-wrap">
              <h2 className="company-name">{group.company}</h2>
              <span className="company-count">{group.records.length} 个岗位</span>
              {group.hasOffer && <span className="offer-inline-badge">已获 Offer</span>}
            </div>
          </div>

          <div className="company-meta">
            <span className={`freshness-text fresh-${fresh.level}`}>{fresh.text}</span>
            {group.url && (
              <button
                type="button"
                className="meta-link"
                onClick={() => void onVisitCompany(group.company, group.url)}
                data-tip="打开官网投递进度并刷新访问时间"
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
                data-tip="为该公司新增一个投递岗位"
              >
                <IconPlus size={13} />
                <span>加岗</span>
              </button>
              <button
                type="button"
                className={`star-btn${group.pinned ? " is-starred" : ""}${isStarPopping ? " is-popping" : ""}`}
                onClick={() => {
                  setJustPinnedCompany(group.company);
                  void onPinCompany(group.company, !group.pinned);
                }}
                data-tip={group.pinned ? "取消置顶" : "置顶该公司"}
                aria-label={group.pinned ? "取消置顶" : "置顶该公司"}
              >
                <IconStar size={19} filled={group.pinned} />
              </button>
            </div>
          </div>
        </div>

        <div className="position-list">
          {group.records.map((rec) => {
            const ended = isRecordTerminated(rec.stages);
            const offered = isRecordOffered(rec.stages);
            const recNotes = noteCountByRecord.get(rec.id) || 0;
            return (
              <div key={rec.id} className={`position-row${ended ? " is-ended" : ""}`}>
                <div className="position-info">
                  <div className="position-name" data-tip={rec.position.length > 10 ? rec.position : undefined}>
                    {rec.position}
                  </div>
                  <div className="position-sub">
                    <span>{formatShortDate(rec.createdAt)}</span>
                    {offered && group.records.length > 1 && <span className="pos-offer-text">已录用</span>}
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
                    const isOpen = popover?.record.id === rec.id && popover?.stageIndex === idx;
                    const isJustUpdated = justUpdatedKeys.includes(`${rec.id}:${idx}`);
                    const isFirst = idx === 0;
                    const isLast = idx === rec.stages.length - 1;
                    const isOfferPass = st.type === "offer" && st.status === "pass";
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
                        className={`tl-node st-${st.status}${isOpen ? " is-selected" : ""}${isJustUpdated ? " is-pop" : ""}${isOfferPass ? " is-offer-win" : ""}${isFirst ? " is-first" : ""}${isLast ? " is-last" : ""}`}
                        onClick={(e) => openStagePopover(e, rec, idx, st)}
                        data-tip={`${st.name}（${STAGE_STATUS_LABELS[st.status]}，点击切换）`}
                      >
                        <span className="tl-dot-row">
                          {!isFirst && <span className={`tl-arm tl-arm-left ${leftLineClass}`} />}
                          <span className="tl-dot">
                            {st.status === "current" && (
                              <>
                                <span className="tl-current-pulse" aria-hidden="true" />
                                <span className="tl-current-core" aria-hidden="true" />
                              </>
                            )}
                            {st.status === "pass" && (
                              <svg viewBox="0 0 12 12" className="tl-mark tl-mark-check" aria-hidden="true">
                                <path
                                  d="M2.6 6.2 5 8.5 9.5 3.6"
                                  stroke="currentColor"
                                  strokeWidth="1.75"
                                  fill="none"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            )}
                            {st.status === "fail" && (
                              <svg viewBox="0 0 12 12" className="tl-mark" aria-hidden="true">
                                <path
                                  d="M3.5 3.5 8.5 8.5M8.5 3.5 3.5 8.5"
                                  stroke="currentColor"
                                  strokeWidth="1.65"
                                  strokeLinecap="round"
                                />
                              </svg>
                            )}
                            {st.status === "rejected" && (
                              <svg viewBox="0 0 12 12" className="tl-mark" aria-hidden="true">
                                <path
                                  d="M3.2 6h5.6"
                                  stroke="currentColor"
                                  strokeWidth="1.7"
                                  strokeLinecap="round"
                                />
                              </svg>
                            )}
                            {st.status === "skip" && (
                              <svg viewBox="0 0 12 12" className="tl-mark" aria-hidden="true">
                                <path
                                  d="M3.5 8.5 8.5 3.5"
                                  stroke="currentColor"
                                  strokeWidth="1.5"
                                  strokeLinecap="round"
                                />
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
                    data-tip="记录面经"
                    aria-label="记录面经"
                  >
                    <IconNote size={18} />
                  </button>
                  <button
                    type="button"
                    className="row-icon-btn"
                    onClick={() => onEditRecord(rec)}
                    data-tip="编辑岗位与阶段"
                    aria-label="编辑岗位"
                  >
                    <IconEdit size={18} />
                  </button>
                  <button
                    type="button"
                    className="row-icon-btn danger"
                    onClick={() => onDeleteRecord(rec)}
                    data-tip="删除该岗位"
                    aria-label="删除岗位"
                  >
                    <IconTrash size={18} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </article>
    );
  }

  return (
    <div className="page-container">
      {/* 顶部极简操作栏 */}
      <div className="toolbar">
        <div className="toolbar-left-group">
          <div className="search-box">
            <IconSearch size={15} />
            <input
              ref={searchRef}
              type="text"
              className="search-input"
              placeholder="搜索公司或职位…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button
                type="button"
                className="search-clear"
                onClick={() => {
                  setQuery("");
                  searchRef.current?.focus();
                }}
                aria-label="清空搜索"
              >
                <IconClose size={13} />
              </button>
            )}
          </div>
        </div>

        <div className="toolbar-actions">
          <div className="sort-menu-wrap" ref={sortRef}>
            <button
              type="button"
              className={`sort-trigger${sortOpen ? " is-open" : ""}`}
              onClick={() => setSortOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={sortOpen}
              aria-label="排序方式"
            >
              <IconSort size={14} />
              <span>{currentSortLabel}</span>
              <span className="sort-chevron">
                <IconChevron size={13} />
              </span>
            </button>

            {sortOpen && (
              <div className="sort-popover" role="menu">
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={sortBy === opt.value}
                    className={`sort-option${sortBy === opt.value ? " active" : ""}`}
                    onClick={() => {
                      setSortBy(opt.value);
                      setSortOpen(false);
                    }}
                  >
                    <span>{opt.label}</span>
                    {sortBy === opt.value && <IconCheck size={14} />}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button type="button" className="btn btn-primary" onClick={onAddRecord}>
            <IconPlus size={14} />
            <span>添加投递</span>
          </button>
        </div>
      </div>

      {/* 列表就近筛选条（纯净状态切换，干扰横幅已迁至概览主页） */}
      <div className="filter-bar" role="tablist" aria-label="按状态筛选投递">
        <div className="filter-tabs" ref={tabsRef}>
          {filterTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={metricFilter === tab.key}
              className={`filter-tab${metricFilter === tab.key ? " active" : ""}`}
              onClick={() => setMetricFilter(tab.key)}
            >
              <span>{tab.label}</span>
              <span className="filter-tab-count">{tab.count}</span>
            </button>
          ))}
          <span
            className={`filter-ink-bar${inkBar.ready ? " is-ready" : ""}`}
            style={{
              transform: `translate3d(${inkBar.left}px, 0, 0)`,
              width: `${inkBar.width}px`,
            }}
            aria-hidden="true"
          />
        </div>
      </div>

      {/* 分区公司聚合列表 */}
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
        <div className="pipeline-sections">
          {sections.map((sec) => (
            <section key={sec.key} className="pipeline-group">
              {sections.length > 1 && (
                <div className="pipeline-group-head">
                  {sec.starred && (
                    <span className="group-star-icon" aria-hidden="true">
                      <IconStar size={16} filled />
                    </span>
                  )}
                  <span className="pipeline-group-title">{sec.label}</span>
                  <span className="pipeline-group-count">{sec.items.length}</span>
                </div>
              )}
              <div className="company-list">{sec.items.map(renderCompanyCard)}</div>
            </section>
          ))}
        </div>
      )}

      {/* 就地 1-Click 阶段操作浮层 */}
      {popover && popoverPlacement && (
        <div
          ref={popoverRef}
          className="stage-popover"
          data-placement={popoverPlacement.placement}
          style={popoverPlacement.style}
          role="dialog"
          aria-label="更新阶段状态"
        >
          <div className="popover-head">
            <span className="popover-title">{popover.stage.name}</span>
            <span className={`popover-status st-text-${popover.stage.status}`}>
              {STAGE_STATUS_LABELS[popover.stage.status]}
            </span>
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
                <StageChoiceGlyph status={act.status} />
                <span>{act.label}</span>
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
