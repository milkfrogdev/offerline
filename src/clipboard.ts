/**
 * 同步使用临时只读 textarea + execCommand('copy') 写入剪贴板。
 * 在非 HTTPS（window.isSecureContext === false，如公网 HTTP IP）或被限制 navigator.clipboard 的环境中，
 * 必须在点击事件同步调用栈内触发，才能保留浏览器瞬时用户激活权限。
 */
export function copyTextWithExecCommand(text: string): boolean {
  if (typeof document === "undefined" || !text) return false;
  const prevFocused =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "0";
  textarea.style.width = "2em";
  textarea.style.height = "2em";
  textarea.style.padding = "0";
  textarea.style.border = "none";
  textarea.style.outline = "none";
  textarea.style.boxShadow = "none";
  textarea.style.background = "transparent";
  textarea.style.opacity = "0";
  textarea.style.fontSize = "16px";

  const activeDialog = document.querySelector("dialog[open]");
  const host = activeDialog || document.body;
  host.appendChild(textarea);

  try {
    textarea.focus({ preventScroll: true });
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    return Boolean(document.execCommand("copy"));
  } catch {
    return false;
  } finally {
    textarea.remove();
    if (prevFocused && document.contains(prevFocused)) {
      prevFocused.focus({ preventScroll: true });
    }
  }
}

/**
 * 跨 HTTP/HTTPS 环境写入剪贴板，返回是否写入成功（不抛出异常）。
 */
export async function copyText(text: string): Promise<boolean> {
  if (!text) return false;
  if (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    typeof navigator !== "undefined" &&
    typeof navigator.clipboard?.writeText === "function"
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return copyTextWithExecCommand(text);
    }
  }
  return copyTextWithExecCommand(text);
}
