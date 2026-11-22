import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { marked } from "marked";
import {
  IconBold,
  IconCode,
  IconCollapse,
  IconExpand,
  IconHr,
  IconItalic,
  IconListBullet,
  IconListOrdered,
  IconListTodo,
  IconQuote,
  IconRedo,
  IconStrike,
  IconUnderline,
  IconUndo,
} from "./Icons";

export type NoteEditorMode = "markdown" | "rich";

const MODE_STORAGE_KEY = "offerline.noteEditorMode.v2";

export function loadSavedEditorMode(): NoteEditorMode {
  try {
    const v = localStorage.getItem(MODE_STORAGE_KEY);
    return v === "rich" ? "rich" : "markdown";
  } catch {
    return "markdown";
  }
}

export function saveEditorMode(mode: NoteEditorMode) {
  try {
    localStorage.setItem(MODE_STORAGE_KEY, mode);
  } catch {
    // ignore storage errors
  }
}

/* ==================== Lossless Markdown <-> Tiptap HTML ==================== */
function escapeHtmlExceptUnderline(md: string): string {
  // Keep <u>...</u> safely while neutralizing raw HTML tags for XSS safety
  const placeholderOpen = "__OL_U_OPEN__";
  const placeholderClose = "__OL_U_CLOSE__";
  const safe = md
    .replace(/<u>/gi, placeholderOpen)
    .replace(/<\/u>/gi, placeholderClose)
    .replace(/<(\/?[a-z][^>]*)>/gi, "&lt;$1&gt;")
    .replaceAll(placeholderOpen, "<u>")
    .replaceAll(placeholderClose, "</u>");
  return safe;
}

export function markdownToHtml(md: string): string {
  const trimmed = md.trim();
  if (!trimmed) return "";
  const rawHtml = marked.parse(escapeHtmlExceptUnderline(md), {
    gfm: true,
    breaks: true,
    async: false,
  }) as string;

  // Convert GFM checkbox lists into Tiptap TaskList / TaskItem structure
  const container = document.createElement("div");
  container.innerHTML = rawHtml;

  const uls = [...container.querySelectorAll("ul")];
  for (const ul of uls) {
    const directLis = [...ul.children].filter((el) => el.tagName === "LI");
    const hasTask = directLis.some((li) =>
      Boolean(li.querySelector(':scope > input[type="checkbox"], :scope > p > input[type="checkbox"]')),
    );
    if (!hasTask) continue;
    ul.setAttribute("data-type", "taskList");
    for (const li of directLis) {
      const cb = li.querySelector<HTMLInputElement>(
        ':scope > input[type="checkbox"], :scope > p > input[type="checkbox"]',
      );
      if (!cb) continue;
      li.setAttribute("data-type", "taskItem");
      li.setAttribute("data-checked", cb.checked || cb.hasAttribute("checked") ? "true" : "false");
      cb.remove();
    }
  }
  return container.innerHTML;
}

function serializeInline(nodes?: JSONContent[]): string {
  if (!nodes?.length) return "";
  return nodes
    .map((node) => {
      if (node.type === "hardBreak") return "\n";
      if (node.type !== "text") return "";
      let text = node.text || "";
      const marks = node.marks || [];
      const hasCode = marks.some((m) => m.type === "code");
      if (hasCode) {
        const delim = text.includes("`") ? "``" : "`";
        return `${delim}${text}${delim}`;
      }
      for (const m of marks) {
        if (m.type === "bold") text = `**${text}**`;
        else if (m.type === "italic") text = `*${text}*`;
        else if (m.type === "strike") text = `~~${text}~~`;
        else if (m.type === "underline") text = `<u>${text}</u>`;
      }
      return text;
    })
    .join("");
}

