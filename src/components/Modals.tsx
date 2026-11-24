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
import { matchBrandEntry } from "../../shared/companies";
import {
  createDefaultStageDrafts,
  createStageDraftsFromNames,
  inferStageType,
  STAGE_STATUS_LABELS,
  STAGE_TEMPLATES,
} from "../../shared/stages";
import {
  EVENT_KINDS,
  EVENT_TIME_MODES,
  type ApplicationRecord,
  type EmailParseResult,
  type EventKind,
  type EventTimeMode,
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
  IconMail,
  IconPlus,
  IconRefresh,
  IconSearch,
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
    tip: "在 QQ 邮箱网页端「设置 → 账号与安全 → 安全管理 → POP3/IMAP」开启服务并复制 16 位授权码。",
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

type LlmProviderKey = "deepseek" | "qwen" | "zhipu" | "kimi" | "openai" | "custom";

const LLM_PRESET_ORDER: LlmProviderKey[] = ["deepseek", "qwen", "zhipu", "kimi", "openai", "custom"];

const LLM_PRESETS: Record<
  LlmProviderKey,
  {
    label: string;
    baseUrl: string;
    model: string;
    placeholderUrl: string;
    placeholderModel: string;
    guideUrl?: string;
    guideLabel?: string;
    tip: string;
  }
> = {
  deepseek: {
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    placeholderUrl: "https://api.deepseek.com/v1",
    placeholderModel: "deepseek-chat",
    guideUrl: "https://platform.deepseek.com/api_keys",
    guideLabel: "获取 DeepSeek Key",
    tip: "性价比极高且支持原生 JSON 输出，100 封日常邮箱解析成本不到几分钱。",
  },
  qwen: {
    label: "通义千问",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-plus",
    placeholderUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    placeholderModel: "qwen-plus",
    guideUrl: "https://bailian.console.aliyun.com/?apiKey=1",
    guideLabel: "前往阿里云百炼",
    tip: "阿里云百炼 OpenAI 兼容端点，推荐 qwen-plus 或 qwen-turbo。",
  },
  zhipu: {
    label: "智谱 GLM",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    model: "glm-4-flash",
    placeholderUrl: "https://open.bigmodel.cn/api/paas/v4",
    placeholderModel: "glm-4-flash",
    guideUrl: "https://open.bigmodel.cn/usercenter/apikeys",
    guideLabel: "前往智谱开放平台",
    tip: "智谱开放平台兼容接口，glm-4-flash 响应快且支持高免费额度。",
  },
  kimi: {
    label: "月之暗面 Kimi",
    baseUrl: "https://api.moonshot.cn/v1",
    model: "moonshot-v1-8k",
    placeholderUrl: "https://api.moonshot.cn/v1",
    placeholderModel: "moonshot-v1-8k",
    guideUrl: "https://platform.moonshot.cn/console/api-keys",
    guideLabel: "前往 Moonshot 控制台",
    tip: "Moonshot OpenAI 兼容接口，长中文邮件正文理解稳定。",
  },
  openai: {
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    placeholderUrl: "https://api.openai.com/v1",
    placeholderModel: "gpt-4o-mini",
    guideUrl: "https://platform.openai.com/api-keys",
    guideLabel: "前往 OpenAI",
    tip: "需服务器出站网络可访问 api.openai.com，推荐轻量快速的 gpt-4o-mini。",
  },
  custom: {
    label: "自定义兼容",
    baseUrl: "",
    model: "",
    placeholderUrl: "https://your-gateway.example/v1",
    placeholderModel: "输入模型 ID",
    tip: "支持硅基流动、火山方舟、OpenRouter、自建聚合网关等任意 OpenAI 兼容接口；自动兼容省略 /v1 或完整路径。",
  },
};

function detectLlmPreset(baseUrl: string): LlmProviderKey {
  const lower = baseUrl.trim().toLowerCase();
  if (!lower) return "deepseek";
  if (lower.includes("deepseek.com")) return "deepseek";
  if (lower.includes("dashscope.aliyuncs.com")) return "qwen";
  if (lower.includes("bigmodel.cn")) return "zhipu";
  if (lower.includes("moonshot.cn")) return "kimi";
  if (lower.includes("api.openai.com")) return "openai";
  return "custom";
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
const LOOKBACK_PRESETS: { days: number; label: string }[] = [
  { days: 0, label: "从现在起，只看新邮件" },
  { days: 1, label: "近 1 天" },
  { days: 3, label: "近 3 天" },
  { days: 7, label: "近 7 天" },
  { days: 14, label: "近 14 天" },
  { days: 30, label: "近 30 天" },
];

export function MailSettingsModal({
  config,
  initialTab = "imap",
  onClose,
  onConfigUpdated,
  onEventCreated,
}: {
  config: MailAccountPublic | null;
  initialTab?: "imap" | "llm" | "parse";
  onClose: () => void;
  onConfigUpdated: (cfg: MailAccountPublic) => void;
  onEventCreated: (ev: ScheduleEvent) => void;
}) {
  const [tab, setTab] = useState<"imap" | "llm" | "parse">(initialTab);
  const [enabled, setEnabled] = useState(config?.configured ? config.enabled : true);
  const [provider, setProvider] = useState<MailProvider>(config?.provider || "qq");
  const [host, setHost] = useState(config?.host || PROVIDER_PRESETS.qq.host);
  const [portInput, setPortInput] = useState(String(config?.port || 993));
  const [secure, setSecure] = useState(config?.secure ?? true);
  const [email, setEmail] = useState(config?.email || "");
  const [password, setPassword] = useState("");
  const [folder, setFolder] = useState(config?.folder || "INBOX");
  const [pollIntervalMin, setPollIntervalMin] = useState(config?.pollIntervalMin || 10);
  const [lookbackDays, setLookbackDays] = useState(config?.lookbackDays ?? 7);

  // 独立大模型增强状态
  const [llmPreset, setLlmPreset] = useState<LlmProviderKey>(() =>
    detectLlmPreset(config?.llmBaseUrl || ""),
  );
  const [llmEnabled, setLlmEnabled] = useState(config?.llmEnabled ?? false);
  const [llmBaseUrl, setLlmBaseUrl] = useState(
    config?.llmBaseUrl || LLM_PRESETS.deepseek.baseUrl,
  );
  const [llmModel, setLlmModel] = useState(config?.llmModel || LLM_PRESETS.deepseek.model);
  const [llmApiKey, setLlmApiKey] = useState("");
  const [testingLlm, setTestingLlm] = useState(false);
  const [savingLlm, setSavingLlm] = useState(false);

  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(provider === "custom");
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

  const lookbackChoices = useMemo(() => {
    if (LOOKBACK_PRESETS.some((item) => item.days === lookbackDays)) {
      return LOOKBACK_PRESETS;
    }
    return [...LOOKBACK_PRESETS, { days: lookbackDays, label: `近 ${lookbackDays} 天` }].sort(
      (a, b) => a.days - b.days,
    );
  }, [lookbackDays]);

  function parseValidPort(): number | null {
    const n = Number.parseInt(portInput.trim(), 10);
    if (Number.isNaN(n) || n < 1 || n > 65535 || String(n) !== portInput.trim().replace(/^0+(?=\d)/, "")) {
      return null;
    }
    return n;
  }

  function selectProvider(p: MailProvider) {
    setProvider(p);
    if (p !== "custom") {
      setHost(PROVIDER_PRESETS[p].host);
      setPortInput(String(PROVIDER_PRESETS[p].port));
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
      setPortInput(String(PROVIDER_PRESETS[detected].port));
      setSecure(PROVIDER_PRESETS[detected].secure);
    }
  }

  async function handleTest() {
    setFeedback(null);
    const parsedPort = parseValidPort();
    if (!parsedPort) {
      setAdvancedOpen(true);
      setFeedback({ kind: "err", text: "IMAP 端口需为 1–65535 之间的整数（SSL 通常为 993）。" });
      return;
    }
    setTesting(true);
    try {
      const res = await api.testMailConfig({
        host: host.trim(),
        port: parsedPort,
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
    const parsedPort = parseValidPort();
    if (!parsedPort) {
      setAdvancedOpen(true);
      setFeedback({ kind: "err", text: "IMAP 端口需为 1–65535 之间的整数（SSL 通常为 993）。" });
      return;
    }
    const rawLookback = Number(lookbackDays);
    const normalizedLookback = Number.isFinite(rawLookback)
      ? Math.max(0, Math.min(30, Math.trunc(rawLookback)))
      : 7;
    setSaving(true);
    try {
      const saved = await api.saveMailConfig({
        enabled,
        provider,
        host: host.trim(),
        port: parsedPort,
        secure,
        email: email.trim(),
        password: password.trim() || undefined,
        folder: folder.trim() || "INBOX",
        pollIntervalMin: Number(pollIntervalMin) || 10,
        lookbackDays: normalizedLookback,
      });
      onConfigUpdated(saved);
      setLookbackDays(saved.lookbackDays);
      setPortInput(String(saved.port));
      setPassword("");
      setFeedback({
        kind: "ok",
        text:
          saved.lookbackDays === 0
            ? "邮箱监听配置已加密保存，将仅识别从现在起新收到的邮件。"
            : `邮箱监听配置已加密保存，首次同步将回溯近 ${saved.lookbackDays} 天邮件。`,
      });
    } catch (err) {
      setFeedback({
        kind: "err",
        text: err instanceof Error ? err.message : "保存失败。",
      });
    } finally {
      setSaving(false);
    }
  }

  function selectLlmPreset(p: LlmProviderKey) {
    setLlmPreset(p);
    setFeedback(null);
    if (p !== "custom") {
      setLlmBaseUrl(LLM_PRESETS[p].baseUrl);
      setLlmModel(LLM_PRESETS[p].model);
    } else {
      setLlmBaseUrl("");
      setLlmModel("");
    }
  }

  async function handleTestLlm() {
    setFeedback(null);
    setTestingLlm(true);
    try {
      const res = await api.testLlmConfig({
        baseUrl: llmBaseUrl.trim(),
        model: llmModel.trim(),
        apiKey: llmApiKey.trim() || undefined,
      });
      setFeedback({
        kind: "ok",
        text: `连通成功，响应耗时 ${res.latencyMs}ms（${res.jsonMode === "native" ? "原生 JSON 模式" : "兼容 JSON 提取模式"}）。`,
      });
    } catch (err) {
      setFeedback({
        kind: "err",
        text: err instanceof Error ? err.message : "大模型连通性测试失败。",
      });
    } finally {
      setTestingLlm(false);
    }
  }

  async function handleSaveLlm(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    setSavingLlm(true);
    try {
      const saved = await api.saveLlmConfig({
        llmEnabled,
        llmBaseUrl: llmBaseUrl.trim(),
        llmModel: llmModel.trim(),
        llmApiKey: llmApiKey.trim() || undefined,
      });
      onConfigUpdated(saved);
      setLlmApiKey("");
      setFeedback({
        kind: "ok",
        text: llmEnabled ? "大模型增强配置已加密保存，后续同步与粘贴解析自动生效。" : "已关闭大模型增强，恢复纯本地规则解析。",
      });
    } catch (err) {
      setFeedback({
        kind: "err",
        text: err instanceof Error ? err.message : "保存大模型配置失败。",
      });
    } finally {
      setSavingLlm(false);
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
          className={`modal-tab${tab === "llm" ? " active" : ""}`}
          onClick={() => {
            setTab("llm");
            setFeedback(null);
          }}
        >
          <span>大模型增强</span>
          {config?.llmEnabled && <span className="tab-badge-ok">已启用</span>}
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

          <div className="field">
            <span className="field-label">接入时邮件扫描范围</span>
            <div className="provider-row">
              {lookbackChoices.map((opt) => (
                <button
                  key={opt.days}
                  type="button"
                  className={`provider-chip${lookbackDays === opt.days ? " active" : ""}`}
                  onClick={() => setLookbackDays(opt.days)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="field-micro-hint">
              {lookbackDays === 0
                ? "仅记录当前最新邮件位置，保存后只识别从此刻起新收到的邮件，不翻查旧邮件。"
                : `首次同步（或调大范围）时回溯最近 ${lookbackDays} 天的邮件，之后自动只查新邮件。`}
            </p>
          </div>

          <div className="switch-row">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              <span>开启后台自动监听（以只读模式扫描新邮件，不改未读状态）</span>
            </label>
          </div>

          {/* 极简细线高级参数摘要（无灰底块、无中圆点） */}
          <div className="mail-preset-row">
            <div className="mail-preset-specs">
              <span className="mail-spec-item">
                <span className="mail-spec-k">服务器</span>
                <span className="mail-spec-v">
                  {host || "待填写"}:{portInput.trim() || "993"}
                </span>
              </span>
              <span className="mail-spec-item">
                <span className="mail-spec-k">检查频率</span>
                <span className="mail-spec-v">每 {pollIntervalMin} 分钟</span>
              </span>
              <span className="mail-spec-item">
                <span className="mail-spec-k">文件夹</span>
                <span className="mail-spec-v">{folder.trim() || "INBOX"}</span>
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
                    type="text"
                    inputMode="numeric"
                    className="input"
                    placeholder="993"
                    value={portInput}
                    onChange={(e) => setPortInput(e.target.value.replace(/[^\d]/g, ""))}
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
      ) : tab === "llm" ? (
        <form className="modal-form" onSubmit={handleSaveLlm}>
          <div className="field">
            <span className="field-label">常用厂商预设（任意 OpenAI 兼容接口均适用）</span>
            <div className="provider-row">
              {LLM_PRESET_ORDER.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`provider-chip${llmPreset === p ? " active" : ""}`}
                  onClick={() => selectLlmPreset(p)}
                >
                  {LLM_PRESETS[p].label}
                </button>
              ))}
            </div>
          </div>

          <div className="mail-tip-row">
            <span className="field-hint">{LLM_PRESETS[llmPreset].tip}</span>
            {LLM_PRESETS[llmPreset].guideUrl && (
              <a
                href={LLM_PRESETS[llmPreset].guideUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-link"
              >
                <span>{LLM_PRESETS[llmPreset].guideLabel}</span>
                <IconExternal size={12} />
              </a>
            )}
          </div>

          <div className="switch-row">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={llmEnabled}
                onChange={(e) => setLlmEnabled(e.target.checked)}
              />
              <span>启用可选大模型增强（默认本地规则已可完整解析，未配 IMAP 也能单独用于粘贴解析）</span>
            </label>
          </div>

          <div className="form-row-2">
            <label className="field">
              <span className="field-label">API Base URL</span>
              <input
                type="url"
                className="input"
                placeholder={LLM_PRESETS[llmPreset].placeholderUrl}
                value={llmBaseUrl}
                onChange={(e) => {
                  setLlmBaseUrl(e.target.value);
                  setLlmPreset(detectLlmPreset(e.target.value));
                }}
                required={llmEnabled}
              />
            </label>
            <label className="field">
              <span className="field-label">模型名称</span>
              <input
                type="text"
                className="input"
                placeholder={LLM_PRESETS[llmPreset].placeholderModel}
                value={llmModel}
                onChange={(e) => setLlmModel(e.target.value)}
                required={llmEnabled}
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
              placeholder={
                config?.hasLlmKey ? "已加密保存，如需更换请重新填写" : "粘贴个人 API Key（sk-...）"
              }
              value={llmApiKey}
              onChange={(e) => setLlmApiKey(e.target.value)}
              required={llmEnabled && !config?.hasLlmKey}
            />
          </label>

          <p className="security-note">
            验证码、账单、拒信、调研问卷与宣讲广告由本地规则 0 Token 拦截，仅疑似求职日程邮件才调模型；Key 服务端 AES-256-GCM 密文存储，异常时无损回退本地规则。
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
              disabled={testingLlm || !llmBaseUrl.trim() || !llmModel.trim()}
              onClick={() => void handleTestLlm()}
            >
              {testingLlm ? "测试连通中…" : "测试模型连通"}
            </button>
            <div className="modal-actions-right">
              <button type="button" className="btn btn-soft" onClick={onClose}>
                取消
              </button>
              <button type="submit" className="btn btn-primary" disabled={savingLlm}>
                {savingLlm ? "保存中…" : "保存模型配置"}
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
              <div className="parse-preview-title">
                解析结果（{preview.parserSource === "llm" ? "大模型增强" : "本地规则"}，置信度 {preview.confidence}%）
              </div>
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

/* ==================== 通用：带搜索过滤的关联投递选择器 ==================== */
function guessInterviewStage(rec: ApplicationRecord): string {
  const cur = rec.stages.find((s) => s.status === "current");
  if (cur && cur.type === "interview") return cur.name;
  const lastInterviewPass = [...rec.stages].reverse().find((s) => s.type === "interview" && s.status === "pass");
  if (lastInterviewPass) return lastInterviewPass.name;
  return cur?.name || "一面";
}

function RecordPicker({
  records,
  selectedId,
  onSelect,
  onManualFallback,
}: {
  records: ApplicationRecord[];
  selectedId: string;
  onSelect: (rec: ApplicationRecord) => void;
  onManualFallback?: () => void;
}) {
  const [query, setQuery] = useState("");
  const trimmed = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!trimmed) return records;
    return records.filter((rec) => {
      const stageHint = guessInterviewStage(rec).toLowerCase();
      if (
        rec.company.toLowerCase().includes(trimmed) ||
        rec.position.toLowerCase().includes(trimmed) ||
        stageHint.includes(trimmed)
      ) {
        return true;
      }
      const brand = matchBrandEntry(rec.company);
      return Boolean(brand?.keywords.some((kw) => kw.toLowerCase().includes(trimmed)));
    });
  }, [records, trimmed]);

  return (
    <div className="record-picker-wrap">
      {records.length > 4 && (
        <div className="record-picker-search">
          <IconSearch size={13} />
          <input
            type="text"
            className="search-input"
            placeholder="搜索公司、缩写或岗位（如 字节、zj、java）…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (filtered.length > 0) {
                  onSelect(filtered[0]);
                }
              }
            }}
            aria-label="筛选关联投递"
          />
          {trimmed && (
            <>
              <span className="record-picker-count">
                {filtered.length}/{records.length}
              </span>
              <button
                type="button"
                className="search-clear"
                onClick={() => setQuery("")}
                aria-label="清空搜索"
              >
                <IconClose size={12} />
              </button>
            </>
          )}
        </div>
      )}

      <div className="record-picker-grid" role="listbox" aria-label="选择关联投递">
        {filtered.length > 0 ? (
          filtered.map((rec) => {
            const active = selectedId === rec.id;
            const stageHint = guessInterviewStage(rec);
            return (
              <button
                key={rec.id}
                type="button"
                role="option"
                aria-selected={active}
                className={`record-pick-chip${active ? " active" : ""}`}
                onClick={() => onSelect(rec)}
              >
                <CompanyLogo company={rec.company} url={rec.url} size="sm" />
                <span className="record-pick-text">
                  <span className="record-pick-company">{rec.company}</span>
                  <span className="record-pick-pos">{rec.position}</span>
                </span>
                <span className="record-pick-stage">{stageHint}</span>
              </button>
            );
          })
        ) : (
          <div className="record-picker-empty">
            <span>未找到匹配「{query.trim()}」的投递</span>
            {onManualFallback && (
              <button type="button" className="btn-link" onClick={onManualFallback}>
                直接手动填写
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ==================== 3. 新建 / 编辑日程（支持一键关联与核对） ==================== */
const STAGE_QUICK_CHIPS = [
  "一面",
  "二面",
  "三面",
  "终面",
  "HR面",
  "面试",
  "笔试",
  "测评",
  "录用意向",
  "正式Offer",
] as const;

function toLocalDateTimeInput(iso?: string): string {
  const d = iso && !Number.isNaN(Date.parse(iso)) ? new Date(iso) : new Date(Date.now() + 24 * 3600_000);
  if (!iso) d.setHours(14, 0, 0, 0);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function toLocalDateInput(iso?: string): string {
  const d = iso && !Number.isNaN(Date.parse(iso)) ? new Date(iso) : new Date(Date.now() + 3 * 86400_000);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function computeInitialDuration(ev?: ScheduleEvent | null): number {
  if (!ev?.startAt || !ev?.endAt) return 60;
  const mins = Math.round((Date.parse(ev.endAt) - Date.parse(ev.startAt)) / 60_000);
  if (!Number.isFinite(mins) || mins < 15 || mins > 480) return 60;
  return mins;
}

export function EventModal({
  editing,
  preset,
  records,
  existingCompanies,
  onClose,
  onSaved,
}: {
  editing?: ScheduleEvent | null;
  preset?: { recordId?: string; company?: string; position?: string; stageName?: string };
  records: ApplicationRecord[];
  existingCompanies: { company: string; url?: string }[];
  onClose: () => void;
  onSaved: (ev: ScheduleEvent, isEdit: boolean, confirmedNow?: boolean) => void;
}) {
  const isEdit = Boolean(editing);
  const isPendingEdit = editing?.status === "pending_confirm";

  const initialRecord = useMemo(() => {
    if (editing) {
      return editing.recordId ? records.find((r) => r.id === editing.recordId) || null : null;
    }
    if (preset?.recordId) return records.find((r) => r.id === preset.recordId) || null;
    if (preset?.company) return records.find((r) => r.company === preset.company) || null;
    if (records.length > 0) return records[0];
    return null;
  }, [editing, preset, records]);

  const [selectedRecordId, setSelectedRecordId] = useState<string>(initialRecord?.id || "");
  const [pickerOpen, setPickerOpen] = useState<boolean>(!isEdit && records.length > 0 && Boolean(initialRecord));
  const [company, setCompany] = useState(
    editing?.company || preset?.company || initialRecord?.company || "",
  );
  const [position, setPosition] = useState(
    editing?.position ?? (preset?.position || initialRecord?.position || ""),
  );
  const [stageName, setStageName] = useState(
    editing?.stageName || preset?.stageName || (initialRecord ? guessInterviewStage(initialRecord) : "一面"),
  );
  const [kind, setKind] = useState<EventKind>(editing?.kind || "interview");
  const [timeMode, setTimeMode] = useState<EventTimeMode>(editing?.timeMode || "scheduled");
  const [startLocal, setStartLocal] = useState(() => toLocalDateTimeInput(editing?.startAt));
  const [deadlineDate, setDeadlineDate] = useState(() => toLocalDateInput(editing?.startAt));
  const [durationMin, setDurationMin] = useState(() => computeInitialDuration(editing));
  const [location, setLocation] = useState(editing?.location || "");
  const [notes, setNotes] = useState(editing?.notes || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const linkedRecord = useMemo(
    () => (selectedRecordId ? records.find((r) => r.id === selectedRecordId) || null : null),
    [records, selectedRecordId],
  );

  function pickRecord(rec: ApplicationRecord) {
    setSelectedRecordId(rec.id);
    setCompany(rec.company);
    setPosition(rec.position);
    if (!isEdit) {
      setStageName(guessInterviewStage(rec));
    } else {
      setPickerOpen(false);
    }
  }

  async function submitEvent(confirmPending: boolean) {
    setError("");
    if (!company.trim()) {
      setError("请选择已有投递或填写公司名称。");
      return;
    }

    let startAt: string;
    let endAt: string | null = null;
    if (timeMode === "scheduled") {
      const startMs = Date.parse(startLocal);
      if (Number.isNaN(startMs)) {
        setError("请选择有效的开始时间。");
        return;
      }
      startAt = new Date(startMs).toISOString();
      endAt = new Date(startMs + durationMin * 60_000).toISOString();
    } else if (timeMode === "deadline") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(deadlineDate)) {
        setError("请选择有效的截止日期。");
        return;
      }
      const dlMs = Date.parse(`${deadlineDate}T23:59:00+08:00`);
      if (Number.isNaN(dlMs)) {
        setError("请选择有效的截止日期。");
        return;
      }
      startAt = new Date(dlMs).toISOString();
      endAt = null;
    } else {
      startAt = editing?.startAt || new Date().toISOString();
      endAt = null;
    }

    const cleanStage = stageName.trim() || "面试";
    const title = position.trim()
      ? `${company.trim()} ${position.trim()} ${cleanStage}`
      : `${company.trim()} ${cleanStage}`;

    setBusy(true);
    try {
      if (editing) {
        const updated = await api.updateEvent(editing.id, {
          recordId: selectedRecordId || null,
          company: company.trim(),
          position: position.trim(),
          stageName: cleanStage,
          title,
          kind,
          startAt,
          endAt,
          timeMode,
          location: location.trim() || null,
          status: confirmPending ? "confirmed" : editing.status,
          notes: notes.trim(),
        });
        onSaved(updated, true, confirmPending);
      } else {
        const created = await api.createEvent({
          recordId: selectedRecordId || preset?.recordId,
          company: company.trim(),
          position: position.trim() || undefined,
          stageName: cleanStage,
          title,
          kind,
          startAt,
          endAt: endAt || undefined,
          timeMode,
          location: location.trim() || undefined,
          notes: notes.trim() || undefined,
        });
        onSaved(created, false, false);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : isEdit ? "保存日程失败。" : "创建日程失败。");
    } finally {
      setBusy(false);
    }
  }

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    void submitEvent(isPendingEdit);
  }

  return (
    <ModalShell
      title={isPendingEdit ? "核对并编辑邮箱日程" : isEdit ? "编辑日程" : "新建面试 / 笔试日程"}
      onClose={onClose}
      wide
    >
      <form className="modal-form" onSubmit={handleFormSubmit}>
        {editing?.mailSubject && (
          <div className="event-mail-ref">
            <div className="event-mail-ref-head">
              <IconMail size={13} />
              <span>原邮件：{editing.mailSubject}</span>
            </div>
            {editing.mailSnippet && (
              <p className="event-mail-ref-snippet">{editing.mailSnippet}</p>
            )}
          </div>
        )}

        {records.length > 0 && (
          <div className="field">
            <div className="field-head-inline">
              <span className="field-label">
                {linkedRecord
                  ? `已关联投递：${linkedRecord.company} ${linkedRecord.position}`
                  : "关联已有投递（可选，仅用于快捷跳转，不自动修改时间线）"}
              </span>
              <div className="event-link-controls">
                {linkedRecord && (
                  <button
                    type="button"
                    className="btn-link muted"
                    onClick={() => setSelectedRecordId("")}
                  >
                    取消关联
                  </button>
                )}
                <button
                  type="button"
                  className="btn-link muted"
                  onClick={() => setPickerOpen((v) => !v)}
                >
                  {pickerOpen ? "收起投递列表" : linkedRecord ? "切换关联" : "从投递列表选择"}
                </button>
              </div>
            </div>

            {pickerOpen && (
              <RecordPicker
                records={records}
                selectedId={selectedRecordId}
                onSelect={pickRecord}
                onManualFallback={() => setPickerOpen(false)}
              />
            )}
          </div>
        )}

        {(isEdit || !pickerOpen || records.length === 0) && (
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
                placeholder="例如：后端研发工程师"
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

          <div className="field">
            <span className="field-label">轮次 / 阶段</span>
            <input
              type="text"
              className="input"
              value={stageName}
              onChange={(e) => setStageName(e.target.value)}
            />
            <div className="stage-quick-chips">
              {STAGE_QUICK_CHIPS.map((st) => (
                <button
                  key={st}
                  type="button"
                  className={`stage-quick-chip${stageName === st ? " active" : ""}`}
                  onClick={() => setStageName(st)}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="field">
          <span className="field-label">时间类型</span>
          <div className="provider-row">
            {EVENT_TIME_MODES.map((m) => (
              <button
                key={m}
                type="button"
                className={`provider-chip${timeMode === m ? " active" : ""}`}
                onClick={() => setTimeMode(m)}
              >
                {m === "scheduled" ? "固定时刻" : m === "deadline" ? "截止日期" : "时间自定"}
              </button>
            ))}
          </div>
        </div>

        {timeMode === "scheduled" ? (
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
        ) : timeMode === "deadline" ? (
          <div className="form-row-2">
            <label className="field">
              <span className="field-label">截止日期（导出 .ics 为当日全天提醒）</span>
              <input
                type="date"
                className="input"
                value={deadlineDate}
                onChange={(e) => setDeadlineDate(e.target.value)}
                required
              />
            </label>
          </div>
        ) : (
          <p className="field-micro-hint">
            时间自定项目仅保留在日程待办中，不会用发信时间写入系统日历订阅。
          </p>
        )}

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
          {isPendingEdit ? (
            <>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy}
                onClick={() => void submitEvent(false)}
              >
                {busy ? "保存中…" : "仅保存修改"}
              </button>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? "处理中…" : "保存并加入日程"}
              </button>
            </>
          ) : (
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? (isEdit ? "保存中…" : "创建中…") : isEdit ? "保存修改" : "确认创建"}
            </button>
          )}
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
              <RecordPicker
                records={records}
                selectedId={selectedRecordId}
                onSelect={pickRecord}
                onManualFallback={() => {
                  setManualMode(true);
                  setSelectedRecordId("");
                }}
              />
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
            <span className="field-label">问题记录与复盘（支持所见即所得 Markdown）</span>
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
