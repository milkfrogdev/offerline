import React, { useEffect, useState } from "react";
import type { MailAccountPublic } from "../../shared/types";
import { api } from "../api";
import { IconExternal } from "./Icons";

export type LlmProviderKey = "deepseek" | "qwen" | "zhipu" | "kimi" | "openai" | "custom";

export const LLM_PRESET_ORDER: LlmProviderKey[] = [
  "deepseek",
  "qwen",
  "zhipu",
  "kimi",
  "openai",
  "custom",
];

export const LLM_PRESETS: Record<
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
    guideLabel: "获取 Key",
    tip: "支持原生 JSON 输出，成本极低",
  },
  qwen: {
    label: "通义千问",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-plus",
    placeholderUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    placeholderModel: "qwen-plus",
    guideUrl: "https://bailian.console.aliyun.com/?apiKey=1",
    guideLabel: "阿里云百炼",
    tip: "阿里云百炼 OpenAI 兼容端点",
  },
  zhipu: {
    label: "智谱 GLM",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    model: "glm-4-flash",
    placeholderUrl: "https://open.bigmodel.cn/api/paas/v4",
    placeholderModel: "glm-4-flash",
    guideUrl: "https://open.bigmodel.cn/usercenter/apikeys",
    guideLabel: "智谱控制台",
    tip: "glm-4-flash 响应快，免费额度高",
  },
  kimi: {
    label: "月之暗面 Kimi",
    baseUrl: "https://api.moonshot.cn/v1",
    model: "moonshot-v1-8k",
    placeholderUrl: "https://api.moonshot.cn/v1",
    placeholderModel: "moonshot-v1-8k",
    guideUrl: "https://platform.moonshot.cn/console/api-keys",
    guideLabel: "Moonshot",
    tip: "Moonshot OpenAI 兼容接口",
  },
  openai: {
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    placeholderUrl: "https://api.openai.com/v1",
    placeholderModel: "gpt-4o-mini",
    guideUrl: "https://platform.openai.com/api-keys",
    guideLabel: "OpenAI",
    tip: "需服务器出站网络可访问 api.openai.com",
  },
  custom: {
    label: "自定义兼容",
    baseUrl: "",
    model: "",
    placeholderUrl: "https://your-gateway.example/v1",
    placeholderModel: "输入模型 ID",
    tip: "支持硅基流动、火山方舟、OpenRouter 等兼容接口",
  },
};

export function detectLlmPreset(baseUrl: string): LlmProviderKey {
  const lower = baseUrl.trim().toLowerCase();
  if (!lower) return "deepseek";
  if (lower.includes("deepseek.com")) return "deepseek";
  if (lower.includes("dashscope.aliyuncs.com")) return "qwen";
  if (lower.includes("bigmodel.cn")) return "zhipu";
  if (lower.includes("moonshot.cn")) return "kimi";
  if (lower.includes("api.openai.com")) return "openai";
  return "custom";
}

export function LlmConfigPanel({
  config,
  onConfigUpdated,
  onCancel,
}: {
  config: MailAccountPublic | null;
  onConfigUpdated: (cfg: MailAccountPublic) => void;
  onCancel?: () => void;
}) {
  const [llmPreset, setLlmPreset] = useState<LlmProviderKey>(() =>
    detectLlmPreset(config?.llmBaseUrl || ""),
  );
  const [llmEnabled, setLlmEnabled] = useState(config?.llmEnabled ?? false);
  const [llmBaseUrl, setLlmBaseUrl] = useState(
    config?.llmBaseUrl || LLM_PRESETS.deepseek.baseUrl,
  );
  const [llmModel, setLlmModel] = useState(config?.llmModel || LLM_PRESETS.deepseek.model);
  const [llmApiKey, setLlmApiKey] = useState("");
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    if (!config) return;
    setLlmEnabled(config.llmEnabled);
    if (config.llmBaseUrl) {
      setLlmBaseUrl(config.llmBaseUrl);
      setLlmPreset(detectLlmPreset(config.llmBaseUrl));
    }
    if (config.llmModel) setLlmModel(config.llmModel);
  }, [config]);

  function selectPreset(p: LlmProviderKey) {
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

  async function handleTest() {
    setFeedback(null);
    setTesting(true);
    try {
      const res = await api.testLlmConfig({
        baseUrl: llmBaseUrl.trim(),
        model: llmModel.trim(),
        apiKey: llmApiKey.trim() || undefined,
      });
      setFeedback({
        kind: "ok",
        text: `连通成功，响应耗时 ${res.latencyMs}ms（${res.jsonMode === "native" ? "原生 JSON 模式" : "兼容提取模式"}）`,
      });
    } catch (err) {
      setFeedback({
        kind: "err",
        text: err instanceof Error ? err.message : "大模型连通性测试失败。",
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
        text: llmEnabled ? "大模型配置已加密保存，邮箱与导入均可使用" : "已关闭大模型后台自动增强",
      });
    } catch (err) {
      setFeedback({
        kind: "err",
        text: err instanceof Error ? err.message : "保存模型配置失败。",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="modal-form" onSubmit={handleSave}>
      <div className="field">
        <span className="field-label">模型预设</span>
        <div className="provider-row">
          {LLM_PRESET_ORDER.map((p) => (
            <button
              key={p}
              type="button"
              className={`provider-chip${llmPreset === p ? " active" : ""}`}
              onClick={() => selectPreset(p)}
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
          <span>启用个人大模型增强（未配 Key 时仍可用本地规则或复制提示词导入）</span>
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
        <span className="field-label">API Key</span>
        <input
          type="password"
          className="input"
          placeholder={config?.hasLlmKey ? "已保存，留空不修改" : "粘贴个人 API Key（sk-...）"}
          value={llmApiKey}
          onChange={(e) => setLlmApiKey(e.target.value)}
          required={llmEnabled && !config?.hasLlmKey}
        />
      </label>

      <p className="security-note">
        常规垃圾与拒信由本地规则 0 Token 拦截；API Key 加密存服务端，超时回退本地规则
      </p>

      {feedback && (
        <div className={feedback.kind === "ok" ? "form-ok" : "form-error"}>{feedback.text}</div>
      )}

      <div className="modal-actions between">
        <button
          type="button"
          className="btn btn-soft"
          disabled={testing || !llmBaseUrl.trim() || !llmModel.trim()}
          onClick={() => void handleTest()}
        >
          {testing ? "测试连通中…" : "测试模型连通"}
        </button>
        <div className="modal-actions-right">
          {onCancel && (
            <button type="button" className="btn btn-soft" onClick={onCancel}>
              取消
            </button>
          )}
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "保存中…" : "保存模型配置"}
          </button>
        </div>
      </div>
    </form>
  );
}
