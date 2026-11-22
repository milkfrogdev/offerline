import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  createDefaultStageDrafts,
  createStageDraftsFromNames,
  inferStageType,
  STAGE_STATUS_LABELS,
  STAGE_TEMPLATES,
} from "../../shared/stages";
import {
  EVENT_KINDS,
  type ApplicationRecord,
  type EmailParseResult,
  type EventKind,
  type InterviewNote,
  type MailAccountPublic,
  type MailProvider,
  type NoteFeeling,
  type ScheduleEvent,
  type StageDraft,
} from "../../shared/types";
import { api } from "../api";
import { canUseWebCrypto, decryptJson, encryptJson } from "../crypto";
import { CompanyLogo, suggestCompanies } from "./CompanyLogo";
import { loadSavedEditorMode, NoteEditor, saveEditorMode, type NoteEditorMode } from "./NoteEditor";
import {
  IconArrowDown,
  IconArrowUp,
  IconCheck,
  IconChevron,
  IconClose,
  IconCopy,
  IconExternal,
  IconGrip,
  IconPlus,
  IconRefresh,
  IconSpark,
  IconTrash,
} from "./Icons";

const PROVIDER_ORDER: MailProvider[] = ["qq", "163", "126", "gmail", "outlook", "exmail", "custom"];

const PROVIDER_PRESETS: Record<
  MailProvider,
  {
    label: string;
    host: string;
    port: number;
    secure: boolean;
    placeholder: string;
    authPlaceholder: string;
    guideUrl?: string;
    guideLabel?: string;
    tip: string;
  }
> = {
  qq: {
    label: "QQ 邮箱",
    host: "imap.qq.com",
    port: 993,
    secure: true,
    placeholder: "例如：123456@qq.com",
    authPlaceholder: "粘贴 QQ 邮箱 16 位 IMAP 授权码",
    guideUrl: "https://mail.qq.com",
    guideLabel: "前往 QQ 邮箱",
    tip: "进入 QQ 邮箱网页端「设置 → 账户 → POP3/IMAP」，开启 IMAP 后复制 16 位授权码即可。",
  },
  "163": {
    label: "网易 163",
    host: "imap.163.com",
    port: 993,
    secure: true,
    placeholder: "例如：name@163.com",
    authPlaceholder: "粘贴网易邮箱客户端授权密码",
    guideUrl: "https://mail.163.com",
    guideLabel: "前往 163 邮箱",
    tip: "在网易邮箱「设置 → POP3/SMTP/IMAP」开启 IMAP 并生成客户端授权密码。",
  },
  "126": {
    label: "网易 126",
    host: "imap.126.com",
    port: 993,
    secure: true,
    placeholder: "例如：name@126.com",
    authPlaceholder: "粘贴 126 邮箱客户端授权密码",
    guideUrl: "https://mail.126.com",
    guideLabel: "前往 126 邮箱",
    tip: "在 126 邮箱「设置 → POP3/SMTP/IMAP」开启 IMAP 并生成授权密码。",
  },
  gmail: {
    label: "Gmail",
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    placeholder: "例如：name@gmail.com",
    authPlaceholder: "粘贴 Google 16 位应用专用密码",
    guideUrl: "https://myaccount.google.com/apppasswords",
    guideLabel: "创建应用密码",
    tip: "开启 Google 两步验证后，创建 16 位应用专用密码（App Password）粘贴到下方。",
  },
  outlook: {
    label: "Outlook",
    host: "outlook.office365.com",
    port: 993,
    secure: true,
    placeholder: "例如：name@outlook.com",
    authPlaceholder: "粘贴邮箱密码或应用密码",
    guideUrl: "https://outlook.live.com",
    guideLabel: "前往 Outlook",
    tip: "已自动预填 Outlook IMAP 993 加密端口，填入邮箱与密码即可接入。",
  },
  exmail: {
    label: "腾讯企业邮",
    host: "imap.exmail.qq.com",
    port: 993,
    secure: true,
    placeholder: "例如：name@company.com",
    authPlaceholder: "粘贴企业邮箱客户端专用密码",
    guideUrl: "https://exmail.qq.com",
    guideLabel: "前往企业邮",
    tip: "在企业邮「设置 → 微信绑定/安全设置」生成客户端专用密码后填入。",
  },
  custom: {
    label: "自定义 IMAP",
    host: "",
    port: 993,
    secure: true,
    placeholder: "例如：name@domain.com",
    authPlaceholder: "填入邮箱密码或授权码",
    tip: "支持任意标准 IMAP 邮箱，请在下方补全服务器地址与端口。",
  },
};

function detectProviderFromEmail(addr: string): MailProvider | null {
  const m = addr.trim().toLowerCase().match(/@([^@\s]+)$/);
  if (!m) return null;
  const domain = m[1];
  if (domain === "qq.com" || domain === "foxmail.com") return "qq";
  if (domain === "163.com") return "163";
  if (domain === "126.com") return "126";
  if (domain === "gmail.com" || domain === "googlemail.com") return "gmail";
  if (domain === "outlook.com" || domain === "hotmail.com" || domain === "live.com") return "outlook";
  return null;
}

const SAMPLE_INTERVIEW_EMAIL = {
  subject: "【字节跳动】后端开发工程师二面面试邀请",
  from: "字节跳动招聘 <campus-noreply@bytedance.com>",
  text:
    "同学你好，恭喜通过一面！现邀请你参加字节跳动技术二面。\n" +
    "投递岗位：基础架构后端研发\n" +
    "面试时间：2026年11月25日 15:00-16:00\n" +
    "飞书视频会议链接：https://vc.feishu.cn/j/892104613\n" +
    "请提前 5 分钟进入会议室调试麦克风与摄像头。",
};

