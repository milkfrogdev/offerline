import { describe, expect, it } from "vitest";
import {
  DISMISSED_STORAGE_KEY,
  dismissStarPrompt,
  FIRST_SEEN_STORAGE_KEY,
  getStarPromptRemainingMs,
  isStarPromptDismissed,
  resolveFirstSeenAt,
  STAR_PROMPT_DELAY_MS,
  type StorageLike,
} from "../src/starPrompt";

function createMemoryStorage(initial: Record<string, string> = {}): StorageLike & {
  dump: Record<string, string>;
} {
  const dump: Record<string, string> = { ...initial };
  return {
    dump,
    getItem(key: string) {
      return Object.prototype.hasOwnProperty.call(dump, key) ? dump[key] : null;
    },
    setItem(key: string, value: string) {
      dump[key] = value;
    },
  };
}

describe("starPrompt", () => {
  it("records first seen time for brand-new user and waits 24 hours", () => {
    const storage = createMemoryStorage();
    const t0 = Date.parse("2026-11-26T08:00:00.000Z");

    const remainingAtStart = getStarPromptRemainingMs("2026-11-26T08:00:00.000Z", t0, storage);
    expect(remainingAtStart).toBe(STAR_PROMPT_DELAY_MS);
    expect(storage.dump[FIRST_SEEN_STORAGE_KEY]).toBe(String(t0));

    const remainingAfter12h = getStarPromptRemainingMs(
      "2026-11-26T08:00:00.000Z",
      t0 + 12 * 60 * 60 * 1000,
      storage,
    );
    expect(remainingAfter12h).toBe(12 * 60 * 60 * 1000);

    const remainingAfter24h = getStarPromptRemainingMs(
      "2026-11-26T08:00:00.000Z",
      t0 + STAR_PROMPT_DELAY_MS,
      storage,
    );
    expect(remainingAfter24h).toBe(0);
  });

  it("triggers immediately for existing accounts older than 24 hours and stays dismissed forever", () => {
    const storage = createMemoryStorage();
    const now = Date.parse("2026-11-26T16:00:00.000Z");
    const createdTwoDaysAgo = "2026-11-24T10:00:00.000Z";

    expect(getStarPromptRemainingMs(createdTwoDaysAgo, now, storage)).toBe(0);
    expect(isStarPromptDismissed(storage)).toBe(false);

    dismissStarPrompt(storage);
    expect(isStarPromptDismissed(storage)).toBe(true);
    expect(storage.dump[DISMISSED_STORAGE_KEY]).toBe("1");
    expect(getStarPromptRemainingMs(createdTwoDaysAgo, now + 30 * STAR_PROMPT_DELAY_MS, storage)).toBeNull();
  });

  it("works in pure local mode without user.createdAt and clamps invalid future timestamps", () => {
    const futureMs = Date.parse("2026-11-30T00:00:00.000Z");
    const now = Date.parse("2026-11-26T16:00:00.000Z");
    const storage = createMemoryStorage({ [FIRST_SEEN_STORAGE_KEY]: String(futureMs) });

    const anchor = resolveFirstSeenAt(undefined, now, storage);
    expect(anchor).toBe(now);
    expect(getStarPromptRemainingMs(undefined, now + STAR_PROMPT_DELAY_MS + 1, storage)).toBe(0);
  });
});
