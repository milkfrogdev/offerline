import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { extractJsonValue } from "../shared/import-parser.js";
import { isPrivateOrReservedIp } from "./brand-icon.js";

export interface LlmEndpointConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
}

export interface LlmJsonCallResult {
  ok: true;
  data: Record<string, unknown>;
  latencyMs: number;
  normalizedEndpoint: string;
  jsonMode: "native" | "fallback";
}

export interface LlmJsonCallError {
  ok: false;
  error: string;
  status?: number;
}

export type LlmCallOutcome = LlmJsonCallResult | LlmJsonCallError;

export function isLocalLlmAllowed(): boolean {
  return process.env.ALLOW_LOCAL_LLM === "true";
}

/**
 * 智能归一化任意 OpenAI 兼容 Base URL 到最终 chat/completions 地址：
 * - https://api.deepseek.com                   -> https://api.deepseek.com/v1/chat/completions
 * - https://api.deepseek.com/v1                -> https://api.deepseek.com/v1/chat/completions
 * - https://api.deepseek.com/v1/chat/completions -> 原样保留，绝不重复拼接
 * - https://open.bigmodel.cn/api/paas/v4       -> https://open.bigmodel.cn/api/paas/v4/chat/completions
 * - https://dashscope.aliyuncs.com/compatible-mode/v1 -> .../compatible-mode/v1/chat/completions
 * - https://generativelanguage.googleapis.com/v1beta/openai -> .../v1beta/openai/chat/completions
 */
export function normalizeLlmEndpoint(rawBaseUrl: string): string | null {
  const trimmed = (rawBaseUrl || "").trim();
  if (!trimmed) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }
  if (parsed.username || parsed.password) {
    return null;
  }

  const cleanPath = parsed.pathname.replace(/\/+$/, "");
  if (/\/chat\/completions$/i.test(cleanPath)) {
    return `${parsed.origin}${cleanPath}${parsed.search}`;
  }

  // If user already supplied a versioned or openai-compatible path segment (/v1, /v3, /v4, /openai, /compatible-mode/v1)
  if (/\/(?:v\d+[a-z0-9-]*|openai|compatible-mode(?:\/v\d+)?)$/i.test(cleanPath)) {
    return `${parsed.origin}${cleanPath}/chat/completions${parsed.search}`;
  }

  // Bare origin or unversioned prefix -> standard /v1/chat/completions
  return `${parsed.origin}${cleanPath}/v1/chat/completions${parsed.search}`;
}

export async function assertSafeLlmUrl(
  endpoint: string,
  allowLocal = isLocalLlmAllowed(),
): Promise<{ ok: true } | { ok: false; error: string }> {
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    return { ok: false, error: "API Base URL 格式无效，请填写以 https:// 开头的完整地址。" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "仅支持 http:// 或 https:// 协议的模型接口。" };
  }

  if (allowLocal) {
    return { ok: true };
  }

  const host = parsed.hostname.trim().toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    return {
      ok: false,
      error:
        "出于安全限制，默认禁止请求本机或内网模型地址（如需连本地 Ollama，请在服务端配置 ALLOW_LOCAL_LLM=true）。",
    };
  }

  if (isIP(host)) {
    if (isPrivateOrReservedIp(host)) {
      return {
        ok: false,
        error:
          "出于安全限制，默认禁止请求内网或保留 IP（如需连本地模型，请在服务端配置 ALLOW_LOCAL_LLM=true）。",
      };
    }
    return { ok: true };
  }

  try {
    const addrs = await lookup(host, { all: true });
    if (!addrs.length || addrs.some((a) => isPrivateOrReservedIp(a.address))) {
      return {
        ok: false,
        error: "该接口域名解析到内网或不可信地址，已被安全策略拦截。",
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: `无法解析模型接口域名 ${host}，请检查 Base URL。` };
  }
}

/**
 * 容错提取模型返回的 JSON 对象：复用共享 extractJsonValue 并兼容数组包壳。
 */
export function extractJsonObject(raw: string): Record<string, unknown> | null {
  const val = extractJsonValue(raw);
  if (!val) return null;
  if (Array.isArray(val)) return { records: val };
  if (typeof val === "object") return val as Record<string, unknown>;
  return null;
}

