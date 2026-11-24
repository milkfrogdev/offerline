import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ApplicationRecord, InterviewNote, NoteFeeling } from "../../shared/types";
import { copyText } from "../clipboard";
import { CompanyLogo } from "./CompanyLogo";
import {
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconClose,
  IconCopy,
  IconPlus,
  IconSearch,
  IconTrash,
} from "./Icons";
import {
  loadSavedEditorMode,
  NoteEditor,
  saveEditorMode,
  stripMarkdownForPreview,
  type NoteEditorMode,
} from "./NoteEditor";

type FeelingFilter = "all" | NoteFeeling;

const FEELING_TABS: { key: FeelingFilter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "great", label: "顺畅" },
  { key: "normal", label: "正常" },
  { key: "hard", label: "偏难" },
];

export function NotesView({
  notes,
  records,
  initialFilter,
  initialNoteId,
  latestCreatedId,
  onClearInitialFilter,
  onClearInitialNoteId,
  onAddNote,
  onUpdateNoteInline,
  onDeleteNote,
}: {
  notes: InterviewNote[];
  records: ApplicationRecord[];
  initialFilter: string;
  initialNoteId?: string | null;
  latestCreatedId?: string | null;
  onClearInitialFilter: () => void;
  onClearInitialNoteId?: () => void;
  onAddNote: (preset?: {
    recordId?: string;
    company?: string;
    position?: string;
    stageName?: string;
  }) => void;
  onUpdateNoteInline: (
    id: string,
    payload: {
      stageName: string;
      interviewedAt: string | null;
      feeling: NoteFeeling;
      content: string;
    },
  ) => Promise<void>;
  onDeleteNote: (note: InterviewNote) => void;
}) {
  const [query, setQuery] = useState("");
  const [feelingFilter, setFeelingFilter] = useState<FeelingFilter>("all");
  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(initialNoteId || notes[0]?.id || null);

  // Persistent editor mode: Word-style Rich Text vs WYSIWYG Markdown
  const [editorMode, setEditorMode] = useState<NoteEditorMode>(loadSavedEditorMode);

  // Live editable draft bound to active note
  const [draftStage, setDraftStage] = useState("");
  const [draftDate, setDraftDate] = useState("");
  const [draftFeeling, setDraftFeeling] = useState<NoteFeeling>("normal");
  const [draftContent, setDraftContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const segRef = useRef<HTMLDivElement>(null);
  const [segThumb, setSegThumb] = useState<{ left: number; width: number; ready: boolean }>({
    left: 0,
    width: 0,
    ready: false,
  });

  useEffect(() => {
    const incoming = initialFilter.trim();
    if (!incoming) return;
    const hasExactCompany = notes.some((n) => n.company.trim() === incoming);
    if (hasExactCompany) {
      setCompanyFilter(incoming);
      setQuery("");
    } else {
      setQuery(incoming);
    }
    onClearInitialFilter();
  }, [initialFilter, notes, onClearInitialFilter]);

  useEffect(() => {
    if (!initialNoteId) return;
    setCompanyFilter("all");
    setFeelingFilter("all");
    setQuery("");
    setSelectedId(initialNoteId);
    onClearInitialNoteId?.();
  }, [initialNoteId, onClearInitialNoteId]);

  useEffect(() => {
    if (!latestCreatedId) return;
    setSelectedId(latestCreatedId);
  }, [latestCreatedId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA" &&
        !(document.activeElement as HTMLElement | null)?.isContentEditable
      ) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
  }, [feelingFilter]);

  const companyFacets = useMemo(() => {
    const map = new Map<string, number>();
    for (const n of notes) {
      const c = n.company.trim();
      if (!c) continue;
      map.set(c, (map.get(c) || 0) + 1);
    }
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN"))
      .map(([company, count]) => ({ company, count }));
  }, [notes]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return notes.filter((n) => {
      if (feelingFilter !== "all" && n.feeling !== feelingFilter) return false;
      if (companyFilter !== "all" && n.company.trim() !== companyFilter) return false;
      if (!q) return true;
      return (
        n.company.toLowerCase().includes(q) ||
        n.position.toLowerCase().includes(q) ||
        n.stageName.toLowerCase().includes(q) ||
        n.content.toLowerCase().includes(q)
      );
    });
  }, [notes, query, feelingFilter, companyFilter]);

  const activeNote = useMemo(() => {
    if (!filtered.length) return null;
    return filtered.find((n) => n.id === selectedId) || filtered[0];
  }, [filtered, selectedId]);

  const activeIdx = useMemo(
    () => (activeNote ? filtered.findIndex((n) => n.id === activeNote.id) : -1),
    [filtered, activeNote],
  );

  // Sync editor draft whenever activeNote changes
  useEffect(() => {
    if (!activeNote) return;
    setDraftStage(activeNote.stageName);
    setDraftDate(activeNote.interviewedAt || activeNote.createdAt.slice(0, 10));
    setDraftFeeling(activeNote.feeling);
    setDraftContent(activeNote.content);
  }, [activeNote?.id, activeNote?.updatedAt]);

  const isDirty = Boolean(
    activeNote &&
      (draftContent.trim() !== activeNote.content.trim() ||
        draftStage.trim() !== activeNote.stageName.trim() ||
        draftDate !== (activeNote.interviewedAt || activeNote.createdAt.slice(0, 10)) ||
        draftFeeling !== activeNote.feeling),
  );

  const linkedRecord = useMemo(() => {
    if (!activeNote) return null;
    if (activeNote.recordId) {
      const exact = records.find((r) => r.id === activeNote.recordId);
      if (exact) return exact;
    }
    return (
      records.find(
        (r) =>
          r.company.trim() === activeNote.company.trim() &&
          (!activeNote.position || r.position.trim() === activeNote.position.trim()),
      ) ||
      records.find((r) => r.company.trim() === activeNote.company.trim()) ||
      null
    );
  }, [activeNote, records]);

  const saveActiveNote = useCallback(async () => {
    if (!activeNote || saving || !isDirty || !draftContent.trim()) return;
    setSaving(true);
    try {
      await onUpdateNoteInline(activeNote.id, {
        stageName: draftStage.trim() || activeNote.stageName,
        interviewedAt: draftDate || null,
        feeling: draftFeeling,
        content: draftContent.trim(),
      });
    } finally {
      setSaving(false);
    }
  }, [activeNote, saving, isDirty, draftContent, draftStage, draftDate, draftFeeling, onUpdateNoteInline]);

  function changeMode(next: NoteEditorMode) {
    setEditorMode(next);
    saveEditorMode(next);
  }

  async function copyNote(note: InterviewNote) {
    const header = [note.company, note.position, note.stageName].filter(Boolean).join(" / ");
    const ok = await copyText(`${header}\n\n${draftContent || note.content}`);
    if (ok) {
      setCopiedId(note.id);
      setTimeout(() => setCopiedId((prev) => (prev === note.id ? null : prev)), 1600);
    }
  }

  function handleAddNoteSmart() {
    if (companyFilter !== "all") {
      const rec = records.find((r) => r.company.trim() === companyFilter);
      if (rec) {
        onAddNote({ recordId: rec.id, company: rec.company, position: rec.position });
        return;
      }
      onAddNote({ company: companyFilter });
      return;
    }
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      const rec = records.find((r) => r.company.toLowerCase().includes(q));
      if (rec) {
        onAddNote({ recordId: rec.id, company: rec.company, position: rec.position });
        return;
      }
    }
    onAddNote();
  }

  const wordCount = useMemo(
    () => stripMarkdownForPreview(draftContent).replace(/\s+/g, "").length,
    [draftContent],
  );

  return (
    <div className="page-container">
      {/* 顶栏：干净搜索 + 弹性体感分段 + 主按钮 */}
      <div className="toolbar">
        <div className="toolbar-left-group">
          <div className="search-box">
            <IconSearch size={15} />
            <input
              ref={searchRef}
              type="text"
              className="search-input"
              placeholder="搜索公司、轮次或面经题目关键词…"
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

          <div className="seg-control" ref={segRef} role="tablist" aria-label="按面试发挥筛选">
            <span
              className={`seg-thumb${segThumb.ready ? " is-ready" : ""}`}
              style={{
                transform: `translate3d(${segThumb.left}px, 0, 0)`,
                width: `${segThumb.width}px`,
              }}
              aria-hidden="true"
            />
            {FEELING_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={feelingFilter === tab.key}
                className={`seg-btn${feelingFilter === tab.key ? " active" : ""}`}
                onClick={() => setFeelingFilter(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="toolbar-actions">
          <button type="button" className="btn btn-primary" onClick={handleAddNoteSmart}>
            <IconPlus size={14} />
            <span>记一篇面经</span>
          </button>
        </div>
      </div>

      {/* 公司图标快筛条 */}
      {companyFacets.length > 1 && (
        <div className="company-facet-bar" role="group" aria-label="按公司筛选面经">
          <button
            type="button"
            className={`facet-chip${companyFilter === "all" ? " active" : ""}`}
            onClick={() => setCompanyFilter("all")}
          >
            <span>全部公司</span>
            <span className="facet-count">{notes.length}</span>
          </button>
          {companyFacets.map((item) => (
            <button
              key={item.company}
              type="button"
              className={`facet-chip${companyFilter === item.company ? " active" : ""}`}
              onClick={() =>
                setCompanyFilter((prev) => (prev === item.company ? "all" : item.company))
              }
            >
              <CompanyLogo company={item.company} size="sm" />
              <span>{item.company}</span>
              <span className="facet-count">{item.count}</span>
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 || !activeNote ? (
        <div className="empty-panel">
          <p className="empty-title">
            {notes.length === 0 ? "还没有面经记录" : "没有找到匹配的面经"}
          </p>
          <p className="empty-desc">
            {notes.length === 0
              ? "每场面试结束后随手记下问到的题目与复盘，支持富文本与所见即所得 Markdown 自由切换。"
              : "换个关键词或筛选条件试试，也可以一键清空筛选查看全部复盘。"}
          </p>
          {notes.length === 0 ? (
            <button type="button" className="btn btn-primary" onClick={handleAddNoteSmart}>
              <IconPlus size={14} />
              <span>写第一篇面经</span>
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-soft btn-sm"
              onClick={() => {
                setQuery("");
                setFeelingFilter("all");
                setCompanyFilter("all");
              }}
            >
              清空全部筛选
            </button>
          )}
        </div>
      ) : (
        /* Master-Detail 双栏文档工作台 */
        <div className="notes-workspace">
          {/* 左栏：统一白底复盘目录 */}
          <aside className="notes-index-surface" aria-label="面经列表">
            <div className="notes-index-head">
              <span className="notes-index-title">复盘目录</span>
              <span className="notes-index-count">{filtered.length} 篇</span>
            </div>

            <div className="notes-index-list">
              {filtered.map((note) => {
                const isActive = note.id === activeNote.id;
                return (
                  <button
                    key={note.id}
                    type="button"
                    className={`note-index-item${isActive ? " is-active" : ""}`}
                    onClick={() => setSelectedId(note.id)}
                    aria-current={isActive ? "true" : undefined}
                  >
                    <div className="note-idx-top">
                      <div className="note-idx-ident">
                        <CompanyLogo company={note.company} size="sm" />
                        <span className="note-idx-company">{note.company}</span>
                        <span className="note-stage">{note.stageName}</span>
                      </div>
                      <span className="note-idx-date">
                        {(note.interviewedAt || note.createdAt.slice(0, 10)).slice(5)}
                      </span>
                    </div>

                    <div className="note-idx-sub">
                      <span className="note-idx-pos">{note.position || "未填岗位"}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* 右栏：极简面经文档画布 */}
          <section key={activeNote.id} className="note-reader-surface" aria-label="面经文档工作区">
            <header className="note-reader-head">
              <div className="note-reader-top">
                <div className="note-reader-ident">
                  <CompanyLogo company={activeNote.company} url={linkedRecord?.url} size="md" />
                  <div className="note-reader-title-row">
                    <h2 className="note-reader-company">{activeNote.company}</h2>
                    <input
                      type="text"
                      className="note-stage-inline"
                      value={draftStage}
                      onChange={(e) => setDraftStage(e.target.value)}
                      data-tip="直接编辑面试轮次"
                      aria-label="面试轮次"
                    />
                  </div>
                </div>

                <div className="note-reader-ops">
                  {linkedRecord && (
                    <button
                      type="button"
                      className="subtle-btn"
                      onClick={() =>
                        onAddNote({
                          recordId: linkedRecord.id,
                          company: linkedRecord.company,
                          position: linkedRecord.position,
                          stageName:
                            linkedRecord.stages.find((s) => s.status === "current")?.name || "二面",
                        })
                      }
                    >
                      <IconPlus size={13} />
                      <span>记下一轮</span>
                    </button>
                  )}

                  {isDirty ? (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={saving}
                      onClick={() => void saveActiveNote()}
                      data-tip="保存当前改动 (Ctrl+S)"
                    >
                      <IconCheck size={14} />
                      <span>{saving ? "保存中…" : "保存"}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-soft btn-sm"
                      onClick={() => void copyNote(activeNote)}
                      data-tip="复制整篇复盘到剪贴板"
                    >
                      {copiedId === activeNote.id ? <IconCheck size={14} /> : <IconCopy size={14} />}
                      <span>{copiedId === activeNote.id ? "已复制" : "复制"}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    className="row-icon-btn danger"
                    onClick={() => onDeleteNote(activeNote)}
                    data-tip="删除这篇面经"
                    aria-label="删除面经"
                  >
                    <IconTrash size={17} />
                  </button>
                </div>
              </div>

              <div className="note-reader-meta">
                {activeNote.position && <span className="meta-chip-text">{activeNote.position}</span>}
                <input
                  type="date"
                  className="note-date-inline"
                  value={draftDate}
                  onChange={(e) => setDraftDate(e.target.value)}
                  data-tip="点击修改面试日期"
                  aria-label="面试日期"
                />
                <div className="feeling-inline-group" role="group" aria-label="本轮体感">
                  {(["great", "normal", "hard"] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      className={`feeling-inline-btn feel-${f}${draftFeeling === f ? " is-active" : ""}`}
                      onClick={() => setDraftFeeling(f)}
                    >
                      {f === "great" ? "顺畅" : f === "normal" ? "正常" : "偏难"}
                    </button>
                  ))}
                </div>
              </div>
            </header>

            {/* 正文统一编辑区 */}
            <NoteEditor
              docKey={`${activeNote.id}-${activeNote.updatedAt}`}
              value={draftContent}
              mode={editorMode}
              expandTitle={activeNote.position ? `${activeNote.company} ${activeNote.position}` : activeNote.company}
              expandBadge={draftStage || activeNote.stageName}
              onModeChange={changeMode}
              onChange={setDraftContent}
              onSaveShortcut={() => void saveActiveNote()}
            />

            {/* 底部状态与快速翻篇 */}
            <footer className="note-reader-foot">
              <div className="reader-foot-meta">
                <span>{wordCount} 字</span>
                <span className={`save-state-badge${isDirty ? " is-dirty" : ""}`}>
                  {saving ? "正在保存…" : isDirty ? "有未保存改动（Ctrl+S 保存）" : "已同步保存"}
                </span>
              </div>

              {filtered.length > 1 && (
                <div className="reader-pager">
                  <button
                    type="button"
                    className="pager-btn"
                    disabled={activeIdx <= 0}
                    onClick={() => activeIdx > 0 && setSelectedId(filtered[activeIdx - 1].id)}
                  >
                    <IconChevronLeft size={13} />
                    <span>上一篇</span>
                  </button>
                  <span className="pager-pos">
                    {activeIdx + 1} / {filtered.length}
                  </span>
                  <button
                    type="button"
                    className="pager-btn"
                    disabled={activeIdx >= filtered.length - 1}
                    onClick={() =>
                      activeIdx < filtered.length - 1 && setSelectedId(filtered[activeIdx + 1].id)
                    }
                  >
                    <span>下一篇</span>
                    <IconChevronRight size={13} />
                  </button>
                </div>
              )}
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
