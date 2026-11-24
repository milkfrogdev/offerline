import { beforeEach, describe, expect, it, vi } from "vitest";
import { encryptSecret, deriveMasterKey } from "../server/security";
import { JsonFileStore } from "../server/store";

const mockSearch = vi.fn();
const mockFetchOne = vi.fn();
const mockLockRelease = vi.fn();
const mockGetMailboxLock = vi.fn();
const mockConnect = vi.fn();
const mockLogout = vi.fn();
const mockMailboxState = { uidNext: 1501, exists: 1500 };

vi.mock("imapflow", () => ({
  ImapFlow: class MockImapFlow {
    mailbox = mockMailboxState;
    connect = mockConnect;
    getMailboxLock = mockGetMailboxLock;
    search = mockSearch;
    fetchOne = mockFetchOne;
    logout = mockLogout;
    close = vi.fn();
  },
}));

const { syncUserMailbox } = await import("../server/mail-sync");

describe("syncUserMailbox 从现在起（lookbackDays=0）行为测试", () => {
  beforeEach(() => {
    mockSearch.mockReset();
    mockFetchOne.mockReset();
    mockLockRelease.mockReset();
    mockGetMailboxLock.mockReset().mockResolvedValue({ release: mockLockRelease });
    mockConnect.mockReset().mockResolvedValue(undefined);
    mockLogout.mockReset().mockResolvedValue(undefined);
    mockMailboxState.uidNext = 1501;
    mockMailboxState.exists = 1500;
  });

  it("首次同步且 lookbackDays=0、lastUid=0 时只记录当前 UID 水位而不拉取历史邮件", async () => {
    const store = new JsonFileStore(null);
    const masterKey = deriveMasterKey("test-sync-secret");
    const user = await store.createUser("synczero", "hash", "user");
    await store.upsertMailAccount({
      userId: user.id,
      enabled: true,
      provider: "qq",
      host: "imap.qq.com",
      port: 993,
      secure: true,
      email: "zero@qq.com",
      passwordEnc: encryptSecret("authcode123", masterKey),
      folder: "INBOX",
      pollIntervalMin: 10,
      lookbackDays: 0,
      lastUid: 0,
      llmEnabled: false,
      llmBaseUrl: "",
      llmModel: "",
      llmKeyEnc: "",
      lastMatchedCount: 0,
      updatedAt: new Date().toISOString(),
    });

    const summary = await syncUserMailbox(store, user.id, masterKey);
    expect(summary.scanned).toBe(0);
    expect(summary.created).toBe(0);
    expect(summary.lastUid).toBe(1500);
    expect(mockGetMailboxLock).toHaveBeenCalledWith("INBOX", { readOnly: true });
    expect(mockSearch).not.toHaveBeenCalled();
    expect(mockFetchOne).not.toHaveBeenCalled();

    const updated = await store.getMailAccount(user.id);
    expect(updated?.lastUid).toBe(1500);
    await store.close();
  });

  it("已有 lastUid 且 lookbackDays=0 时后续同步仅扫描 UID > lastUid 的新邮件", async () => {
    const store = new JsonFileStore(null);
    const masterKey = deriveMasterKey("test-sync-secret");
    const user = await store.createUser("syncinc", "hash", "user");
    await store.upsertMailAccount({
      userId: user.id,
      enabled: true,
      provider: "qq",
      host: "imap.qq.com",
      port: 993,
      secure: true,
      email: "inc@qq.com",
      passwordEnc: encryptSecret("authcode123", masterKey),
      folder: "INBOX",
      pollIntervalMin: 10,
      lookbackDays: 0,
      lastUid: 1500,
      llmEnabled: false,
      llmBaseUrl: "",
      llmModel: "",
      llmKeyEnc: "",
      lastMatchedCount: 0,
      updatedAt: new Date().toISOString(),
    });

    const rawMail = Buffer.from(
      [
        "From: recruit@bytedance.com",
        "Subject: =?UTF-8?B?44CQ5a2X6IqC6Lez5Yqo44CR5ZCO56uv5LiA6Z2i6Z2i6K+V6YKA6K+3?=",
        "Message-ID: <test-1501@bytedance.com>",
        "Content-Type: text/plain; charset=utf-8",
        "",
        "面试时间：2026年11月28日 14:00-15:00",
        "会议链接：https://vc.feishu.cn/j/99887766",
      ].join("\r\n"),
    );
    mockSearch.mockResolvedValue([1500, 1501]);
    mockFetchOne.mockResolvedValue({ uid: 1501, source: rawMail });

    const summary = await syncUserMailbox(store, user.id, masterKey);
    expect(mockSearch).toHaveBeenCalledWith({ uid: "1501:*" }, { uid: true });
    expect(mockFetchOne).toHaveBeenCalledTimes(1);
    expect(summary.scanned).toBe(1);
    expect(summary.created).toBe(1);
    expect(summary.lastUid).toBe(1501);
    await store.close();
  });
});