function ModalShell({
  title,
  onClose,
  wide = false,
  children,
}: {
  title: string;
  onClose: () => void;
  wide?: boolean;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`modal-panel${wide ? " modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-head">
          <h3 className="modal-title">{title}</h3>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭">
            <IconClose size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

/* ==================== 通用：带实时图标预览与联想的公司输入框（防 IME 抖动） ==================== */
function CompanyCombobox({
  value,
  url,
  existingCompanies,
  onChange,
  onPickExistingUrl,
  placeholder = "输入公司名或缩写，如 字节、腾讯、jd",
}: {
  value: string;
  url?: string;
  existingCompanies: { company: string; url?: string }[];
  onChange: (next: string) => void;
  onPickExistingUrl?: (url: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [searchQuery, setSearchQuery] = useState(value);
  const composingRef = useRef(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!composingRef.current) {
      setSearchQuery(value);
    }
  }, [value]);

  const suggestions = useMemo(
    () => suggestCompanies(searchQuery, existingCompanies),
    [searchQuery, existingCompanies],
  );

  useEffect(() => {
    setActiveIdx(0);
  }, [searchQuery]);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [open]);

  function pick(item: { name: string; url?: string }) {
    composingRef.current = false;
    onChange(item.name);
    setSearchQuery(item.name);
    if (item.url && onPickExistingUrl) {
      onPickExistingUrl(item.url);
    }
    setOpen(false);
  }

  const showDropdown = open && suggestions.length > 0;

  return (
    <div className="combo-wrap" ref={wrapRef}>
      <div className="combo-input-box">
        <span className="combo-logo-slot">
          <CompanyLogo company={searchQuery || "O"} url={url} size="sm" />
        </span>
        <input
          type="text"
          className="combo-input"
          placeholder={placeholder}
          value={value}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={(e) => {
            composingRef.current = false;
            setSearchQuery(e.currentTarget.value);
          }}
          onChange={(e) => {
            const next = e.target.value;
            onChange(next);
            if (!composingRef.current) {
              setSearchQuery(next);
            }
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (composingRef.current || !showDropdown) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActiveIdx((i) => (i + 1) % suggestions.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActiveIdx((i) => (i - 1 + suggestions.length) % suggestions.length);
            } else if (e.key === "Enter") {
              const exact = suggestions.find(
                (s) => s.name.toLowerCase() === value.trim().toLowerCase(),
              );
              if (!exact && suggestions[activeIdx]) {
                e.preventDefault();
                pick(suggestions[activeIdx]);
              }
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          required
        />
      </div>

      <div
        className={`combo-dropdown${showDropdown ? " is-open" : ""}`}
        role="listbox"
        aria-hidden={!showDropdown}
      >
        {suggestions.map((item, idx) => (
          <button
            key={`${item.existing ? "e" : "b"}-${item.name}`}
            type="button"
            role="option"
            tabIndex={showDropdown ? 0 : -1}
            aria-selected={idx === activeIdx}
            className={`combo-option${idx === activeIdx ? " active" : ""}`}
            onMouseDown={(e) => {
              e.preventDefault();
              pick(item);
            }}
            onMouseEnter={() => setActiveIdx(idx)}
          >
            <CompanyLogo company={item.name} url={item.url} size="sm" />
            <span className="combo-option-name">{item.name}</span>
            {item.existing && <span className="combo-option-tag">已投递</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ==================== 可精准拖拽的单个阶段行 ==================== */
function SortableStageRow({
  stage,
  index,
  total,
  showStatus,
  onRename,
  onMove,
  onRemove,
}: {
  stage: StageDraft & { id: string };
  index: number;
  total: number;
  showStatus: boolean;
  onRename: (name: string) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: stage.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const inferredType = inferStageType({ name: stage.name, type: stage.type });

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`vstage-row${isDragging ? " is-dragging" : ""}`}
    >
      <button
        type="button"
        className="vstage-grip"
        data-tip="按住上下拖动调整顺序"
        aria-label={`拖动第 ${index + 1} 步`}
        {...attributes}
        {...listeners}
      >
        <IconGrip size={14} />
      </button>

      <span className="vstage-axis" aria-hidden="true">
        <span className={`vstage-num type-${inferredType}`}>{index + 1}</span>
      </span>

      <input
        type="text"
        className="vstage-input"
        value={stage.name}
        aria-label={`第 ${index + 1} 阶段名称`}
        onChange={(e) => onRename(e.target.value)}
        required
      />

      {showStatus && stage.status && stage.status !== "pending" && (
        <span className={`vstage-status st-${stage.status}`}>
          {STAGE_STATUS_LABELS[stage.status]}
        </span>
      )}

      <div className="vstage-ops">
        <button
          type="button"
          className="vstage-op-btn"
          disabled={index === 0}
          onClick={() => onMove(-1)}
          data-tip="上移"
          aria-label={`上移 ${stage.name}`}
        >
          <IconArrowUp size={13} />
        </button>
        <button
          type="button"
          className="vstage-op-btn"
          disabled={index === total - 1}
          onClick={() => onMove(1)}
          data-tip="下移"
          aria-label={`下移 ${stage.name}`}
        >
          <IconArrowDown size={13} />
        </button>
        <button
          type="button"
          className="vstage-op-btn danger"
          disabled={total <= 1}
          onClick={onRemove}
          data-tip="删除阶段"
          aria-label={`删除 ${stage.name}`}
        >
          <IconTrash size={13} />
        </button>
      </div>
    </li>
  );
}

/* ==================== 1. 新增 / 编辑投递 ==================== */
export function RecordModal({
  editing,
  presetCompany,
  presetUrl,
  existingCompanies,
  onClose,
  onSaved,
}: {
  editing: ApplicationRecord | null;
  presetCompany?: string;
  presetUrl?: string;
  existingCompanies: { company: string; url?: string }[];
  onClose: () => void;
  onSaved: (record: ApplicationRecord, isEdit: boolean) => void;
}) {
  const [company, setCompany] = useState(editing?.company || presetCompany || "");
  const [position, setPosition] = useState(editing?.position || "");
  const [url, setUrl] = useState(editing?.url || presetUrl || "");
  const [stages, setStages] = useState<(StageDraft & { id: string })[]>(() =>
    editing
      ? editing.stages.map((s, i) => ({
          id: s.id || `stage-${i + 1}`,
          name: s.name,
          type: s.type,
          status: s.status,
        }))
      : createDefaultStageDrafts().map((d, i) => ({ ...d, id: d.id || `default-${i + 1}` })),
  );
  const [customizingStages, setCustomizingStages] = useState(Boolean(editing));
  const [newStageName, setNewStageName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const activeTemplateId = useMemo(() => {
    const names = stages.map((s) => s.name.trim());
    return (
      STAGE_TEMPLATES.find(
        (t) => t.names.length === names.length && t.names.every((n, i) => n === names[i]),
      )?.id || null
    );
  }, [stages]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setStages((prev) => {
      const oldIndex = prev.findIndex((s) => s.id === active.id);
      const newIndex = prev.findIndex((s) => s.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  function moveStage(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= stages.length) return;
    setStages((prev) => arrayMove(prev, index, target));
  }

  function appendStage() {
    const trimmed = newStageName.trim();
    if (!trimmed) return;
    setStages((prev) => [
      ...prev,
      {
        id: `custom-${Date.now()}-${prev.length}`,
        name: trimmed,
        type: inferStageType({ name: trimmed }),
      },
    ]);
    setNewStageName("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const cleanedStages = stages.map((s, idx) => ({
      id: s.id || `stage-${idx + 1}`,
      name: s.name.trim(),
      type: inferStageType({ name: s.name }),
    }));
    if (cleanedStages.some((s) => !s.name)) {
      setError("阶段名称不能为空。");
      return;
    }
    setBusy(true);
    try {
      const saved = editing
        ? await api.updateRecord(editing.id, {
            company: company.trim(),
            position: position.trim(),
            url: url.trim() || null,
            stages: cleanedStages,
          })
        : await api.createRecord({
            company: company.trim(),
            position: position.trim(),
            url: url.trim() || undefined,
            stages: cleanedStages,
          });
      onSaved(saved, Boolean(editing));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败，请重试。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title={editing ? "编辑投递与流程" : "添加投递"} onClose={onClose} wide>
      <form className="modal-form" onSubmit={handleSubmit}>
        <div className="form-row-2">
          <div className="field">
            <span className="field-label">公司名称</span>
            <CompanyCombobox
              value={company}
              url={url}
              existingCompanies={existingCompanies}
              onChange={setCompany}
              onPickExistingUrl={(u) => {
                if (!url.trim()) setUrl(u);
              }}
            />
          </div>
          <label className="field">
            <span className="field-label">投递岗位</span>
            <input
              type="text"
              className="input"
              placeholder="例如：后端开发工程师"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              required
            />
          </label>
        </div>

        <label className="field">
          <span className="field-label">官网投递进度链接（推荐填写，便于跳转与匹配图标）</span>
          <input
            type="url"
            className="input"
            placeholder="https://jobs.example.com/..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </label>

        <div className="stage-editor-block">
          <div className="stage-editor-head">
            <div className="stage-head-left">
              <span className="field-label">面试流程（{stages.length} 步）</span>
              <div className="template-seg">
                {STAGE_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    className={`template-seg-btn${activeTemplateId === tpl.id ? " active" : ""}`}
                    onClick={() =>
                      setStages(
                        createStageDraftsFromNames(tpl.names).map((d, i) => ({
                          ...d,
                          id: `${tpl.id}-${i + 1}`,
                        })),
                      )
                    }
                  >
                    {tpl.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              className="btn-link muted"
              onClick={() => setCustomizingStages((v) => !v)}
            >
              {customizingStages ? "收起自定义" : "自定义顺序与阶段"}
            </button>
          </div>

          {!customizingStages ? (
            <div
              className="stage-preview-rail"
              onClick={() => setCustomizingStages(true)}
              data-tip="点击展开自定义阶段顺序与名称"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setCustomizingStages(true);
                }
              }}
            >
              {stages.map((st, idx) => (
                <React.Fragment key={st.id || idx}>
                  <span className="preview-step">
                    <span className={`preview-dot${idx === 0 ? " first" : ""}`} />
                    <span className="preview-name">{st.name}</span>
                  </span>
                  {idx < stages.length - 1 && <span className="preview-sep" aria-hidden="true" />}
                </React.Fragment>
              ))}
            </div>
          ) : (
            <div className="vstage-box">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                modifiers={[restrictToVerticalAxis, restrictToParentElement]}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={stages.map((s) => s.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <ol className="vstage-list">
                    {stages.map((st, idx) => (
                      <SortableStageRow
                        key={st.id}
                        stage={st}
                        index={idx}
                        total={stages.length}
                        showStatus={Boolean(editing)}
                        onRename={(val) =>
                          setStages((prev) =>
                            prev.map((item, i) =>
                              i === idx
                                ? { ...item, name: val, type: inferStageType({ name: val }) }
                                : item,
                            ),
                          )
                        }
                        onMove={(delta) => moveStage(idx, delta)}
                        onRemove={() => setStages((prev) => prev.filter((_, i) => i !== idx))}
                      />
                    ))}
                  </ol>
                </SortableContext>
              </DndContext>

              <div className="vstage-add-row">
                <IconPlus size={14} />
                <input
                  type="text"
                  className="vstage-add-input"
                  placeholder="输入新阶段名称，按回车添加…"
                  value={newStageName}
                  onChange={(e) => setNewStageName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      appendStage();
                    }
                  }}
                />
                <button
                  type="button"
                  className="vstage-add-btn"
                  disabled={!newStageName.trim()}
                  onClick={appendStage}
                >
                  添加
                </button>
              </div>
            </div>
          )}
        </div>

        {error && <div className="form-error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "保存中…" : editing ? "保存修改" : "确认添加"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

/* ==================== 2. 邮箱监听与粘贴解析 ==================== */
export function MailSettingsModal({
  config,
  initialTab = "imap",
  onClose,
  onConfigUpdated,
  onEventCreated,
}: {
  config: MailAccountPublic | null;
  initialTab?: "imap" | "parse";
  onClose: () => void;
  onConfigUpdated: (cfg: MailAccountPublic) => void;
  onEventCreated: (ev: ScheduleEvent) => void;
}) {
  const [tab, setTab] = useState<"imap" | "parse">(initialTab);
  const [enabled, setEnabled] = useState(config?.enabled ?? true);
  const [provider, setProvider] = useState<MailProvider>(config?.provider || "qq");
  const [host, setHost] = useState(config?.host || PROVIDER_PRESETS.qq.host);
  const [port, setPort] = useState(config?.port || 993);
  const [secure, setSecure] = useState(config?.secure ?? true);
  const [email, setEmail] = useState(config?.email || "");
  const [password, setPassword] = useState("");
  const [folder, setFolder] = useState(config?.folder || "INBOX");
  const [pollIntervalMin, setPollIntervalMin] = useState(config?.pollIntervalMin || 10);
  const [lookbackDays, setLookbackDays] = useState(config?.lookbackDays || 7);
  const [llmEnabled, setLlmEnabled] = useState(config?.llmEnabled ?? false);
  const [llmBaseUrl, setLlmBaseUrl] = useState(config?.llmBaseUrl || "");
  const [llmModel, setLlmModel] = useState(config?.llmModel || "");
  const [llmApiKey, setLlmApiKey] = useState("");

  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(provider === "custom" || Boolean(config?.llmEnabled));
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // 粘贴解析状态
  const [rawSubject, setRawSubject] = useState("");
  const [rawFrom, setRawFrom] = useState("");
  const [rawText, setRawText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState<EmailParseResult | null>(null);
  const [previewRecord, setPreviewRecord] = useState<{
    id: string;
    company: string;
    position: string;
    matchType: string;
  } | null>(null);

  function selectProvider(p: MailProvider) {
    setProvider(p);
    if (p !== "custom") {
      setHost(PROVIDER_PRESETS[p].host);
      setPort(PROVIDER_PRESETS[p].port);
      setSecure(PROVIDER_PRESETS[p].secure);
    } else {
      setAdvancedOpen(true);
    }
  }

  function handleEmailChange(nextEmail: string) {
    setEmail(nextEmail);
    const detected = detectProviderFromEmail(nextEmail);
    if (detected && detected !== provider) {
      setProvider(detected);
      setHost(PROVIDER_PRESETS[detected].host);
      setPort(PROVIDER_PRESETS[detected].port);
      setSecure(PROVIDER_PRESETS[detected].secure);
    }
  }

  async function handleTest() {
    setFeedback(null);
    setTesting(true);
    try {
      const res = await api.testMailConfig({
        host: host.trim(),
        port: Number(port) || 993,
        secure,
        email: email.trim(),
        password: password.trim() || undefined,
        folder: folder.trim() || "INBOX",
      });
      setFeedback({
        kind: "ok",
        text: `连接成功，当前收件箱共 ${res.totalMessages} 封邮件。`,
      });
    } catch (err) {
      setFeedback({
        kind: "err",
        text: err instanceof Error ? err.message : "连接测试失败。",
      });
    } finally {
      setTesting(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    setSaving(true);
    try {
      const saved = await api.saveMailConfig({
        enabled,
        provider,
        host: host.trim(),
        port: Number(port) || 993,
        secure,
        email: email.trim(),
        password: password.trim() || undefined,
        folder: folder.trim() || "INBOX",
        pollIntervalMin: Number(pollIntervalMin) || 10,
        lookbackDays: Number(lookbackDays) || 7,
        llmEnabled,
        llmBaseUrl: llmBaseUrl.trim(),
        llmModel: llmModel.trim(),
        llmApiKey: llmApiKey.trim() || undefined,
      });
      onConfigUpdated(saved);
      setPassword("");
      setLlmApiKey("");
      setFeedback({ kind: "ok", text: "邮箱监听配置已加密保存。" });
    } catch (err) {
      setFeedback({
        kind: "err",
        text: err instanceof Error ? err.message : "保存失败。",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handlePreviewParse(createEvent: boolean) {
    setFeedback(null);
    setParsing(true);
    try {
      const res = await api.parseEmailPreview({
        subject: rawSubject,
        from: rawFrom,
        text: rawText,
        createEvent,
      });
      setPreview(res.parsed);
      setPreviewRecord(res.matchedRecord || null);
      if (createEvent && res.event) {
        onEventCreated(res.event);
        setFeedback({
          kind: "ok",
          text: res.merged
            ? `检测到同场重复通知，已合并更新：${res.event.title}`
            : `已生成日程：${res.event.title}`,
        });
      } else if (!res.parsed.matched) {
        setFeedback({ kind: "err", text: res.parsed.reason || "未能从正文识别出求职日程。" });
      }
    } catch (err) {
      setFeedback({ kind: "err", text: err instanceof Error ? err.message : "解析失败。" });
    } finally {
      setParsing(false);
    }
  }

  return (
    <ModalShell title="邮箱监听与智能日程" onClose={onClose} wide>
      <div className="modal-tabs">
        <button
          type="button"
          className={`modal-tab${tab === "imap" ? " active" : ""}`}
          onClick={() => {
            setTab("imap");
            setFeedback(null);
          }}
        >
          IMAP 自动监听
        </button>
        <button
          type="button"
          className={`modal-tab${tab === "parse" ? " active" : ""}`}
          onClick={() => {
            setTab("parse");
            setFeedback(null);
          }}
        >
          粘贴邮件即时解析
        </button>
      </div>

      {tab === "imap" ? (
        <form className="modal-form" onSubmit={handleSave}>
          <div className="field">
            <span className="field-label">选择常用邮箱（输入邮箱地址也会自动识别预填）</span>
            <div className="provider-row">
              {PROVIDER_ORDER.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`provider-chip${provider === p ? " active" : ""}`}
                  onClick={() => selectProvider(p)}
                >
                  {PROVIDER_PRESETS[p].label}
                </button>
              ))}
            </div>
          </div>

          <div className="mail-tip-row">
            <span className="field-hint">{PROVIDER_PRESETS[provider].tip}</span>
            {PROVIDER_PRESETS[provider].guideUrl && (
              <a
                href={PROVIDER_PRESETS[provider].guideUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-link"
              >
                <span>{PROVIDER_PRESETS[provider].guideLabel}</span>
                <IconExternal size={12} />
              </a>
            )}
          </div>

          <div className="form-row-2">
            <label className="field">
              <span className="field-label">邮箱地址</span>
              <input
                type="email"
                className="input"
                placeholder={PROVIDER_PRESETS[provider].placeholder}
                value={email}
                onChange={(e) => handleEmailChange(e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span className="field-label">
                IMAP 授权码 {config?.hasPassword ? "（已加密保存，留空不改）" : ""}
              </span>
              <input
                type="password"
                className="input"
                placeholder={
                  config?.hasPassword
                    ? "已加密保存，如需更换请重新填写"
                    : PROVIDER_PRESETS[provider].authPlaceholder
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required={!config?.hasPassword}
              />
            </label>
          </div>

          {/* 极简细线高级参数摘要（无灰底块、无中圆点） */}
          <div className="mail-preset-row">
            <div className="mail-preset-specs">
              <span className="mail-spec-item">
                <span className="mail-spec-k">服务器</span>
                <span className="mail-spec-v">{host || "待填写"}:{port}</span>
              </span>
              <span className="mail-spec-item">
                <span className="mail-spec-k">频率</span>
                <span className="mail-spec-v">{pollIntervalMin} 分钟</span>
              </span>
              <span className="mail-spec-item">
                <span className="mail-spec-k">首次扫描</span>
                <span className="mail-spec-v">近 {lookbackDays} 天</span>
              </span>
            </div>
            <button
              type="button"
              className={`mail-adv-toggle${advancedOpen ? " is-open" : ""}`}
              onClick={() => setAdvancedOpen((v) => !v)}
              aria-expanded={advancedOpen}
            >
              <span>{advancedOpen ? "收起高级设置" : "高级设置"}</span>
              <IconChevron size={13} />
            </button>
          </div>

          {advancedOpen && (
            <div className="mail-adv-panel">
              <div className="form-row-3">
                <label className="field">
                  <span className="field-label">IMAP 服务器</span>
                  <input
                    type="text"
                    className="input"
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    required
                  />
                </label>
                <label className="field">
                  <span className="field-label">端口</span>
                  <input
                    type="number"
                    className="input"
                    value={port}
                    onChange={(e) => setPort(Number(e.target.value))}
                    required
                  />
                </label>
                <label className="field">
                  <span className="field-label">收件文件夹</span>
                  <input
                    type="text"
                    className="input"
                    placeholder="默认收件箱 INBOX"
                    value={folder}
                    onChange={(e) => setFolder(e.target.value)}
                  />
                </label>
              </div>

              <div className="form-row-2">
                <div className="field">
                  <span className="field-label">自动检查频率</span>
                  <div className="provider-row">
                    {[5, 10, 15, 30].map((min) => (
                      <button
                        key={min}
                        type="button"
                        className={`provider-chip${pollIntervalMin === min ? " active" : ""}`}
                        onClick={() => setPollIntervalMin(min)}
                      >
                        {min} 分钟
                      </button>
                    ))}
                  </div>
                </div>

                <div className="field">
                  <span className="field-label">历史邮件扫描范围</span>
                  <div className="provider-row">
                    {[3, 7, 14, 30].map((days) => (
                      <button
                        key={days}
                        type="button"
                        className={`provider-chip${lookbackDays === days ? " active" : ""}`}
                        onClick={() => setLookbackDays(days)}
                      >
                        近 {days} 天
                      </button>
                    ))}
                  </div>
                  <p className="field-micro-hint">仅首次连接邮箱时向前翻找这段时间的历史邀约邮件，之后只查新邮件。</p>
                </div>
              </div>

              <div className="switch-row">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => setEnabled(e.target.checked)}
                  />
                  <span>开启后台自动监听（发现新面试/笔试通知自动生成待确认日程）</span>
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={llmEnabled}
                    onChange={(e) => setLlmEnabled(e.target.checked)}
                  />
                  <span>可选：配置个人大模型 API 增强复杂邮件解析</span>
                </label>
              </div>

              {llmEnabled && (
                <div className="llm-box">
                  <div className="form-row-2">
                    <label className="field">
                      <span className="field-label">API Base URL（兼容 OpenAI）</span>
                      <input
                        type="url"
                        className="input"
                        placeholder="https://api.deepseek.com/v1"
                        value={llmBaseUrl}
                        onChange={(e) => setLlmBaseUrl(e.target.value)}
                      />
                    </label>
                    <label className="field">
                      <span className="field-label">模型名称</span>
                      <input
                        type="text"
                        className="input"
                        placeholder="deepseek-chat"
                        value={llmModel}
                        onChange={(e) => setLlmModel(e.target.value)}
                      />
                    </label>
                  </div>
                  <label className="field">
                    <span className="field-label">
                      API Key {config?.hasLlmKey ? "（已加密保存，留空不修改）" : ""}
                    </span>
                    <input
                      type="password"
                      className="input"
                      placeholder="sk-..."
                      value={llmApiKey}
                      onChange={(e) => setLlmApiKey(e.target.value)}
                    />
                  </label>
                </div>
              )}
            </div>
          )}

          <p className="security-note">
            授权码在服务端使用 AES-256-GCM 加密存储，界面永不回传明文。
          </p>

          {feedback && (
            <div className={feedback.kind === "ok" ? "form-ok" : "form-error"}>
              {feedback.text}
            </div>
          )}

          <div className="modal-actions between">
            <button
              type="button"
              className="btn btn-soft"
              disabled={testing || !email.trim()}
              onClick={() => void handleTest()}
            >
              {testing ? "测试连接中…" : "测试连接"}
            </button>
            <div className="modal-actions-right">
              <button type="button" className="btn btn-soft" onClick={onClose}>
                取消
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "保存中…" : "保存配置"}
              </button>
            </div>
          </div>
        </form>
      ) : (
        <div className="modal-form">
          <div className="field-head-inline">
            <p className="field-hint">
              未接入 IMAP 时，直接粘贴面试或笔试邮件原文，自动提取公司、时间与会议链接。
            </p>
            <button
              type="button"
              className="btn btn-soft btn-sm"
              onClick={() => {
                setRawSubject(SAMPLE_INTERVIEW_EMAIL.subject);
                setRawFrom(SAMPLE_INTERVIEW_EMAIL.from);
                setRawText(SAMPLE_INTERVIEW_EMAIL.text);
                setFeedback(null);
              }}
            >
              <IconSpark size={13} />
              <span>填入示例邮件</span>
            </button>
          </div>
          <div className="form-row-2">
            <label className="field">
              <span className="field-label">邮件主题</span>
              <input
                type="text"
                className="input"
                placeholder="例如：【字节跳动】后端开发工程师一面面试邀请"
                value={rawSubject}
                onChange={(e) => setRawSubject(e.target.value)}
              />
            </label>
            <label className="field">
              <span className="field-label">发件人（可选）</span>
              <input
                type="text"
                className="input"
                placeholder="例如：字节跳动招聘 <recruit@bytedance.com>"
                value={rawFrom}
                onChange={(e) => setRawFrom(e.target.value)}
              />
            </label>
          </div>
          <label className="field">
            <span className="field-label">邮件正文</span>
            <textarea
              className="textarea"
              rows={6}
              placeholder="粘贴邮件全文，含时间与腾讯会议 / 飞书会议 / 牛客笔试链接…"
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
            />
          </label>

          {preview && preview.matched && (
            <div className="parse-preview-box">
              <div className="parse-preview-title">解析结果（置信度 {preview.confidence}%）</div>
              <div className="parse-grid">
                <div>
                  <span className="parse-k">公司</span>
                  <span className="parse-v">{preview.company}</span>
                </div>
                <div>
                  <span className="parse-k">岗位</span>
                  <span className="parse-v">
                    {preview.position ||
                      (previewRecord ? `${previewRecord.position}（自动推断）` : "邮件未注明")}
                  </span>
                </div>
                <div>
                  <span className="parse-k">阶段</span>
                  <span className="parse-v">{preview.stageName}</span>
                </div>
                <div>
                  <span className="parse-k">时间</span>
                  <span className="parse-v">
                    {preview.timeMode === "flexible"
                      ? "时间自定，尽早完成"
                      : preview.timeMode === "deadline" && preview.startAt
                        ? `截止 ${new Date(preview.startAt).toLocaleDateString("zh-CN")}`
                        : preview.startAt
                          ? new Date(preview.startAt).toLocaleString("zh-CN")
                          : "未提取到具体时间"}
                  </span>
                </div>
                {previewRecord && (
                  <div className="parse-span-2">
                    <span className="parse-k">关联投递</span>
                    <span className="parse-v">
                      {previewRecord.company} {previewRecord.position}
                      {previewRecord.matchType === "company_sole_active"
                        ? "（同公司唯一进行中流程）"
                        : previewRecord.matchType === "group_sole_active"
                          ? "（同集团唯一进行中流程）"
                          : ""}
                    </span>
                  </div>
                )}
                {preview.location && (
                  <div className="parse-span-2">
                    <span className="parse-k">地点 / 链接</span>
                    <span className="parse-v">{preview.location}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {feedback && (
            <div className={feedback.kind === "ok" ? "form-ok" : "form-error"}>
              {feedback.text}
            </div>
          )}

          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={parsing || !rawText.trim()}
              onClick={() => void handlePreviewParse(false)}
            >
              {parsing ? "解析中…" : "试跑解析"}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={parsing || !rawText.trim()}
              onClick={() => void handlePreviewParse(true)}
            >
              解析并生成日程
            </button>
          </div>
        </div>
      )}
    </ModalShell>
  );
}

/* ==================== 3. 新建日程（支持一键关联已有投递） ==================== */
export function EventModal({
  preset,
  records,
  existingCompanies,
  onClose,
  onCreated,
}: {
  preset?: { recordId?: string; company?: string; position?: string; stageName?: string };
  records: ApplicationRecord[];
  existingCompanies: { company: string; url?: string }[];
  onClose: () => void;
  onCreated: (ev: ScheduleEvent) => void;
}) {
  const defaultStart = (() => {
    const d = new Date(Date.now() + 24 * 3600_000);
    d.setHours(14, 0, 0, 0);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
  })();

  const initialRecord = useMemo(() => {
    if (preset?.recordId) return records.find((r) => r.id === preset.recordId) || null;
    if (preset?.company) return records.find((r) => r.company === preset.company) || null;
    if (records.length > 0) return records[0];
    return null;
  }, [preset, records]);

  const [selectedRecordId, setSelectedRecordId] = useState<string>(initialRecord?.id || "");
  const [manualMode, setManualMode] = useState<boolean>(
    records.length === 0 || (!initialRecord && Boolean(preset?.company)),
  );
  const [company, setCompany] = useState(preset?.company || initialRecord?.company || "");
  const [position, setPosition] = useState(preset?.position || initialRecord?.position || "");
  const [stageName, setStageName] = useState(
    preset?.stageName || (initialRecord ? guessInterviewStage(initialRecord) : "一面"),
  );
  const [kind, setKind] = useState<EventKind>("interview");
  const [startLocal, setStartLocal] = useState(defaultStart);
  const [durationMin, setDurationMin] = useState(60);
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function pickRecord(rec: ApplicationRecord) {
    setSelectedRecordId(rec.id);
    setManualMode(false);
    setCompany(rec.company);
    setPosition(rec.position);
    setStageName(guessInterviewStage(rec));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!company.trim()) {
      setError("请选择已有投递或填写公司名称。");
      return;
    }
    const startMs = Date.parse(startLocal);
    if (Number.isNaN(startMs)) {
      setError("请选择有效的时间。");
      return;
    }
    const startAt = new Date(startMs).toISOString();
    const endAt = new Date(startMs + durationMin * 60_000).toISOString();
    const title = position.trim()
      ? `${company.trim()} ${position.trim()} ${stageName.trim()}`
      : `${company.trim()} ${stageName.trim()}`;

    setBusy(true);
    try {
      const created = await api.createEvent({
        recordId: manualMode ? undefined : selectedRecordId || preset?.recordId,
        company: company.trim(),
        position: position.trim() || undefined,
        stageName: stageName.trim() || undefined,
        title,
        kind,
        startAt,
        endAt,
        location: location.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      onCreated(created);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建日程失败。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title="新建面试 / 笔试日程" onClose={onClose} wide>
      <form className="modal-form" onSubmit={handleSubmit}>
        {records.length > 0 && (
          <div className="field">
            <div className="field-head-inline">
              <span className="field-label">关联已有投递（点击即填公司、岗位与当前轮次）</span>
              <button
                type="button"
                className="btn-link muted"
                onClick={() => {
                  const nextManual = !manualMode;
                  setManualMode(nextManual);
                  if (nextManual) {
                    setSelectedRecordId("");
                  } else if (records[0]) {
                    pickRecord(records[0]);
                  }
                }}
              >
                {manualMode ? "改从投递列表选择" : "手动填写其他公司"}
              </button>
            </div>

            {!manualMode && (
              <div className="record-picker-grid" role="listbox" aria-label="选择关联投递">
                {records.map((rec) => {
                  const active = selectedRecordId === rec.id;
                  const stageHint = guessInterviewStage(rec);
                  return (
                    <button
                      key={rec.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={`record-pick-chip${active ? " active" : ""}`}
                      onClick={() => pickRecord(rec)}
                    >
                      <CompanyLogo company={rec.company} url={rec.url} size="sm" />
                      <span className="record-pick-text">
                        <span className="record-pick-company">{rec.company}</span>
                        <span className="record-pick-pos">{rec.position}</span>
                      </span>
                      <span className="record-pick-stage">{stageHint}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {(manualMode || records.length === 0) && (
          <div className="form-row-2">
            <div className="field">
              <span className="field-label">公司</span>
              <CompanyCombobox
                value={company}
                existingCompanies={existingCompanies}
                onChange={setCompany}
                placeholder="输入公司名或缩写"
              />
            </div>
            <label className="field">
              <span className="field-label">岗位</span>
              <input
                type="text"
                className="input"
                value={position}
                onChange={(e) => setPosition(e.target.value)}
              />
            </label>
          </div>
        )}

        <div className="form-row-2">
          <div className="field">
            <span className="field-label">日程类型</span>
            <div className="provider-row">
              {EVENT_KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  className={`provider-chip${kind === k ? " active" : ""}`}
                  onClick={() => setKind(k)}
                >
                  {k === "interview"
                    ? "面试"
                    : k === "written_test"
                      ? "笔试"
                      : k === "assessment"
                        ? "测评"
                        : k === "offer"
                          ? "Offer 沟通"
                          : "其他跟进"}
                </button>
              ))}
            </div>
          </div>

          <label className="field">
            <span className="field-label">轮次 / 阶段</span>
            <input
              type="text"
              className="input"
              value={stageName}
              onChange={(e) => setStageName(e.target.value)}
            />
          </label>
        </div>

        <div className="form-row-2">
          <label className="field">
            <span className="field-label">开始时间</span>
            <input
              type="datetime-local"
              className="input"
              value={startLocal}
              onChange={(e) => setStartLocal(e.target.value)}
              required
            />
          </label>
          <div className="field">
            <span className="field-label">预计时长</span>
            <div className="provider-row">
              {[30, 45, 60, 90, 120].map((min) => (
                <button
                  key={min}
                  type="button"
                  className={`provider-chip${durationMin === min ? " active" : ""}`}
                  onClick={() => setDurationMin(min)}
                >
                  {min < 60 ? `${min} 分` : min === 90 ? "1.5 小时" : `${min / 60} 小时`}
                </button>
              ))}
            </div>
          </div>
        </div>

        <label className="field">
          <span className="field-label">会议链接或地点（可选）</span>
          <input
            type="text"
            className="input"
            placeholder="https://meeting.tencent.com/... 或 会议号"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </label>

        <label className="field">
          <span className="field-label">备注（可选）</span>
          <textarea
            className="textarea"
            rows={3}
            placeholder="面试官信息、需准备的项目要点…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>

        {error && <div className="form-error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="btn btn-soft" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "创建中…" : "确认创建"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

/* ==================== 4. 日历订阅 (.ics) ==================== */
export function CalendarSubscribeModal({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void api
      .getCalendarToken()
      .then((res) => setUrl(res.subscribeUrl))
      .finally(() => setLoading(false));
  }, []);

  async function handleCopy() {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  async function handleRotate() {
    setLoading(true);
    try {
      const res = await api.rotateCalendarToken();
      setUrl(res.subscribeUrl);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalShell title="系统日历订阅 (.ics)" onClose={onClose}>
      <div className="modal-form">
        <p className="field-hint">
          将下方私有地址添加到 Apple 日历、Google 日历或 Outlook 后，邮箱自动解析出的面试与笔试日程会自动同步到手机并提前 30 分钟提醒。
        </p>

        <div className="copy-field">
          <input
            type="text"
            className="input mono"
            readOnly
            value={loading ? "生成中…" : url}
          />
          <button type="button" className="btn btn-primary" onClick={() => void handleCopy()}>
            {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
            <span>{copied ? "已复制" : "复制"}</span>
          </button>
        </div>

        <p className="security-note">
          此链接包含高熵私有令牌，请勿公开分享；若泄露可随时重置，旧订阅立即失效。
        </p>

        <div className="modal-actions between">
          <button type="button" className="btn btn-ghost" onClick={() => void handleRotate()}>
            <IconRefresh size={13} />
            <span>重置链接</span>
          </button>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            完成
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

/* ==================== 5. 面经记录写作 / 编辑（支持一键关联已有投递） ==================== */
const QUICK_ROUNDS = ["一面", "二面", "三面", "HR面", "笔试"] as const;

function guessInterviewStage(rec: ApplicationRecord): string {
  const cur = rec.stages.find((s) => s.status === "current");
  if (cur && cur.type === "interview") return cur.name;
  const lastInterviewPass = [...rec.stages].reverse().find((s) => s.type === "interview" && s.status === "pass");
  if (lastInterviewPass) return lastInterviewPass.name;
  return cur?.name || "一面";
}

export function NoteModal({
  editing,
  preset,
  records,
  existingCompanies,
  onClose,
  onSaved,
}: {
  editing: InterviewNote | null;
  preset?: { recordId?: string; company?: string; position?: string; stageName?: string };
  records: ApplicationRecord[];
  existingCompanies: { company: string; url?: string }[];
  onClose: () => void;
  onSaved: (note: InterviewNote, isEdit: boolean) => void;
}) {
  const initialRecord = useMemo(() => {
    if (editing?.recordId) return records.find((r) => r.id === editing.recordId) || null;
    if (preset?.recordId) return records.find((r) => r.id === preset.recordId) || null;
    if (preset?.company) {
      return records.find((r) => r.company === preset.company) || null;
    }
    if (!editing && records.length > 0) return records[0];
    return null;
  }, [editing, preset, records]);

  const [selectedRecordId, setSelectedRecordId] = useState<string>(initialRecord?.id || "");
  const [manualMode, setManualMode] = useState<boolean>(
    Boolean(editing) || records.length === 0 || (!initialRecord && Boolean(preset?.company)),
  );
  const [company, setCompany] = useState(
    editing?.company || preset?.company || initialRecord?.company || "",
  );
  const [position, setPosition] = useState(
    editing?.position || preset?.position || initialRecord?.position || "",
  );
  const [stageName, setStageName] = useState(
    editing?.stageName || preset?.stageName || (initialRecord ? guessInterviewStage(initialRecord) : "一面"),
  );
  const [interviewedAt, setInterviewedAt] = useState(
    editing?.interviewedAt || new Date().toISOString().slice(0, 10),
  );
  const [feeling, setFeeling] = useState<NoteFeeling>(editing?.feeling || "normal");
  const [content, setContent] = useState(editing?.content || "");
  const [editorMode, setEditorMode] = useState<NoteEditorMode>(loadSavedEditorMode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function pickRecord(rec: ApplicationRecord) {
    setSelectedRecordId(rec.id);
    setManualMode(false);
    setCompany(rec.company);
    setPosition(rec.position);
    setStageName(guessInterviewStage(rec));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!company.trim()) {
      setError("请选择已有投递或填写公司名称。");
      return;
    }
    setBusy(true);
    try {
      const saved = editing
        ? await api.updateNote(editing.id, {
            company: company.trim(),
            position: position.trim(),
            stageName: stageName.trim(),
            interviewedAt: interviewedAt || null,
            feeling,
            content: content.trim(),
          })
        : await api.createNote({
            recordId: manualMode ? undefined : selectedRecordId || preset?.recordId,
            company: company.trim(),
            position: position.trim() || undefined,
            stageName: stageName.trim(),
            interviewedAt: interviewedAt || undefined,
            feeling,
            content: content.trim(),
          });
      onSaved(saved, Boolean(editing));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存面经失败。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title={editing ? "编辑面经记录" : "记一篇面经"} onClose={onClose} wide>
      <form className="modal-form" onSubmit={handleSubmit}>
        {!editing && records.length > 0 && (
          <div className="field">
            <div className="field-head-inline">
              <span className="field-label">关联已有投递（点击即填公司、岗位与当前轮次）</span>
              <button
                type="button"
                className="btn-link muted"
                onClick={() => {
                  const nextManual = !manualMode;
                  setManualMode(nextManual);
                  if (nextManual) {
                    setSelectedRecordId("");
                  } else if (records[0]) {
                    pickRecord(records[0]);
                  }
                }}
              >
                {manualMode ? "改从投递列表选择" : "手动填写其他公司"}
              </button>
            </div>

            {!manualMode && (
              <div className="record-picker-grid" role="listbox" aria-label="选择关联投递">
                {records.map((rec) => {
                  const active = selectedRecordId === rec.id;
                  const stageHint = guessInterviewStage(rec);
                  return (
                    <button
                      key={rec.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={`record-pick-chip${active ? " active" : ""}`}
                      onClick={() => pickRecord(rec)}
                    >
                      <CompanyLogo company={rec.company} url={rec.url} size="sm" />
                      <span className="record-pick-text">
                        <span className="record-pick-company">{rec.company}</span>
                        <span className="record-pick-pos">{rec.position}</span>
                      </span>
                      <span className="record-pick-stage">{stageHint}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {(manualMode || editing || records.length === 0) && (
          <div className="form-row-2">
            <div className="field">
              <span className="field-label">公司</span>
              <CompanyCombobox
                value={company}
                existingCompanies={existingCompanies}
                onChange={setCompany}
                placeholder="例如：字节跳动"
              />
            </div>
            <label className="field">
              <span className="field-label">岗位</span>
              <input
                type="text"
                className="input"
                placeholder="例如：后端开发工程师"
                value={position}
                onChange={(e) => setPosition(e.target.value)}
              />
            </label>
          </div>
        )}

        <div className="form-row-2">
          <div className="field">
            <span className="field-label">面试轮次</span>
            <div className="round-combo">
              <div className="provider-row">
                {QUICK_ROUNDS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={`provider-chip${stageName === r ? " active" : ""}`}
                    onClick={() => setStageName(r)}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <input
                type="text"
                className="input input-sm"
                placeholder="或输入自定义轮次，如 技术终面"
                value={stageName}
                onChange={(e) => setStageName(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="field-stack">
            <label className="field">
              <span className="field-label">面试日期</span>
              <input
                type="date"
                className="input"
                value={interviewedAt}
                onChange={(e) => setInterviewedAt(e.target.value)}
              />
            </label>

            <div className="field">
              <span className="field-label">本轮体感</span>
              <div className="provider-row">
                {(
                  [
                    { value: "great", label: "发挥顺畅" },
                    { value: "normal", label: "正常发挥" },
                    { value: "hard", label: "难度偏高" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`provider-chip${feeling === opt.value ? " active" : ""}`}
                    onClick={() => setFeeling(opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="field">
          <div className="field-head-inline">
            <span className="field-label">问题记录与复盘</span>
            <div className="editor-mode-switch" role="tablist" aria-label="编辑器模式">
              <button
                type="button"
                role="tab"
                aria-selected={editorMode === "markdown"}
                className={`editor-mode-btn${editorMode === "markdown" ? " active" : ""}`}
                onClick={() => {
                  setEditorMode("markdown");
                  saveEditorMode("markdown");
                }}
              >
                Markdown
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={editorMode === "rich"}
                className={`editor-mode-btn${editorMode === "rich" ? " active" : ""}`}
                onClick={() => {
                  setEditorMode("rich");
                  saveEditorMode("rich");
                }}
              >
                富文本
              </button>
            </div>
          </div>
          <NoteEditor
            docKey={editing?.id || "new-note"}
            value={content}
            mode={editorMode}
            compact
            expandTitle={company.trim() ? `${company.trim()}${position.trim() ? ` ${position.trim()}` : ""}` : "新面经复盘"}
            expandBadge={stageName.trim() || "一面"}
            onModeChange={(next) => {
              setEditorMode(next);
              saveEditorMode(next);
            }}
            onChange={setContent}
          />
        </div>

        {error && <div className="form-error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="btn btn-soft" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "保存中…" : "保存面经"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

/* ==================== 6. 数据备份与端到端加密 ==================== */
export function VaultModal({
  records,
  onClose,
  onImported,
}: {
  records: ApplicationRecord[];
  onClose: () => void;
  onImported: () => Promise<void>;
}) {
  const [passphrase, setPassphrase] = useState("");
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const cryptoReady = canUseWebCrypto();

  function downloadJson(data: unknown, filename: string) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function handleEncryptedExport() {
    setMsg(null);
    if (passphrase.trim().length < 6) {
      setMsg({ kind: "err", text: "加密口令至少需要 6 位。" });
      return;
    }
    try {
      const env = await encryptJson({ exportedAt: new Date().toISOString(), records }, passphrase.trim());
      downloadJson({ format: "offerline-encrypted-backup", envelope: env }, "offerline-backup.enc.json");
      setMsg({ kind: "ok", text: "已导出 AES-256-GCM 加密备份文件。" });
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof Error ? err.message : "加密导出失败。" });
    }
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setMsg(null);
    try {
      const parsed = JSON.parse(await file.text()) as Record<string, unknown> | unknown[];
      let items: unknown[];
      if (
        !Array.isArray(parsed) &&
        parsed.format === "offerline-encrypted-backup" &&
        parsed.envelope
      ) {
        if (!passphrase.trim()) {
          setMsg({ kind: "err", text: "这是加密备份文件，请先在上方输入解密口令后再导入。" });
          return;
        }
        const plain = await decryptJson<{ records: unknown[] }>(
          parsed.envelope as Parameters<typeof decryptJson>[0],
          passphrase.trim(),
        );
        items = plain.records;
      } else if (Array.isArray(parsed)) {
        items = parsed;
      } else if (Array.isArray(parsed.records)) {
        items = parsed.records;
      } else {
        throw new Error("无法识别的备份文件格式。");
      }
      const res = await api.importRecords(items, "merge");
      await onImported();
      setMsg({ kind: "ok", text: `成功合并导入 ${res.count} 条投递记录。` });
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof Error ? err.message : "导入失败。" });
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      await api.changePassword(currentPwd, newPwd);
      setCurrentPwd("");
      setNewPwd("");
      setMsg({ kind: "ok", text: "登录密码已更新。" });
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof Error ? err.message : "修改密码失败。" });
    }
  }

  return (
    <ModalShell title="数据备份与账号安全" onClose={onClose}>
      <div className="modal-form">
        <div className="vault-section">
          <div className="vault-title">数据导出与导入</div>
          <p className="field-hint">
            支持标准 JSON 备份以及浏览器端 AES-256-GCM 端到端加密备份（口令不上传服务器）。
          </p>
          <div className="vault-row">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => downloadJson(records, "offerline-records.json")}
            >
              导出 JSON ({records.length})
            </button>
            <label className="btn btn-ghost file-btn">
              <span>导入 JSON / 加密备份</span>
              <input type="file" accept=".json" hidden onChange={(e) => void handleImportFile(e)} />
            </label>
          </div>

          <div className="copy-field">
            <input
              type="password"
              className="input"
              placeholder={cryptoReady ? "输入备份加密/解密口令（至少 6 位）" : "浏览器端加密需在 HTTPS 或本地环境下启用"}
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              disabled={!cryptoReady}
            />
            <button
              type="button"
              className="btn btn-primary"
              disabled={!cryptoReady}
              onClick={() => void handleEncryptedExport()}
            >
              加密导出
            </button>
          </div>
        </div>

        <form className="vault-section" onSubmit={handlePasswordSubmit}>
          <div className="vault-title">修改登录密码</div>
          <div className="form-row-2">
            <input
              type="password"
              className="input"
              placeholder="当前密码"
              value={currentPwd}
              onChange={(e) => setCurrentPwd(e.target.value)}
              required
            />
            <input
              type="password"
              className="input"
              placeholder="新密码（至少 10 位）"
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              required
            />
          </div>
          <div className="modal-actions">
            <button type="submit" className="btn btn-ghost">
              更新密码
            </button>
          </div>
        </form>

        {msg && <div className={msg.kind === "ok" ? "form-ok" : "form-error"}>{msg.text}</div>}
      </div>
    </ModalShell>
  );
}