function formatLlmHttpError(status: number, bodyText: string): string {
  const snippet = bodyText.replace(/\s+/g, " ").slice(0, 140);
  if (status === 401 || status === 403) {
    return "API Key 认证失败或无权访问该模型，请检查密钥与账户权限。";
  }
  if (status === 404) {
    return "接口路径或模型名称不存在（404），请检查 Base URL 与模型名称。";
  }
  if (status === 429) {
    return "触发上游限流或账户余额不足（429），请稍后重试或检查额度。";
  }
  if (status >= 500) {
    return `模型服务端暂时异常（HTTP ${status}），请稍后再试。`;
  }
  return `模型接口返回错误（HTTP ${status}${snippet ? `：${snippet}` : ""}）。`;
}

export async function callOpenAiCompatibleJson(
  config: LlmEndpointConfig,
  messages: { role: "system" | "user"; content: string }[],
  options: { timeoutMs?: number; maxTokens?: number; allowLocal?: boolean } = {},
): Promise<LlmCallOutcome> {
  const endpoint = normalizeLlmEndpoint(config.baseUrl);
  if (!endpoint) {
    return { ok: false, error: "API Base URL 格式无效，请填写以 https:// 开头的完整地址。" };
  }
  if (!config.model.trim()) {
    return { ok: false, error: "请填写模型名称（例如 deepseek-chat）。" };
  }
  if (!config.apiKey.trim()) {
    return { ok: false, error: "请填写 API Key。" };
  }

  const ssrf = await assertSafeLlmUrl(endpoint, options.allowLocal);
  if (!ssrf.ok) {
    return { ok: false, error: ssrf.error };
  }

  const timeoutMs = options.timeoutMs ?? 15_000;
  const startedAt = Date.now();

  const attemptOnce = async (useJsonMode: boolean) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const payload: Record<string, unknown> = {
        model: config.model.trim(),
        temperature: 0,
        messages,
      };
      if (useJsonMode) {
        payload.response_format = { type: "json_object" };
      }
      if (options.maxTokens) {
        payload.max_tokens = options.maxTokens;
      }

      const resp = await fetch(endpoint, {
        method: "POST",
        redirect: "error",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey.trim()}`,
        },
        signal: controller.signal,
        body: JSON.stringify(payload),
      });

      const rawText = await resp.text();
      return { ok: resp.ok, status: resp.status, rawText };
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    let jsonMode: "native" | "fallback" = "native";
    let res = await attemptOnce(true);

    // Some third-party OpenAI relays / older models reject response_format with 400/422 -> auto-retry without it
    if (!res.ok && (res.status === 400 || res.status === 422)) {
      jsonMode = "fallback";
      res = await attemptOnce(false);
    }

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: formatLlmHttpError(res.status, res.rawText),
      };
    }

    let parsedBody: {
      choices?: { message?: { content?: string | { type?: string; text?: string }[] } }[];
    };
    try {
      parsedBody = JSON.parse(res.rawText) as typeof parsedBody;
    } catch {
      return { ok: false, error: "模型接口返回的响应不是合法 JSON，请确认 Base URL 是否指向 OpenAI 兼容接口。" };
    }

    const msgContent = parsedBody.choices?.[0]?.message?.content;
    const textContent =
      typeof msgContent === "string"
        ? msgContent
        : Array.isArray(msgContent)
          ? msgContent.map((p) => p.text || "").join("\n")
          : "";

    const data = extractJsonObject(textContent);
    if (!data) {
      return { ok: false, error: "模型已响应但未返回有效 JSON 结构，请尝试切换支持结构化输出的对话模型。" };
    }

    return {
      ok: true,
      data,
      latencyMs: Date.now() - startedAt,
      normalizedEndpoint: endpoint,
      jsonMode,
    };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    if (/abort/i.test(raw)) {
      return { ok: false, error: `请求模型接口超时（>${Math.round(timeoutMs / 1000)}秒），请检查网络或更换节点。` };
    }
    return { ok: false, error: `连接模型接口失败：${raw.slice(0, 140)}` };
  }
}

export async function testLlmConnection(
  config: LlmEndpointConfig,
  allowLocal = isLocalLlmAllowed(),
): Promise<
  | { ok: true; latencyMs: number; normalizedEndpoint: string; jsonMode: "native" | "fallback" }
  | { ok: false; error: string }
> {
  const res = await callOpenAiCompatibleJson(
    config,
    [
      {
        role: "system",
        content: '仅返回 JSON：{"ok":true}',
      },
      {
        role: "user",
        content: "ping",
      },
    ],
    { timeoutMs: 12_000, maxTokens: 32, allowLocal },
  );

  if (!res.ok) {
    return { ok: false, error: res.error };
  }
  return {
    ok: true,
    latencyMs: res.latencyMs,
    normalizedEndpoint: res.normalizedEndpoint,
    jsonMode: res.jsonMode,
  };
}
