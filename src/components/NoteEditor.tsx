import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EditorContent, useEditor, type Editor, type JSONContent } from "@tiptap/react";
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

interface SlashCommandItem {
  id: string;
  label: string;
  desc: string;
  hint: string;
  keywords: string[];
  glyph: "h1" | "h2" | "h3" | "bullet" | "ordered" | "todo" | "codeblock" | "quote" | "hr" | "qa";
  run: (ed: Editor, range: { from: number; to: number }) => void;
}

const SLASH_COMMANDS: SlashCommandItem[] = [
  {
    id: "h1",
    label: "一级标题",
    desc: "章节大标题",
    hint: "#",
    keywords: ["h1", "heading", "title", "标题", "大标题", "bt", "dbt"],
    glyph: "h1",
    run: (ed, range) => ed.chain().focus().deleteRange(range).setHeading({ level: 1 }).run(),
  },
  {
    id: "h2",
    label: "二级标题",
    desc: "常用分节标题",
    hint: "##",
    keywords: ["h2", "heading", "小标题", "标题", "xbt", "bt"],
    glyph: "h2",
    run: (ed, range) => ed.chain().focus().deleteRange(range).setHeading({ level: 2 }).run(),
  },
  {
    id: "h3",
    label: "三级标题",
    desc: "问题或要点标题",
    hint: "###",
    keywords: ["h3", "heading", "子标题", "标题", "zbt", "bt"],
    glyph: "h3",
    run: (ed, range) => ed.chain().focus().deleteRange(range).setHeading({ level: 3 }).run(),
  },
  {
    id: "bullet",
    label: "无序列表",
    desc: "逐条梳理要点",
    hint: "-",
    keywords: ["ul", "list", "bullet", "列表", "无序", "lb", "wx"],
    glyph: "bullet",
    run: (ed, range) => ed.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    id: "ordered",
    label: "有序列表",
    desc: "按提问顺序编号",
    hint: "1.",
    keywords: ["ol", "ordered", "num", "有序", "编号", "列表", "yx", "bh"],
    glyph: "ordered",
    run: (ed, range) => ed.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    id: "todo",
    label: "待办清单",
    desc: "记录待补短板与复盘项",
    hint: "[]",
    keywords: ["todo", "task", "check", "待办", "清单", "复盘", "db", "qd"],
    glyph: "todo",
    run: (ed, range) => ed.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    id: "codeblock",
    label: "代码块",
    desc: "记录算法手撕或 SQL",
    hint: "```",
    keywords: ["code", "codeblock", "snippet", "代码", "代码块", "算法", "手撕", "dm", "sf"],
    glyph: "codeblock",
    run: (ed, range) => ed.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    id: "quote",
    label: "引用块",
    desc: "摘录面试官原话或结论",
    hint: ">",
    keywords: ["quote", "blockquote", "引用", "重点", "yy", "zd"],
    glyph: "quote",
    run: (ed, range) => ed.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    id: "hr",
    label: "分割线",
    desc: "分隔不同考察环节",
    hint: "---",
    keywords: ["hr", "divider", "line", "分割线", "分隔", "fg", "fgx"],
    glyph: "hr",
    run: (ed, range) => ed.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
  {
    id: "qa",
    label: "面试题复盘块",
    desc: "插入题目 + 考察点 + 改进模板",
    hint: "模板",
    keywords: ["qa", "q", "question", "题目", "面试题", "复盘", "模板", "tm", "mst", "fp"],
    glyph: "qa",
    run: (ed, range) =>
      ed
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent([
          { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "面试题目" }] },
          {
            type: "bulletList",
            content: [
              {
                type: "listItem",
                content: [{ type: "paragraph", content: [{ type: "text", text: "考察点：" }] }],
              },
              {
                type: "listItem",
                content: [{ type: "paragraph", content: [{ type: "text", text: "回答与改进：" }] }],
              },
            ],
          },
        ])
        .run(),
  },
];

function SlashGlyph({ glyph }: { glyph: SlashCommandItem["glyph"] }) {
  if (glyph === "h1") return <span className="slash-glyph-text">H1</span>;
  if (glyph === "h2") return <span className="slash-glyph-text">H2</span>;
  if (glyph === "h3") return <span className="slash-glyph-text">H3</span>;
  if (glyph === "qa") return <span className="slash-glyph-text">Q</span>;
  if (glyph === "bullet") return <IconListBullet size={15} />;
  if (glyph === "ordered") return <IconListOrdered size={15} />;
  if (glyph === "todo") return <IconListTodo size={15} />;
  if (glyph === "codeblock") return <IconCode size={15} />;
  if (glyph === "quote") return <IconQuote size={15} />;
  return <IconHr size={15} />;
}

