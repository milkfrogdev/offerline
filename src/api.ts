export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    throw new ApiError("服务器未返回有效响应，请重试。", res.status, "INVALID_RESPONSE");
  }
  if (!res.ok) {
    throw new ApiError(
      String(data.error || "请求失败，请重试。"),
      res.status,
      String(data.code || "ERROR"),
    );
  }
  return data as T;
}

export function downloadText(content: string, filename: string, mime = "application/json;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
