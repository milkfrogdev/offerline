import React, { useEffect, useState } from "react";
import {
  createDefaultStageDrafts,
  createStageDraftsFromNames,
  inferStageType,
  STAGE_TEMPLATES,
  STAGE_TYPE_LABELS,
} from "../../shared/stages";
import {
  EVENT_KINDS,
  STAGE_TYPES,
  type ApplicationRecord,
  type EmailParseResult,
  type EventKind,
  type InterviewNote,
  type MailAccountPublic,
  type MailProvider,
  type NoteFeeling,
  type ScheduleEvent,
  type StageDraft,
  type StageType,
} from "../../shared/types";
import { api } from "../api";
import { canUseWebCrypto, decryptJson, encryptJson } from "../crypto";
import { IconCheck, IconClose, IconCopy, IconPlus, IconRefresh, IconTrash } from "./Icons";

const PROVIDER_ORDER: MailProvider[] = ["qq", "163", "126", "gmail", "outlook", "exmail", "custom"];

const PROVIDER_PRESETS: Record<
  MailProvider,
  { label: string; host: string; port: number; secure: boolean; tip: string }
> = {
  qq: {
    label: "QQ 邮箱",
    host: "imap.qq.com",
    port: 993,
    secure: true,
    tip: "需在 QQ 邮箱网页端「设置 → 账户」开启 IMAP 服务，并填入 16 位授权码。",
  },
  "163": {
    label: "网易 163",
    host: "imap.163.com",
    port: 993,
    secure: true,
    tip: "需在网易邮箱「设置 → POP3/SMTP/IMAP」开启 IMAP 并生成客户端授权密码。",
  },
  "126": {
    label: "网易 126",
    host: "imap.126.com",
    port: 993,
    secure: true,
    tip: "需在 126 邮箱设置中开启 IMAP 并生成授权密码。",
  },
  gmail: {
    label: "Gmail",
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    tip: "需开启 Google 两步验证并创建 16 位应用专用密码（App Password）。",
  },
  outlook: {
    label: "Outlook",
    host: "outlook.office365.com",
    port: 993,
    secure: true,
    tip: "使用标准 IMAP 993 端口 SSL 连接。",
  },
  exmail: {
    label: "腾讯企业邮",
    host: "imap.exmail.qq.com",
    port: 993,
    secure: true,
    tip: "使用企业邮箱客户端专用密码接入。",
  },
  custom: {
    label: "自定义 IMAP",
    host: "",
    port: 993,
    secure: true,
    tip: "支持任意标准 IMAP 邮箱服务器。",
  },
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
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className={`modal-panel${wide ? " modal-wide" : ""}`}
        onMouseDown={(e) => e.stopPropagation()}
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

/* ==================== 1. 新增 / 编辑投递 ==================== */
export function RecordModal({
  editing,
  presetCompany,
  presetUrl,
  onClose,
  onSaved,
}: {
  editing: ApplicationRecord | null;
  presetCompany?: string;
  presetUrl?: string;
  onClose: () => void;
  onSaved: (record: ApplicationRecord, isEdit: boolean) => void;
}) {
  const [company, setCompany] = useState(editing?.company || presetCompany || "");
  const [position, setPosition] = useState(editing?.position || "");
  const [url, setUrl] = useState(editing?.url || presetUrl || "");
  const [stages, setStages] = useState<StageDraft[]>(() =>
    editing
      ? editing.stages.map((s) => ({ id: s.id, name: s.name, type: s.type, status: s.status }))
      : createDefaultStageDrafts(),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function moveStage(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= stages.length) return;
    const copy = [...stages];
    const [item] = copy.splice(index, 1);
    copy.splice(target, 0, item);
    setStages(copy);
  }

  function addStage() {
    setStages((prev) => [
      ...prev,
      { id: `custom-${Date.now()}-${prev.length}`, name: "", type: "interview" },
    ]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const cleanedStages = stages.map((s, idx) => ({
      id: s.id || `stage-${idx + 1}`,
      name: s.name.trim(),
      type: s.type || inferStageType({ name: s.name }),
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
          <label className="field">
            <span className="field-label">公司名称</span>
            <input
              type="text"
              className="input"
              placeholder="例如：字节跳动、腾讯、美团"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              required
            />
          </label>
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
          <span className="field-label">官网投递进度链接（可选）</span>
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
            <span className="field-label">面试流程阶段</span>
            <div className="template-switches">
              {STAGE_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  className="subtle-btn"
                  onClick={() => setStages(createStageDraftsFromNames(tpl.names))}
                >
                  {tpl.label}
                </button>
              ))}
            </div>
          </div>

          <div className="stage-editor-list">
            {stages.map((st, idx) => (
              <div key={st.id || idx} className="stage-editor-row">
                <input
                  type="text"
                  className="input input-sm"
                  placeholder="阶段名称"
                  value={st.name}
                  onChange={(e) => {
                    const val = e.target.value;
                    setStages((prev) =>
                      prev.map((item, i) =>
                        i === idx
                          ? { ...item, name: val, type: item.type || inferStageType({ name: val }) }
                          : item,
                      ),
                    );
                  }}
                  required
                />
                <select
                  className="select-minimal select-sm"
                  value={st.type || inferStageType(st)}
                  onChange={(e) => {
                    const val = e.target.value as StageType;
                    setStages((prev) =>
                      prev.map((item, i) => (i === idx ? { ...item, type: val } : item)),
                    );
                  }}
                >
                  {STAGE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {STAGE_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
                <div className="stage-order-ops">
                  <button
                    type="button"
                    className="subtle-btn"
                    disabled={idx === 0}
                    onClick={() => moveStage(idx, -1)}
                    title="上移"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="subtle-btn"
                    disabled={idx === stages.length - 1}
                    onClick={() => moveStage(idx, 1)}
                    title="下移"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="row-icon-btn danger"
                    disabled={stages.length <= 1}
                    onClick={() => setStages((prev) => prev.filter((_, i) => i !== idx))}
                    title="删除阶段"
                  >
                    <IconTrash size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button type="button" className="btn btn-ghost btn-sm" onClick={addStage}>
            <IconPlus size={13} />
            <span>新增阶段</span>
          </button>
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
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // 粘贴解析状态
  const [rawSubject, setRawSubject] = useState("");
  const [rawFrom, setRawFrom] = useState("");
  const [rawText, setRawText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState<EmailParseResult | null>(null);

  function selectProvider(p: MailProvider) {
    setProvider(p);
    if (p !== "custom") {
      setHost(PROVIDER_PRESETS[p].host);
      setPort(PROVIDER_PRESETS[p].port);
      setSecure(PROVIDER_PRESETS[p].secure);
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
      if (createEvent && res.event) {
        onEventCreated(res.event);
        setFeedback({ kind: "ok", text: `已生成日程：${res.event.title}` });
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
          <p className="field-hint">{PROVIDER_PRESETS[provider].tip}</p>

          <div className="form-row-2">
            <label className="field">
              <span className="field-label">邮箱地址</span>
              <input
                type="email"
                className="input"
                placeholder="name@qq.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span className="field-label">
                IMAP 授权码 {config?.hasPassword ? "（已加密保存，留空不修改）" : ""}
              </span>
              <input
                type="password"
                className="input"
                placeholder={config?.hasPassword ? "已保存，如需更换请重新填写" : "填入 16 位授权码"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required={!config?.hasPassword}
              />
            </label>
          </div>

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
              <span className="field-label">检查间隔（分钟）</span>
              <select
                className="select-minimal full"
                value={pollIntervalMin}
                onChange={(e) => setPollIntervalMin(Number(e.target.value))}
              >
                <option value={5}>每 5 分钟</option>
                <option value={10}>每 10 分钟</option>
                <option value={15}>每 15 分钟</option>
                <option value={30}>每 30 分钟</option>
                <option value={60}>每 60 分钟</option>
              </select>
            </label>
          </div>

          <div className="form-row-2">
            <label className="field">
              <span className="field-label">首次同步回看天数</span>
              <input
                type="number"
                className="input"
                min={1}
                max={30}
                value={lookbackDays}
                onChange={(e) => setLookbackDays(Number(e.target.value))}
              />
            </label>
            <label className="field">
              <span className="field-label">监听文件夹</span>
              <input
                type="text"
                className="input"
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
              />
            </label>
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

          <p className="security-note">
            授权码与 API Key 在服务端使用 AES-256-GCM 加密后存储，界面永不回传明文。
          </p>

          {feedback && (
            <div className={feedback.kind === "ok" ? "form-ok" : "form-error"}>
              {feedback.text}
            </div>
          )}

          <div className="modal-actions between">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={testing || !email.trim()}
              onClick={() => void handleTest()}
            >
              {testing ? "测试连接中…" : "测试连接"}
            </button>
            <div className="modal-actions-right">
              <button type="button" className="btn btn-ghost" onClick={onClose}>
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
          <p className="field-hint">
            未接入 IMAP 时，可直接粘贴一封面试或笔试邮件原文，系统会自动提取公司、岗位、时间与会议链接。
          </p>
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
                  <span className="parse-v">{preview.position}</span>
                </div>
                <div>
                  <span className="parse-k">阶段</span>
                  <span className="parse-v">{preview.stageName}</span>
                </div>
                <div>
                  <span className="parse-k">时间</span>
                  <span className="parse-v">
                    {preview.startAt ? new Date(preview.startAt).toLocaleString("zh-CN") : "未提取到具体时间"}
                  </span>
                </div>
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

/* ==================== 3. 新建日程 ==================== */
export function EventModal({
  preset,
  onClose,
  onCreated,
}: {
  preset?: { recordId?: string; company?: string; position?: string; stageName?: string };
  onClose: () => void;
  onCreated: (ev: ScheduleEvent) => void;
}) {
  const defaultStart = (() => {
    const d = new Date(Date.now() + 24 * 3600_000);
    d.setHours(14, 0, 0, 0);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
  })();

  const [company, setCompany] = useState(preset?.company || "");
  const [position, setPosition] = useState(preset?.position || "");
  const [stageName, setStageName] = useState(preset?.stageName || "一面");
  const [kind, setKind] = useState<EventKind>("interview");
  const [startLocal, setStartLocal] = useState(defaultStart);
  const [durationMin, setDurationMin] = useState(60);
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const startMs = Date.parse(startLocal);
    if (Number.isNaN(startMs)) {
      setError("请选择有效的时间。");
      return;
    }
    const startAt = new Date(startMs).toISOString();
    const endAt = new Date(startMs + durationMin * 60_000).toISOString();
    const title = position.trim()
      ? `${company.trim()} · ${position.trim()} ${stageName.trim()}`
      : `${company.trim()} · ${stageName.trim()}`;

    setBusy(true);
    try {
      const created = await api.createEvent({
        recordId: preset?.recordId,
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
    <ModalShell title="新建面试 / 笔试日程" onClose={onClose}>
      <form className="modal-form" onSubmit={handleSubmit}>
        <div className="form-row-2">
          <label className="field">
            <span className="field-label">公司</span>
            <input
              type="text"
              className="input"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              required
            />
          </label>
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

        <div className="form-row-2">
          <label className="field">
            <span className="field-label">轮次 / 阶段</span>
            <input
              type="text"
              className="input"
              value={stageName}
              onChange={(e) => setStageName(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">类型</span>
            <select
              className="select-minimal full"
              value={kind}
              onChange={(e) => setKind(e.target.value as EventKind)}
            >
              {EVENT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k === "interview"
                    ? "面试"
                    : k === "written_test"
                      ? "笔试"
                      : k === "assessment"
                        ? "测评"
                        : k === "offer"
                          ? "Offer 沟通"
                          : "其他跟进"}
                </option>
              ))}
            </select>
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
          <label className="field">
            <span className="field-label">预计时长</span>
            <select
              className="select-minimal full"
              value={durationMin}
              onChange={(e) => setDurationMin(Number(e.target.value))}
            >
              <option value={30}>30 分钟</option>
              <option value={45}>45 分钟</option>
              <option value={60}>1 小时</option>
              <option value={90}>1.5 小时</option>
              <option value={120}>2 小时</option>
            </select>
          </label>
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
          <button type="button" className="btn btn-ghost" onClick={onClose}>
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

/* ==================== 5. 面经记录写作 / 编辑 ==================== */
export function NoteModal({
  editing,
  preset,
  onClose,
  onSaved,
}: {
  editing: InterviewNote | null;
  preset?: { recordId?: string; company?: string; position?: string; stageName?: string };
  onClose: () => void;
  onSaved: (note: InterviewNote, isEdit: boolean) => void;
}) {
  const [company, setCompany] = useState(editing?.company || preset?.company || "");
  const [position, setPosition] = useState(editing?.position || preset?.position || "");
  const [stageName, setStageName] = useState(editing?.stageName || preset?.stageName || "一面");
  const [interviewedAt, setInterviewedAt] = useState(
    editing?.interviewedAt || new Date().toISOString().slice(0, 10),
  );
  const [feeling, setFeeling] = useState<NoteFeeling>(editing?.feeling || "normal");
  const [content, setContent] = useState(editing?.content || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
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
            recordId: preset?.recordId,
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
    <ModalShell title={editing ? "编辑面经记录" : "记录面经"} onClose={onClose} wide>
      <form className="modal-form" onSubmit={handleSubmit}>
        <div className="form-row-2">
          <label className="field">
            <span className="field-label">公司</span>
            <input
              type="text"
              className="input"
              placeholder="例如：字节跳动"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              required
            />
          </label>
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

        <div className="form-row-3">
          <label className="field">
            <span className="field-label">面试轮次</span>
            <input
              type="text"
              className="input"
              placeholder="一面 / 二面 / HR面"
              value={stageName}
              onChange={(e) => setStageName(e.target.value)}
              required
            />
          </label>
          <label className="field">
            <span className="field-label">面试日期</span>
            <input
              type="date"
              className="input"
              value={interviewedAt}
              onChange={(e) => setInterviewedAt(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">本轮体感</span>
            <select
              className="select-minimal full"
              value={feeling}
              onChange={(e) => setFeeling(e.target.value as NoteFeeling)}
            >
              <option value="great">发挥顺畅</option>
              <option value="normal">正常发挥</option>
              <option value="hard">难度偏高</option>
            </select>
          </label>
        </div>

        <label className="field">
          <span className="field-label">问题记录与复盘</span>
          <textarea
            className="textarea textarea-tall"
            rows={10}
            placeholder="记录问到的项目深挖、八股、算法题，以及需要补强的点…"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            required
          />
        </label>

        {error && <div className="form-error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
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