interface SlashMenuState {
  query: string;
  from: number;
  to: number;
  left: number;
  top: number;
  placement: "bottom" | "top";
}

/* ==================== Unified NoteEditor Component ==================== */
export function NoteEditor({
  docKey,
  value,
  mode,
  compact = false,
  allowExpand = true,
  expandTitle,
  expandBadge,
  placeholder = "输入 / 唤起命令菜单，或直接写 Markdown（# 标题、- 列表、**加粗**）…",
  onChange,
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
  const [slashState, setSlashState] = useState<SlashMenuState | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);

  const lastEmittedRef = useRef<string>(value);
  const sourceRef = useRef<HTMLTextAreaElement>(null);
  const slashMenuRef = useRef<HTMLDivElement>(null);
  const dismissedFromRef = useRef<number | null>(null);
  const saveRef = useRef(onSaveShortcut);
  saveRef.current = onSaveShortcut;

  const filteredSlashItems = useMemo(() => {
    if (!slashState) return [];
    const q = slashState.query.trim().toLowerCase();
    if (!q) return SLASH_COMMANDS;
    return SLASH_COMMANDS.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.desc.toLowerCase().includes(q) ||
        item.keywords.some((kw) => kw.toLowerCase().includes(q)),
    );
  }, [slashState]);

  // Keep live refs so ProseMirror handleKeyDown never reads stale React closures
  const slashRef = useRef<SlashMenuState | null>(null);
  slashRef.current = slashState;
  const slashItemsRef = useRef<SlashCommandItem[]>([]);
  slashItemsRef.current = filteredSlashItems;
  const slashIdxRef = useRef(0);
  slashIdxRef.current = slashIndex;

  useEffect(() => {
    setSlashIndex(0);
  }, [slashState?.query, slashState?.from]);

  // Keep active slash item scrolled smoothly into view
  useEffect(() => {
    if (!slashState || !slashMenuRef.current) return;
    const activeEl = slashMenuRef.current.querySelector<HTMLElement>(".slash-item.is-active");
    activeEl?.scrollIntoView({ block: "nearest" });
  }, [slashIndex, slashState]);

  function updateSlashFromEditor(ed: Editor) {
    const sel = ed.state.selection;
    if (!sel.empty || ed.isActive("codeBlock")) {
      dismissedFromRef.current = null;
      setSlashState(null);
      return;
    }
    const { $from } = sel;
    const textBefore = $from.parent.textBetween(0, $from.parentOffset, "\n", "\0");
    // Only trigger at start of line or after whitespace (never inside URLs like https:// or Java/Go)
    const match = textBefore.match(/(?:^|\s)\/([^\s/]{0,20})$/);
    if (!match) {
      dismissedFromRef.current = null;
      setSlashState(null);
      return;
    }

    const query = match[1];
    const tokenLen = match[0].startsWith("/") ? match[0].length : match[0].length - 1;
    const from = $from.pos - tokenLen;
    const to = $from.pos;

    if (dismissedFromRef.current === from) {
      return;
    }

    try {
      const coords = ed.view.coordsAtPos(from);
      const menuW = 264;
      const menuEstH = 326;
      const spaceBelow = window.innerHeight - coords.bottom;
      const placement: "bottom" | "top" =
        spaceBelow < menuEstH && coords.top > menuEstH ? "top" : "bottom";
      const left = Math.max(12, Math.min(coords.left, window.innerWidth - menuW - 12));
      const top =
        placement === "bottom"
          ? coords.bottom + 6
          : Math.max(12, coords.top - menuEstH - 6);
      setSlashState({ query, from, to, left, top, placement });
    } catch {
      setSlashState(null);
    }
  }

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({
        placeholder,
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
        // Respect active Chinese IME composition
        if (event.isComposing || event.keyCode === 229) {
          return false;
        }
        const activeSlash = slashRef.current;
        if (activeSlash) {
          const items = slashItemsRef.current;
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            dismissedFromRef.current = activeSlash.from;
            setSlashState(null);
            return true;
          }
          if (items.length > 0) {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setSlashIndex((i) => (i + 1) % items.length);
              return true;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setSlashIndex((i) => (i - 1 + items.length) % items.length);
              return true;
            }
            if (event.key === "Enter" || event.key === "Tab") {
              event.preventDefault();
              const chosen = items[slashIdxRef.current] || items[0];
              if (chosen && editorRef.current) {
                chosen.run(editorRef.current, { from: activeSlash.from, to: activeSlash.to });
                setSlashState(null);
              }
              return true;
            }
          }
        }
        return false;
      },
    },
    onUpdate: ({ editor: ed }) => {
      const md = tiptapJsonToMarkdown(ed.getJSON());
      lastEmittedRef.current = md;
      onChange(md);
      setSelectionTick((n) => n + 1);
      updateSlashFromEditor(ed);
    },
    onSelectionUpdate: ({ editor: ed }) => {
      setSelectionTick((n) => n + 1);
      updateSlashFromEditor(ed);
    },
    onBlur: () => {
      // Allow menu item mousedown/click to fire cleanly before hiding
      setTimeout(() => {
        if (!slashMenuRef.current?.contains(document.activeElement)) {
          setSlashState(null);
        }
      }, 120);
    },
  });

  const editorRef = useRef<Editor | null>(null);
  editorRef.current = editor;

  // Sync external doc change (switching note or editing raw markdown source)
  useEffect(() => {
    if (!editor) return;
    if (value === lastEmittedRef.current) return;
    lastEmittedRef.current = value;
    setSlashState(null);
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

  // Capture Esc when expanded so parent modals stay open cleanly (yields to open slash menu first)
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (slashRef.current) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          dismissedFromRef.current = slashRef.current.from;
          setSlashState(null);
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        setExpanded(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [expanded]);

  function executeSlash(item: SlashCommandItem) {
    if (!editor || !slashState) return;
    item.run(editor, { from: slashState.from, to: slashState.to });
    setSlashState(null);
  }

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

  function applyAction(
    kind: "heading" | "bold" | "italic" | "code" | "bullet" | "ordered" | "todo" | "quote" | "hr",
  ) {
    if (mdView === "source") {
      if (kind === "heading") insertSourceMarkdown("## ", "", "标题");
      else if (kind === "bold") insertSourceMarkdown("**", "**", "加粗文字");
      else if (kind === "italic") insertSourceMarkdown("*", "*", "斜体文字");
      else if (kind === "code") insertSourceMarkdown("`", "`", "code");
      else if (kind === "bullet") insertSourceMarkdown("- ", "", "列表项");
      else if (kind === "ordered") insertSourceMarkdown("1. ", "", "列表项");
      else if (kind === "todo") insertSourceMarkdown("- [ ] ", "", "待复盘事项");
      else if (kind === "quote") insertSourceMarkdown("> ", "", "引用要点");
      else if (kind === "hr") insertSourceMarkdown("\n---\n", "", "");
      return;
    }
    if (!editor) return;
    if (kind === "heading") editor.chain().focus().toggleHeading({ level: 2 }).run();
    else if (kind === "bold") editor.chain().focus().toggleBold().run();
    else if (kind === "italic") editor.chain().focus().toggleItalic().run();
    else if (kind === "code") editor.chain().focus().toggleCode().run();
    else if (kind === "bullet") editor.chain().focus().toggleBulletList().run();
    else if (kind === "ordered") editor.chain().focus().toggleOrderedList().run();
    else if (kind === "todo") editor.chain().focus().toggleTaskList().run();
    else if (kind === "quote") editor.chain().focus().toggleBlockquote().run();
    else if (kind === "hr") editor.chain().focus().setHorizontalRule().run();
  }

  const wordCount = useMemo(
    () => stripMarkdownForPreview(value).replace(/\s+/g, "").length,
    [value],
  );

  const isCompactMode = compact && !expanded;
  const isWysiwyg = mdView === "wysiwyg";

  const editorBody = (
    <div className={`note-editor-shell${isCompactMode ? " is-compact" : ""}${expanded ? " is-zen" : ""}`}>
      {/* 单行极简编辑器工具栏：左侧纯图标动作，右侧仅「源码」切换与「放大」 */}
      <div className="md-mode-bar" role="toolbar" aria-label="文档格式工具栏">
        <div className="rt-group">
          <button
            type="button"
            className={`rt-btn rt-btn-text${isWysiwyg && editor?.isActive("heading") ? " is-active" : ""}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyAction("heading")}
            data-tip="标题"
            aria-label="标题"
          >
            H
          </button>
          <button
            type="button"
            className={`rt-btn${isWysiwyg && editor?.isActive("bold") ? " is-active" : ""}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyAction("bold")}
            data-tip="加粗 (Ctrl+B)"
            aria-label="加粗"
          >
            <IconBold size={15} />
          </button>
          <button
            type="button"
            className={`rt-btn${isWysiwyg && editor?.isActive("italic") ? " is-active" : ""}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyAction("italic")}
            data-tip="斜体 (Ctrl+I)"
            aria-label="斜体"
          >
            <IconItalic size={15} />
          </button>
          <button
            type="button"
            className={`rt-btn${isWysiwyg && editor?.isActive("code") ? " is-active" : ""}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyAction("code")}
            data-tip="行内代码"
            aria-label="行内代码"
          >
            <IconCode size={15} />
          </button>

          <span className="rt-sep" aria-hidden="true" />

          <button
            type="button"
            className={`rt-btn${isWysiwyg && editor?.isActive("bulletList") ? " is-active" : ""}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyAction("bullet")}
            data-tip="无序列表"
            aria-label="无序列表"
          >
            <IconListBullet size={15} />
          </button>
          <button
            type="button"
            className={`rt-btn${isWysiwyg && editor?.isActive("orderedList") ? " is-active" : ""}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyAction("ordered")}
            data-tip="有序列表"
            aria-label="有序列表"
          >
            <IconListOrdered size={15} />
          </button>
          <button
            type="button"
            className={`rt-btn${isWysiwyg && editor?.isActive("taskList") ? " is-active" : ""}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyAction("todo")}
            data-tip="待办清单"
            aria-label="待办清单"
          >
            <IconListTodo size={15} />
          </button>
          <button
            type="button"
            className={`rt-btn${isWysiwyg && editor?.isActive("blockquote") ? " is-active" : ""}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyAction("quote")}
            data-tip="引用块"
            aria-label="引用块"
          >
            <IconQuote size={15} />
          </button>
          <button
            type="button"
            className="rt-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyAction("hr")}
            data-tip="分割线"
            aria-label="分割线"
          >
            <IconHr size={15} />
          </button>
        </div>

        <div className="md-bar-right">
          <button
            type="button"
            className={`editor-source-toggle${mdView === "source" ? " is-active" : ""}`}
            onClick={() => toggleMdSource(mdView === "source" ? "wysiwyg" : "source")}
            data-tip={mdView === "source" ? "切回所见即所得" : "查看或粘贴原始 Markdown"}
          >
            {mdView === "source" ? "返回预览" : "MD 源码"}
          </button>

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

      {/* 文档内容区 */}
      {mdView === "source" ? (
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

      {mdView === "wysiwyg" &&
        slashState &&
        createPortal(
          <div
            ref={slashMenuRef}
            className={`slash-menu placement-${slashState.placement}`}
            style={{ left: `${slashState.left}px`, top: `${slashState.top}px` }}
            role="listbox"
            aria-label="插入内容块"
            onMouseDown={(e) => e.preventDefault()}
          >
            <div className="slash-menu-head">
              <span>插入内容块</span>
              {slashState.query && <span className="slash-menu-query">/{slashState.query}</span>}
            </div>
            <div className="slash-menu-list">
              {filteredSlashItems.length === 0 ? (
                <div className="slash-menu-empty">未找到匹配项，按 Esc 关闭</div>
              ) : (
                filteredSlashItems.map((item, idx) => (
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    aria-selected={idx === slashIndex}
                    className={`slash-item${idx === slashIndex ? " is-active" : ""}`}
                    onMouseEnter={() => setSlashIndex(idx)}
                    onClick={() => executeSlash(item)}
                  >
                    <span className="slash-item-ico" aria-hidden="true">
                      <SlashGlyph glyph={item.glyph} />
                    </span>
                    <span className="slash-item-body">
                      <span className="slash-item-label">{item.label}</span>
                      <span className="slash-item-desc">{item.desc}</span>
                    </span>
                    <span className="slash-item-hint">{item.hint}</span>
                  </button>
                ))
              )}
            </div>
            <div className="slash-menu-foot">
              <span>↑↓ 选择</span>
              <span>Enter 插入</span>
              <span>Esc 关闭</span>
            </div>
          </div>,
          document.body,
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
