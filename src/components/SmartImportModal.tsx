import React, { useMemo, useState } from "react";
import { normalizeCompanyName } from "../../shared/companies";
import {
  BATCH_TIMELINE_IMPORT_PROMPT,
  looksLikeJsonPayload,
  parseImportedPipelineRecords,
  type ImportedTimelineRecord,
} from "../../shared/import-parser";
import type { ApplicationRecord, MailAccountPublic } from "../../shared/types";
import { api } from "../api";
import { copyText } from "../clipboard";
import { readImportFileAsText } from "../spreadsheet";
import { CompanyLogo } from "./CompanyLogo";
import { IconCopy, IconExternal, IconSpark, IconUpload } from "./Icons";
import {
  detectLlmPreset,
  LLM_PRESET_ORDER,
  LLM_PRESETS,
  type LlmProviderKey,
} from "./LlmConfigPanel";
import { ModalShell } from "./Modals";

type ConflictPolicy = "skip" | "update" | "append";

interface PreviewRow {
  item: ImportedTimelineRecord;
  selected: boolean;
  matchedRecord: ApplicationRecord | null;
}

const SAMPLE_BULK_TEXT = `字节跳动-基础架构后端研发：一面已过，二面周四下午两点
腾讯-后台开发：简历评估挂了
华为-AI工程师：笔试通过，一面中，链接 https://career.huawei.com
科大讯飞-大模型研发：已拿正式offer，正在谈薪`;

function findExistingRecord(
  records: readonly ApplicationRecord[],
  company: string,
  position: string,
): ApplicationRecord | null {
  const normC = (normalizeCompanyName(company) || company.trim()).toLowerCase();
  const normP = position.trim().toLowerCase();
  return (
    records.find((r) => {
      const rc = (normalizeCompanyName(r.company) || r.company.trim()).toLowerCase();
      return rc === normC && r.position.trim().toLowerCase() === normP;
    }) || null
  );
}