function serializeBlocks(nodes?: JSONContent[], indent = ""): string {
  if (!nodes?.length) return "";
  const parts: string[] = [];

  for (const node of nodes) {
    if (node.type === "paragraph") {
      const text = serializeInline(node.content);
      parts.push(text ? text.split("\n").map((l) => `${indent}${l}`).join("\n") : "");
    } else if (node.type === "heading") {
      const lvl = Math.min(6, Math.max(1, Number(node.attrs?.level || 2)));
      parts.push(`${indent}${"#".repeat(lvl)} ${serializeInline(node.content)}`);
    } else if (node.type === "bulletList") {
      const lines = (node.content || []).map((li) => {
        const children = li.content || [];
        const first = children[0];
        const rest = children.slice(1);
        const head =
          first?.type === "paragraph"
            ? serializeInline(first.content)
            : serializeBlocks(first ? [first] : [], "").trim();
        const nested = rest.length ? "\n" + serializeBlocks(rest, indent + "  ") : "";
        return `${indent}- ${head}${nested}`;
      });
      parts.push(lines.join("\n"));
    } else if (node.type === "orderedList") {
      const start = Number(node.attrs?.start || 1);
      const lines = (node.content || []).map((li, idx) => {
        const children = li.content || [];
        const first = children[0];
        const rest = children.slice(1);
        const head =
          first?.type === "paragraph"
            ? serializeInline(first.content)
            : serializeBlocks(first ? [first] : [], "").trim();
        const nested = rest.length ? "\n" + serializeBlocks(rest, indent + "   ") : "";
        return `${indent}${start + idx}. ${head}${nested}`;
      });
      parts.push(lines.join("\n"));
    } else if (node.type === "taskList") {
      const lines = (node.content || []).map((li) => {
        const checked = Boolean(li.attrs?.checked);
        const children = li.content || [];
        const first = children[0];
        const rest = children.slice(1);
        const head =
          first?.type === "paragraph"
            ? serializeInline(first.content)
            : serializeBlocks(first ? [first] : [], "").trim();
        const nested = rest.length ? "\n" + serializeBlocks(rest, indent + "  ") : "";
        return `${indent}- [${checked ? "x" : " "}] ${head}${nested}`;
      });
      parts.push(lines.join("\n"));
    } else if (node.type === "blockquote") {
      const inner = serializeBlocks(node.content, "");
      const quoted = inner
        .split("\n")
        .map((l) => `${indent}> ${l}`)
        .join("\n");
      parts.push(quoted);
    } else if (node.type === "codeBlock") {
      const lang = typeof node.attrs?.language === "string" ? node.attrs.language : "";
      const code = (node.content || []).map((c) => c.text || "").join("");
      parts.push(`${indent}\`\`\`${lang}\n${code}\n${indent}\`\`\``);
    } else if (node.type === "horizontalRule") {
      parts.push(`${indent}---`);
    }
  }

  return parts.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function tiptapJsonToMarkdown(doc: JSONContent): string {
  return serializeBlocks(doc.content);
}

/** Strip Markdown syntax cleanly for compact sidebar excerpt previews */
export function stripMarkdownForPreview(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " [代码块] ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^[-*]\s+\[[ xX]\]\s+/gm, "")
    .replace(/[*_~`]/g, "")
    .replace(/<\/?u>/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* ==================== Dual-Mode NoteEditor Component ==================== */
export function NoteEditor({
  docKey,
  value,
  mode,
  compact = false,
  allowExpand = true,
  expandTitle,
  expandBadge,
  placeholder = "记录问到的项目深挖、底层原理、算法手撕或复盘要点…",
  onChange,
  onModeChange,
  onSaveShortcut,
}: {
  docKey: string;
  value: string;
  mode: NoteEditorMode;
  compact?: boolean;
  allowExpand?: boolean;
  expandTitle?: string;
  expandBadge?: string;
  placeholder?: string;
  onChange: (nextMarkdown: string) => void;
  onModeChange?: (nextMode: NoteEditorMode) => void;
  onSaveShortcut?: () => void;
}) {
  const [mdView, setMdView] = useState<"wysiwyg" | "source">("wysiwyg");
  const [expanded, setExpanded] = useState(false);
  const [, setSelectionTick] = useState(0);
  const lastEmittedRef = useRef<string>(value);
  const sourceRef = useRef<HTMLTextAreaElement>(null);
  const saveRef = useRef(onSaveShortcut);
  saveRef.current = onSaveShortcut;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({
        placeholder:
          mode === "markdown"
            ? "支持所见即所得 Markdown：输入 # 标题、- 列表、[ ] 待办、**粗体** 或 `代码` 即时渲染…"
            : placeholder,
      }),
    ],
    content: markdownToHtml(value),
    editorProps: {
      attributes: {
        class: "ol-prose-editor",
        spellcheck: "false",
      },
      handleKeyDown: (_view, event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
          event.preventDefault();
          saveRef.current?.();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: ed }) => {
      const md = tiptapJsonToMarkdown(ed.getJSON());
      lastEmittedRef.current = md;
      onChange(md);
      setSelectionTick((n) => n + 1);
    },
    onSelectionUpdate: () => {
      setSelectionTick((n) => n + 1);
    },
  });

  // Sync external doc change (switching note or editing raw markdown source)
  useEffect(() => {
    if (!editor) return;
    if (value === lastEmittedRef.current) return;
    lastEmittedRef.current = value;
    editor.commands.setContent(markdownToHtml(value), { emitUpdate: false });
  }, [editor, docKey, value]);

  // Reset source view when switching back to Word rich mode
  useEffect(() => {
    if (mode === "rich" && mdView === "source") {
      setMdView("wysiwyg");
      if (editor) {
        lastEmittedRef.current = value;
        editor.commands.setContent(markdownToHtml(value), { emitUpdate: false });
      }
    }
  }, [mode, mdView, editor, value]);

  // Capture Esc when expanded so parent modals stay open cleanly
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        setExpanded(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [expanded]);

  function toggleExpand(next: boolean) {
    setExpanded(next);
    requestAnimationFrame(() => {
      if (mode === "rich" || mdView === "wysiwyg") {
        editor?.commands.focus();
      }
    });
  }

  function toggleMdSource(nextView: "wysiwyg" | "source") {
    if (nextView === mdView) return;
    if (nextView === "wysiwyg" && editor) {
      lastEmittedRef.current = value;
      editor.commands.setContent(markdownToHtml(value), { emitUpdate: false });
    }
    setMdView(nextView);
  }

  function insertSourceMarkdown(prefix: string, suffix = "", fallbackText = "") {
    const ta = sourceRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = value.slice(start, end) || fallbackText;
    const next = value.slice(0, start) + prefix + selected + suffix + value.slice(end);
    lastEmittedRef.current = next;
    onChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      const selStart = start + prefix.length;
      ta.setSelectionRange(selStart, selStart + selected.length);
    });
  }

  function applyMdAction(kind: "heading" | "bold" | "code" | "bullet" | "todo" | "quote") {
    if (mdView === "source") {
      if (kind === "heading") insertSourceMarkdown("## ", "", "标题");
      else if (kind === "bold") insertSourceMarkdown("**", "**", "加粗文字");
      else if (kind === "code") insertSourceMarkdown("`", "`", "code");
      else if (kind === "bullet") insertSourceMarkdown("- ", "", "列表项");
      else if (kind === "todo") insertSourceMarkdown("- [ ] ", "", "待复盘事项");
      else if (kind === "quote") insertSourceMarkdown("> ", "", "引用要点");
      return;
    }
    if (!editor) return;
    if (kind === "heading") editor.chain().focus().toggleHeading({ level: 2 }).run();
    else if (kind === "bold") editor.chain().focus().toggleBold().run();
    else if (kind === "code") editor.chain().focus().toggleCode().run();
    else if (kind === "bullet") editor.chain().focus().toggleBulletList().run();
    else if (kind === "todo") editor.chain().focus().toggleTaskList().run();
    else if (kind === "quote") editor.chain().focus().toggleBlockquote().run();
  }

  const wordCount = useMemo(
    () => stripMarkdownForPreview(value).replace(/\s+/g, "").length,
    [value],
  );

  const isCompactMode = compact && !expanded;

  const editorBody = (
    <div className={`note-editor-shell${isCompactMode ? " is-compact" : ""}${expanded ? " is-zen" : ""}`}>
      {/* 模式 A：Word 式富文本格式化工具栏 */}
      {mode === "rich" && editor && (
        <div className="rich-toolbar" role="toolbar" aria-label="富文本格式工具栏">
          <div className="rt-group">
            {([1, 2, 3] as const).map((lvl) => (
              <button
                key={lvl}
                type="button"
                className={`rt-btn rt-btn-text${editor.isActive("heading", { level: lvl }) ? " is-active" : ""}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => editor.chain().focus().toggleHeading({ level: lvl }).run()}
                data-tip={`${lvl} 级标题`}
              >
                H{lvl}
              </button>
            ))}
          </div>

          <span className="rt-sep" aria-hidden="true" />

          <div className="rt-group">
            <button
              type="button"
              className={`rt-btn${editor.isActive("bold") ? " is-active" : ""}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().toggleBold().run()}
              data-tip="加粗 (Ctrl+B)"
              aria-label="加粗"
            >
              <IconBold size={15} />
            </button>
            <button
              type="button"
              className={`rt-btn${editor.isActive("italic") ? " is-active" : ""}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().toggleItalic().run()}
              data-tip="斜体 (Ctrl+I)"
              aria-label="斜体"
            >
              <IconItalic size={15} />
            </button>
            <button
              type="button"
              className={`rt-btn${editor.isActive("underline") ? " is-active" : ""}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().toggleUnderline().run()}
              data-tip="下划线 (Ctrl+U)"
              aria-label="下划线"
            >
              <IconUnderline size={15} />
            </button>
            <button
              type="button"
              className={`rt-btn${editor.isActive("strike") ? " is-active" : ""}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().toggleStrike().run()}
              data-tip="删除线"
              aria-label="删除线"
            >
              <IconStrike size={15} />
            </button>
            <button
              type="button"
              className={`rt-btn${editor.isActive("code") ? " is-active" : ""}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().toggleCode().run()}
              data-tip="行内代码"
              aria-label="行内代码"
            >
              <IconCode size={15} />
            </button>
          </div>

          <span className="rt-sep" aria-hidden="true" />

          <div className="rt-group">
            <button
              type="button"
              className={`rt-btn${editor.isActive("bulletList") ? " is-active" : ""}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              data-tip="无序列表"
              aria-label="无序列表"
            >
              <IconListBullet size={15} />
            </button>
            <button
              type="button"
              className={`rt-btn${editor.isActive("orderedList") ? " is-active" : ""}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              data-tip="有序列表"
              aria-label="有序列表"
            >
              <IconListOrdered size={15} />
            </button>
            <button
              type="button"
              className={`rt-btn${editor.isActive("taskList") ? " is-active" : ""}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().toggleTaskList().run()}
              data-tip="待办复盘清单"
              aria-label="待办清单"
            >
              <IconListTodo size={15} />
            </button>
            <button
              type="button"
              className={`rt-btn${editor.isActive("blockquote") ? " is-active" : ""}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
              data-tip="引用块"
              aria-label="引用块"
            >
              <IconQuote size={15} />
            </button>
            <button
              type="button"
              className={`rt-btn rt-btn-text${editor.isActive("codeBlock") ? " is-active" : ""}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().toggleCodeBlock().run()}
              data-tip="代码块"
            >
              代码块
            </button>
            <button
              type="button"
              className="rt-btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().setHorizontalRule().run()}
              data-tip="插入分割线"
              aria-label="分割线"
            >
              <IconHr size={15} />
            </button>
          </div>

          <span className="rt-sep" aria-hidden="true" />

          <div className="rt-group">
            <button
              type="button"
              className="rt-btn"
              disabled={!editor.can().undo()}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().undo().run()}
              data-tip="撤销 (Ctrl+Z)"
              aria-label="撤销"
            >
              <IconUndo size={15} />
            </button>
            <button
              type="button"
              className="rt-btn"
              disabled={!editor.can().redo()}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().redo().run()}
              data-tip="重做 (Ctrl+Y)"
              aria-label="重做"
            >
              <IconRedo size={15} />
            </button>
          </div>

          {allowExpand && !expanded && (
            <button
              type="button"
              className="editor-expand-btn"
              onClick={() => toggleExpand(true)}
              data-tip="全屏放大撰写"
              aria-label="全屏放大撰写"
            >
              <IconExpand size={14} />
              <span>放大</span>
            </button>
          )}
        </div>
      )}

      {/* 模式 B：Typora 式所见即所得 Markdown 精简快捷命令条与源码切换 */}
      {mode === "markdown" && (
        <div className="md-mode-bar">
          <div className="md-quick-bar" role="toolbar" aria-label="Markdown 快捷语法">
            {(
              [
                { key: "heading", token: "#", label: "标题", active: mdView === "wysiwyg" && Boolean(editor?.isActive("heading")), tip: "输入 # 加空格快速创建标题" },
                { key: "bold", token: "**", label: "粗体", active: mdView === "wysiwyg" && Boolean(editor?.isActive("bold")), tip: "输入 **粗体** 或 Ctrl+B" },
                { key: "code", token: "`", label: "代码", active: mdView === "wysiwyg" && Boolean(editor?.isActive("code")), tip: "输入 `行内代码`" },
                { key: "bullet", token: "-", label: "列表", active: mdView === "wysiwyg" && Boolean(editor?.isActive("bulletList")), tip: "输入 - 加空格创建列表" },
                { key: "todo", token: "[]", label: "待办", active: mdView === "wysiwyg" && Boolean(editor?.isActive("taskList")), tip: "输入 [ ] 加空格创建复盘待办" },
                { key: "quote", token: ">", label: "引用", active: mdView === "wysiwyg" && Boolean(editor?.isActive("blockquote")), tip: "输入 > 加空格插入引用块" },
              ] as const
            ).map((item) => (
              <button
                key={item.key}
                type="button"
                className={`md-quick-btn${item.active ? " is-active" : ""}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyMdAction(item.key)}
                data-tip={item.tip}
              >
                <span className="md-quick-token" aria-hidden="true">{item.token}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </div>
          <div className="md-bar-right">
            <div className="md-sub-switch" role="group" aria-label="Markdown 视图">
              <button
                type="button"
                className={`md-sub-btn${mdView === "wysiwyg" ? " active" : ""}`}
                onClick={() => toggleMdSource("wysiwyg")}
              >
                所见即所得
              </button>
              <button
                type="button"
                className={`md-sub-btn${mdView === "source" ? " active" : ""}`}
                onClick={() => toggleMdSource("source")}
              >
                源码
              </button>
            </div>

            {allowExpand && !expanded && (
              <button
                type="button"
                className="editor-expand-btn"
                onClick={() => toggleExpand(true)}
                data-tip="全屏放大撰写"
                aria-label="全屏放大撰写"
              >
                <IconExpand size={14} />
                <span>放大</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* 文档内容区 */}
      {mode === "markdown" && mdView === "source" ? (
        <textarea
          ref={sourceRef}
          className={`md-source-textarea${isCompactMode ? " is-compact" : ""}`}
          value={value}
          placeholder="直接编写或粘贴标准 Markdown…"
          onChange={(e) => {
            lastEmittedRef.current = e.target.value;
            onChange(e.target.value);
          }}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
              e.preventDefault();
              saveRef.current?.();
            }
          }}
        />
      ) : (
        <div className={`note-editor-surface${isCompactMode ? " is-compact" : ""}`}>
          <EditorContent editor={editor} />
        </div>
      )}
    </div>
  );

  if (!expanded) {
    return editorBody;
  }

  return (
    <>
      <div className="editor-zen-placeholder">
        <span>正在全屏沉浸撰写中</span>
        <button type="button" className="btn btn-soft btn-sm" onClick={() => toggleExpand(false)}>
          <IconCollapse size={13} />
          <span>回到小窗</span>
        </button>
      </div>
      {createPortal(
        <div className="zen-editor-backdrop" role="dialog" aria-modal="true" aria-label="全屏面经编辑">
          <div className="zen-editor-sheet">
            <header className="zen-editor-head">
              <div className="zen-editor-ident">
                <span className="zen-editor-title">{expandTitle || "面经复盘撰写"}</span>
                {expandBadge && <span className="note-stage">{expandBadge}</span>}
                <span className="zen-word-count">{wordCount} 字</span>
              </div>
              <div className="zen-editor-actions">
                {onModeChange && (
                  <div className="editor-mode-switch" role="tablist" aria-label="编辑器模式">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={mode === "markdown"}
                      className={`editor-mode-btn${mode === "markdown" ? " active" : ""}`}
                      onClick={() => onModeChange("markdown")}
                    >
                      Markdown
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={mode === "rich"}
                      className={`editor-mode-btn${mode === "rich" ? " active" : ""}`}
                      onClick={() => onModeChange("rich")}
                    >
                      富文本
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => toggleExpand(false)}
                  data-tip="收起全屏并保留内容 (Esc)"
                >
                  <IconCollapse size={14} />
                  <span>完成收起</span>
                </button>
              </div>
            </header>
            <div className="zen-editor-body">{editorBody}</div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
