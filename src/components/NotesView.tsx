import React, { useMemo, useState } from "react";
import type { InterviewNote, NoteFeeling } from "../../shared/types";
import { CompanyLogo } from "./CompanyLogo";
import { IconEdit, IconPlus, IconSearch, IconTrash } from "./Icons";

const FEELING_LABELS: Record<NoteFeeling, string> = {
  great: "发挥顺畅",
  normal: "正常发挥",
  hard: "难度偏高",
};

export function NotesView({
  notes,
  initialFilter,
  onClearInitialFilter,
  onAddNote,
  onEditNote,
  onDeleteNote,
}: {
  notes: InterviewNote[];
  initialFilter: string;
  onClearInitialFilter: () => void;
  onAddNote: () => void;
  onEditNote: (note: InterviewNote) => void;
  onDeleteNote: (note: InterviewNote) => void;
}) {
  const [query, setQuery] = useState(initialFilter);

  const effectiveQuery = initialFilter || query;

  const filtered = useMemo(() => {
    const q = effectiveQuery.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter(
      (n) =>
        n.company.toLowerCase().includes(q) ||
        n.position.toLowerCase().includes(q) ||
        n.stageName.toLowerCase().includes(q) ||
        n.content.toLowerCase().includes(q),
    );
  }, [notes, effectiveQuery]);

  return (
    <div className="page-container">
      <div className="toolbar">
        <div className="search-box">
          <IconSearch size={15} />
          <input
            type="search"
            className="search-input"
            placeholder="搜索公司、轮次或面经题目关键词…"
            value={effectiveQuery}
            onChange={(e) => {
              if (initialFilter) onClearInitialFilter();
              setQuery(e.target.value);
            }}
          />
        </div>

        <div className="toolbar-actions">
          {effectiveQuery && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                onClearInitialFilter();
                setQuery("");
              }}
            >
              清空筛选
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={onAddNote}>
            <IconPlus size={14} />
            <span>记一篇面经</span>
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-panel">
          <p className="empty-title">
            {notes.length === 0 ? "还没有面经记录" : "没有找到匹配的面经"}
          </p>
          <p className="empty-desc">
            {notes.length === 0
              ? "每场面试结束后随手记下问到的题目与复盘，后续复盘或二三面之前随时翻看。"
              : "换个关键词试试，或清空筛选查看全部面经。"}
          </p>
          {notes.length === 0 && (
            <button type="button" className="btn btn-primary" onClick={onAddNote}>
              <IconPlus size={14} />
              <span>写第一篇面经</span>
            </button>
          )}
        </div>
      ) : (
        <div className="notes-list">
          {filtered.map((note) => (
            <article
              key={note.id}
              className="note-card"
              onClick={() => onEditNote(note)}
            >
              <div className="note-card-head">
                <div className="note-card-ident">
                  <CompanyLogo company={note.company} size="md" />
                  <div>
                    <div className="note-card-title">
                      <span className="note-company">{note.company}</span>
                      {note.position && <span className="note-pos">{note.position}</span>}
                      <span className="note-stage">{note.stageName}</span>
                    </div>
                    <div className="note-card-meta">
                      <span>{note.interviewedAt || note.createdAt.slice(0, 10)}</span>
                      <span className={`note-feeling feel-${note.feeling}`}>
                        {FEELING_LABELS[note.feeling]}
                      </span>
                    </div>
                  </div>
                </div>

                <div
                  className="note-card-ops"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    className="row-icon-btn"
                    onClick={() => onEditNote(note)}
                    title="编辑面经"
                    aria-label="编辑面经"
                  >
                    <IconEdit size={14} />
                  </button>
                  <button
                    type="button"
                    className="row-icon-btn danger"
                    onClick={() => onDeleteNote(note)}
                    title="删除面经"
                    aria-label="删除面经"
                  >
                    <IconTrash size={14} />
                  </button>
                </div>
              </div>

              <div className="note-card-body">{note.content}</div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