export function SmartImportModal({
  records,
  mailConfig,
  onClose,
  onMailConfigUpdated,
  onImported,
}: {
  records: ApplicationRecord[];
  mailConfig: MailAccountPublic | null;
  onClose: () => void;
  onMailConfigUpdated: (cfg: MailAccountPublic) => void;
  onImported: (message: string) => Promise<void>;
}) {
  const [step, setStep] = useState<"input" | "preview">("input");
  const [rawText, setRawText] = useState("");
  const [fileSummary, setFileSummary] = useState("");
  const [readingFile, setReadingFile] = useState(false);

  const hasSavedLlm = Boolean(mailConfig?.hasLlmKey && mailConfig.llmBaseUrl && mailConfig.llmModel);
  const [showLlmEditor, setShowLlmEditor] = useState(!hasSavedLlm);
  const [llmPreset, setLlmPreset] = useState<LlmProviderKey>(() =>
    detectLlmPreset(mailConfig?.llmBaseUrl || ""),
  );
  const [llmBaseUrl, setLlmBaseUrl] = useState(
    mailConfig?.llmBaseUrl || LLM_PRESETS.deepseek.baseUrl,
  );
  const [llmModel, setLlmModel] = useState(mailConfig?.llmModel || LLM_PRESETS.deepseek.model);
  const [llmApiKey, setLlmApiKey] = useState("");
  const [saveLlmConfig, setSaveLlmConfig] = useState(!hasSavedLlm);

  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [manualCopyText, setManualCopyText] = useState<string | null>(null);

  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [conflictPolicy, setConflictPolicy] = useState<ConflictPolicy>("skip");

  const isJsonInput = useMemo(() => looksLikeJsonPayload(rawText), [rawText]);

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

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setFeedback(null);
    setReadingFile(true);
    try {
      const res = await readImportFileAsText(file);
      setRawText(res.text);
      setFileSummary(res.summary);
    } catch (err) {
      setFeedback({
        kind: "err",
        text: err instanceof Error ? err.message : "读取文件失败，请确认格式为 Excel / CSV / TXT。",
      });
    } finally {
      setReadingFile(false);
    }
  }

  async function handleCopyPrompt() {
    setFeedback(null);
    setManualCopyText(null);
    const content = rawText.trim()
      ? `${BATCH_TIMELINE_IMPORT_PROMPT}${rawText.trim()}`
      : `${BATCH_TIMELINE_IMPORT_PROMPT}[在这里粘贴你的 Excel / CSV / 备忘录投递清单]`;
    const ok = await copyText(content);
    if (ok) {
      setFeedback({
        kind: "ok",
        text: rawText.trim()
          ? "已复制提示词与内容，贴到豆包 / DeepSeek 网页版后把 JSON 粘回上方框内即可。"
          : "已复制提示词，贴给豆包 / DeepSeek 网页版整理后把 JSON 粘回上方框内。",
      });
    } else {
      setManualCopyText(content);
      setFeedback({
        kind: "err",
        text: "当前浏览器阻止自动复制，请在下方选区按 Ctrl+C 手动复制：",
      });
    }
  }

  function enterPreview(items: ImportedTimelineRecord[]) {
    setPreviewRows(
      items.map((item) => ({
        item,
        selected: true,
        matchedRecord: findExistingRecord(records, item.company, item.position),
      })),
    );
    setStep("preview");
    setFeedback(null);
  }

  async function handleParse() {
    setFeedback(null);
    const trimmed = rawText.trim();
    if (!trimmed) {
      setFeedback({ kind: "err", text: "请先上传表格或粘贴待解析内容。" });
      return;
    }

    // Zero-API-Key fast path when user pasted external LLM JSON back
    if (isJsonInput) {
      const parsed = parseImportedPipelineRecords(trimmed);
      if (!parsed.ok) {
        setFeedback({ kind: "err", text: parsed.error });
        return;
      }
      enterPreview(parsed.items);
      return;
    }

    const useTransientOrEditedLlm = showLlmEditor || !hasSavedLlm;
    if (useTransientOrEditedLlm && (!llmBaseUrl.trim() || !llmModel.trim() || (!llmApiKey.trim() && !hasSavedLlm))) {
      setFeedback({
        kind: "err",
        text: "填写模型 API Key 即可一键解析；不想填 Key 可点上方「复制提示词（免 API Key 导入）」免费转换。",
      });
      return;
    }

    setParsing(true);
    try {
      const res = await api.smartParseRecords({
        text: trimmed,
        ...(useTransientOrEditedLlm
          ? {
              llm: {
                baseUrl: llmBaseUrl.trim(),
                model: llmModel.trim(),
                apiKey: llmApiKey.trim() || undefined,
              },
              saveLlmConfig,
            }
          : {}),
      });
      if (res.mailConfig) {
        onMailConfigUpdated(res.mailConfig);
        setLlmApiKey("");
      }
      enterPreview(res.items);
    } catch (err) {
      setFeedback({
        kind: "err",
        text: err instanceof Error ? err.message : "智能解析失败，请重试。",
      });
    } finally {
      setParsing(false);
    }
  }

  const actionableRows = useMemo(
    () =>
      previewRows.filter(
        (row) => row.selected && !(row.matchedRecord && conflictPolicy === "skip"),
      ),
    [previewRows, conflictPolicy],
  );

  const conflictCount = useMemo(
    () => previewRows.filter((row) => row.selected && row.matchedRecord).length,
    [previewRows],
  );

  async function handleConfirmImport() {
    if (!actionableRows.length) return;
    setFeedback(null);
    setImporting(true);
    try {
      const toCreate: ImportedTimelineRecord[] = [];
      let updatedCount = 0;

      for (const row of actionableRows) {
        if (row.matchedRecord && conflictPolicy === "update") {
          await api.updateRecord(row.matchedRecord.id, {
            stages: row.item.stages,
            ...(row.item.url && !row.matchedRecord.url ? { url: row.item.url } : {}),
          });
          updatedCount++;
        } else {
          toCreate.push(row.item);
        }
      }

      let createdCount = 0;
      if (toCreate.length > 0) {
        const res = await api.importRecords(toCreate, "merge");
        createdCount = res.count;
      }

      const summaryParts: string[] = [];
      if (createdCount > 0) summaryParts.push(`新增 ${createdCount} 条`);
      if (updatedCount > 0) summaryParts.push(`更新 ${updatedCount} 条`);
      await onImported(
        summaryParts.length > 0 ? `智能导入完成：${summaryParts.join("，")}` : "导入完成",
      );
      onClose();
    } catch (err) {
      setFeedback({
        kind: "err",
        text: err instanceof Error ? err.message : "导入失败，请重试。",
      });
    } finally {
      setImporting(false);
    }
  }

  return (
    <ModalShell
      title={step === "input" ? "智能导入投递记录" : "确认导入到时间线"}
      onClose={onClose}
      wide
    >
      {step === "input" ? (
        <div className="modal-form">
          <div className="field-head-inline">
            <div className="inline-actions-pair">
              <label className="btn btn-soft btn-sm file-btn">
                <IconUpload size={13} />
                <span>{readingFile ? "读取中…" : "上传 Excel / CSV / TXT"}</span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv,.tsv,.txt,.md,.json"
                  hidden
                  onChange={(e) => void handleFileSelect(e)}
                />
              </label>
              <button
                type="button"
                className="btn btn-soft btn-sm"
                onClick={() => {
                  setRawText(SAMPLE_BULK_TEXT);
                  setFileSummary("");
                  setFeedback(null);
                  setManualCopyText(null);
                }}
              >
                <IconSpark size={13} />
                <span>填入示例</span>
              </button>
            </div>
            <button
              type="button"
              className="btn btn-soft btn-sm"
              onClick={() => void handleCopyPrompt()}
              data-tip="复制提示词与内容，贴到网页版 AI 转 JSON 后粘回"
            >
              <IconCopy size={13} />
              <span>复制提示词（免 API Key 导入）</span>
            </button>
          </div>
          {fileSummary && <div className="field-micro-hint">{fileSummary}</div>}

          <textarea
            className="textarea"
            rows={7}
            placeholder="贴入投递表格、备忘录文本，或贴回豆包 / DeepSeek 输出的 JSON 数组…"
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            aria-label="待解析投递文本或 JSON"
          />

          {!isJsonInput && (
            <div className="smart-llm-bar">
              <div className="field-head-inline">
                <span className="field-label">
                  {hasSavedLlm && !showLlmEditor
                    ? `直接解析模型：${mailConfig?.llmModel}`
                    : "大模型 API 配置（选填，也可点上方「复制提示词」免 API Key 导入）"}
                </span>
                {hasSavedLlm && (
                  <button
                    type="button"
                    className="btn-link muted"
                    onClick={() => setShowLlmEditor((v) => !v)}
                  >
                    {showLlmEditor ? "收起配置" : "切换模型"}
                  </button>
                )}
              </div>

              {(showLlmEditor || !hasSavedLlm) && (
                <div className="smart-llm-fields">
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

                  <div className="form-row-3">
                    <label className="field">
                      <span className="field-label">API Base URL</span>
                      <input
                        type="url"
                        className="input input-sm"
                        placeholder={LLM_PRESETS[llmPreset].placeholderUrl}
                        value={llmBaseUrl}
                        onChange={(e) => {
                          setLlmBaseUrl(e.target.value);
                          setLlmPreset(detectLlmPreset(e.target.value));
                        }}
                      />
                    </label>
                    <label className="field">
                      <span className="field-label">模型名称</span>
                      <input
                        type="text"
                        className="input input-sm"
                        placeholder={LLM_PRESETS[llmPreset].placeholderModel}
                        value={llmModel}
                        onChange={(e) => setLlmModel(e.target.value)}
                      />
                    </label>
                    <label className="field">
                      <span className="field-label">API Key</span>
                      <input
                        type="password"
                        className="input input-sm"
                        placeholder={hasSavedLlm ? "已保存，留空沿用" : "sk-..."}
                        value={llmApiKey}
                        onChange={(e) => setLlmApiKey(e.target.value)}
                      />
                    </label>
                  </div>

                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={saveLlmConfig}
                      onChange={(e) => setSaveLlmConfig(e.target.checked)}
                    />
                    <span>记住该模型配置（AES-256-GCM 加密保存）</span>
                  </label>
                </div>
              )}
            </div>
          )}

          {feedback && (
            <div className={feedback.kind === "ok" ? "form-ok" : "form-error"}>
              {feedback.text}
            </div>
          )}

          {manualCopyText && (
            <textarea
              className="textarea mono"
              rows={4}
              readOnly
              value={manualCopyText}
              onFocus={(e) => e.currentTarget.select()}
              onClick={(e) => e.currentTarget.select()}
              aria-label="请按 Ctrl+C 复制提示词"
            />
          )}

          <div className="modal-actions">
            <button type="button" className="btn btn-soft" onClick={onClose}>
              取消
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={parsing || !rawText.trim()}
              onClick={() => void handleParse()}
            >
              {parsing
                ? "解析中…"
                : isJsonInput
                  ? "识别 JSON 并预览"
                  : "一键解析并预览"}
            </button>
          </div>
        </div>
      ) : (
        <div className="modal-form">
          <div className="field-head-inline">
            <span className="field-label">
              共识别 {previewRows.length} 条记录
            </span>
            {conflictCount > 0 && (
              <div className="inline-actions-pair">
                <span className="field-micro-hint" style={{ margin: 0 }}>
                  已有同名岗位：
                </span>
                {(
                  [
                    { key: "skip", label: "跳过" },
                    { key: "update", label: "更新进度" },
                    { key: "append", label: "仍然新增" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    className={`stage-quick-chip${conflictPolicy === opt.key ? " active" : ""}`}
                    onClick={() => setConflictPolicy(opt.key)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="smart-preview-list">
            {previewRows.map((row, idx) => {
              const skipped = Boolean(row.matchedRecord && conflictPolicy === "skip");
              return (
                <label
                  key={`${row.item.company}-${row.item.position}-${idx}`}
                  className={`smart-preview-row${skipped ? " is-muted" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={row.selected}
                    onChange={(e) => {
                      const next = e.target.checked;
                      setPreviewRows((prev) =>
                        prev.map((r, i) => (i === idx ? { ...r, selected: next } : r)),
                      );
                    }}
                  />
                  <div className="smart-preview-body">
                    <div className="smart-preview-head">
                      <CompanyLogo company={row.item.company} url={row.item.url} size="sm" />
                      <span className="smart-preview-company">{row.item.company}</span>
                      <span className="smart-preview-pos">{row.item.position}</span>
                      {row.matchedRecord && (
                        <span className="smart-preview-dup">
                          {conflictPolicy === "update"
                            ? "将更新已有进度"
                            : conflictPolicy === "skip"
                              ? "已存在，跳过"
                              : "已有同名"}
                        </span>
                      )}
                    </div>
                    <div className="smart-preview-stages">
                      {row.item.stages.map((st, sIdx) => (
                        <span
                          key={`${st.id}-${sIdx}`}
                          className={`smart-stage-pill st-${st.status}`}
                        >
                          {st.name}
                        </span>
                      ))}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>

          {feedback && (
            <div className={feedback.kind === "ok" ? "form-ok" : "form-error"}>
              {feedback.text}
            </div>
          )}

          <div className="modal-actions between">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setStep("input");
                setFeedback(null);
              }}
            >
              返回修改
            </button>
            <div className="modal-actions-right">
              <button type="button" className="btn btn-soft" onClick={onClose}>
                取消
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={importing || actionableRows.length === 0}
                onClick={() => void handleConfirmImport()}
              >
                {importing ? "导入中…" : `导入 ${actionableRows.length} 条到时间线`}
              </button>
            </div>
          </div>
        </div>
      )}
    </ModalShell>
  );
}
