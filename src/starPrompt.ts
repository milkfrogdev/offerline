export const GITHUB_REPO_URL = "https://github.com/milkfrogdev/offerline";
export const GITHUB_ISSUES_URL = "https://github.com/milkfrogdev/offerline/issues";

export const FIRST_SEEN_STORAGE_KEY = "offerline.firstSeenAt";
export const DISMISSED_STORAGE_KEY = "offerline.starPromptDismissed";
export const STAR_PROMPT_DELAY_MS = 24 * 60 * 60 * 1000;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function getDefaultStorage(): StorageLike | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // 隐私模式或禁用存储时静默降级
  }
  return null;
}

function safeGet(storage: StorageLike | null, key: string): string | null {
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(storage: StorageLike | null, key: string, value: string): void {
  if (!storage) return;
  try {
    storage.setItem(key, value);
  } catch {
    // 忽略配额或隐私模式异常
  }
}

function parseTimestamp(raw: string | null | undefined, nowMs: number): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const asNum = /^\d+$/.test(trimmed) ? Number(trimmed) : Date.parse(trimmed);
  if (!Number.isFinite(asNum) || asNum <= 0) return null;
  // 防止异常超前系统时间永久锁死或负差值
  return Math.min(asNum, nowMs);
}

export function isStarPromptDismissed(storage: StorageLike | null = getDefaultStorage()): boolean {
  return safeGet(storage, DISMISSED_STORAGE_KEY) === "1";
}

export function dismissStarPrompt(storage: StorageLike | null = getDefaultStorage()): void {
  safeSet(storage, DISMISSED_STORAGE_KEY, "1");
}

/**
 * 确定用户首次使用时间：同时兼容本地 JSON 模式与服务端模式。
 * 优先取 localStorage 首次记录与账号 createdAt 中较早的有效时间，保证：
 * 1) 全新本地或线上用户自注册/首登起满 24 小时后弹出；
 * 2) 老用户升级后首次打开即满足条件，叉掉或点 Star 后永久静默。
 */
export function resolveFirstSeenAt(
  userCreatedAt?: string,
  nowMs: number = Date.now(),
  storage: StorageLike | null = getDefaultStorage(),
): number {
  const rawStored = safeGet(storage, FIRST_SEEN_STORAGE_KEY);
  const stored = parseTimestamp(rawStored, nowMs);
  const created = parseTimestamp(userCreatedAt, nowMs);

  let anchor: number;
  if (stored !== null && created !== null) {
    anchor = Math.min(stored, created);
  } else if (stored !== null) {
    anchor = stored;
  } else if (created !== null) {
    anchor = created;
  } else {
    anchor = nowMs;
  }

  if (rawStored !== String(anchor)) {
    safeSet(storage, FIRST_SEEN_STORAGE_KEY, String(anchor));
  }
  return anchor;
}

/**
 * 返回距离弹出 Star 提示还剩多少毫秒：
 * - null：已永久关闭，不再弹出；
 * - 0：已满 24 小时，可以弹出；
 * - >0：还需等待的毫秒数。
 */
export function getStarPromptRemainingMs(
  userCreatedAt?: string,
  nowMs: number = Date.now(),
  storage: StorageLike | null = getDefaultStorage(),
): number | null {
  if (isStarPromptDismissed(storage)) return null;
  const anchor = resolveFirstSeenAt(userCreatedAt, nowMs, storage);
  const elapsed = nowMs - anchor;
  if (elapsed >= STAR_PROMPT_DELAY_MS) return 0;
  return STAR_PROMPT_DELAY_MS - elapsed;
}
