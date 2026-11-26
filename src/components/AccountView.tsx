import React, { useState } from "react";
import type {
  ApplicationRecord,
  InterviewNote,
  MailAccountPublic,
  ScheduleEvent,
  UserProfile,
} from "../../shared/types";
import { api } from "../api";
import { canUseWebCrypto, decryptJson, encryptJson } from "../crypto";
import { GITHUB_ISSUES_URL, GITHUB_REPO_URL } from "../starPrompt";
import {
  IconCheck,
  IconExternal,
  IconGitHub,
  IconKey,
  IconLogout,
  IconShield,
  IconStar,
} from "./Icons";
import { LlmConfigPanel } from "./LlmConfigPanel";

export function AccountView({
  user,
  records,
  events,
  notes,
  mailConfig,
  onMailConfigUpdated,
  onImported,
  onShowToast,
  onStarred,
  onLogout,
}: {
  user: UserProfile;
  records: ApplicationRecord[];
  events: ScheduleEvent[];
  notes: InterviewNote[];
  mailConfig: MailAccountPublic | null;
  onMailConfigUpdated: (cfg: MailAccountPublic) => void;
  onImported: () => Promise<void>;
  onShowToast: (text: string, kind?: "ok" | "err") => void;
  onStarred: () => void;
  onLogout: () => void;
}) {
  const [passphrase, setPassphrase] = useState("");
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [pwdBusy, setPwdBusy] = useState(false);
  const [pwdFeedback, setPwdFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [vaultFeedback, setVaultFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );
  const cryptoReady = canUseWebCrypto();
  const userInitial = (user.username.trim().slice(0, 1) || "U").toUpperCase();
  const joinedLabel = user.createdAt ? user.createdAt.slice(0, 10) : "本地账号";

  function downloadJson(data: unknown, filename: string) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function handleEncryptedExport() {
    setVaultFeedback(null);
    if (passphrase.trim().length < 6) {
      setVaultFeedback({ kind: "err", text: "加密口令至少需要 6 位。" });
      return;
    }
    try {
      const env = await encryptJson(
        { exportedAt: new Date().toISOString(), records },
        passphrase.trim(),
      );
      downloadJson(
        { format: "offerline-encrypted-backup", envelope: env },
        "offerline-backup.enc.json",
      );
      setVaultFeedback({ kind: "ok", text: "已导出 AES-256-GCM 加密备份文件。" });
    } catch (err) {
      setVaultFeedback({
        kind: "err",
        text: err instanceof Error ? err.message : "加密导出失败。",
      });
    }
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setVaultFeedback(null);
    try {
      const parsed = JSON.parse(await file.text()) as Record<string, unknown> | unknown[];
      let items: unknown[];
      if (
        !Array.isArray(parsed) &&
        parsed.format === "offerline-encrypted-backup" &&
        parsed.envelope
      ) {
        if (!passphrase.trim()) {
          setVaultFeedback({
            kind: "err",
            text: "这是加密备份文件，请先在下方输入解密口令后再导入。",
          });
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
      setVaultFeedback({ kind: "ok", text: `成功合并导入 ${res.count} 条投递记录。` });
    } catch (err) {
      setVaultFeedback({ kind: "err", text: err instanceof Error ? err.message : "导入失败。" });
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPwdFeedback(null);
    setPwdBusy(true);
    try {
      await api.changePassword(currentPwd, newPwd);
      setCurrentPwd("");
      setNewPwd("");
      setPwdFeedback({ kind: "ok", text: "登录密码已更新。" });
      onShowToast("登录密码已更新");
    } catch (err) {
      setPwdFeedback({
        kind: "err",
        text: err instanceof Error ? err.message : "修改密码失败。",
      });
    } finally {
      setPwdBusy(false);
    }
  }

  return (
    <div className="page-container">
      {/* 顶部个人档案横幅 */}
      <section className="account-hero-card">
        <div className="account-hero-ident">
          <span className="account-avatar-lg" aria-hidden="true">
            {userInitial}
          </span>
          <div className="account-hero-meta">
            <div className="account-hero-title-row">
              <h1 className="account-hero-name">{user.username}</h1>
              <span className="account-role-tag">
                {user.role === "admin" ? "管理员" : "个人空间"}
              </span>
            </div>
            <div className="account-hero-sub">加入时间 {joinedLabel}</div>
          </div>
        </div>

        <div className="account-hero-stats">
          <div className="account-stat-item">
            <span className="account-stat-val">{records.length}</span>
            <span className="account-stat-k">投递</span>
          </div>
          <div className="account-stat-item">
            <span className="account-stat-val">{events.length}</span>
            <span className="account-stat-k">日程</span>
          </div>
          <div className="account-stat-item">
            <span className="account-stat-val">{notes.length}</span>
            <span className="account-stat-k">面经</span>
          </div>
          <button type="button" className="btn btn-soft btn-sm" onClick={onLogout}>
            <IconLogout size={14} />
            <span>退出登录</span>
          </button>
        </div>
      </section>

      {/* 双栏 Bento 网格：左栏 API Key 大模型配置 + 右栏密码与数据加密 */}
      <div className="account-bento-grid">
        <section className="account-card">
          <div className="account-card-head">
            <div className="account-card-title-row">
              <span className="account-card-ico">
                <IconKey size={16} />
              </span>
              <h2 className="account-card-title">个人大模型与 API Key</h2>
            </div>
            {mailConfig?.hasLlmKey && (
              <span className="account-status-ok">
                <IconCheck size={12} />
                <span>{mailConfig.llmEnabled ? "已启用" : "已保存 Key"}</span>
              </span>
            )}
          </div>
          <LlmConfigPanel config={mailConfig} onConfigUpdated={onMailConfigUpdated} />
        </section>

        <div className="account-side-stack">
          <section className="account-card">
            <div className="account-card-head">
              <div className="account-card-title-row">
                <span className="account-card-ico">
                  <IconShield size={16} />
                </span>
                <h2 className="account-card-title">账号与密码安全</h2>
              </div>
            </div>

            <form className="modal-form" onSubmit={handlePasswordSubmit}>
              <div className="form-row-2">
                <label className="field">
                  <span className="field-label">当前密码</span>
                  <input
                    type="password"
                    className="input"
                    placeholder="输入当前密码"
                    value={currentPwd}
                    onChange={(e) => setCurrentPwd(e.target.value)}
                    required
                  />
                </label>
                <label className="field">
                  <span className="field-label">新密码（至少 10 位）</span>
                  <input
                    type="password"
                    className="input"
                    placeholder="输入新密码"
                    value={newPwd}
                    onChange={(e) => setNewPwd(e.target.value)}
                    required
                  />
                </label>
              </div>
              {pwdFeedback && (
                <div className={pwdFeedback.kind === "ok" ? "form-ok" : "form-error"}>
                  {pwdFeedback.text}
                </div>
              )}
              <div className="modal-actions">
                <button type="submit" className="btn btn-primary" disabled={pwdBusy}>
                  {pwdBusy ? "更新中…" : "更新密码"}
                </button>
              </div>
            </form>
          </section>

          <section className="account-card">
            <div className="account-card-head">
              <h2 className="account-card-title">数据备份与迁移</h2>
            </div>
            <div className="modal-form">
              <p className="field-hint">
                支持导出标准 JSON 及浏览器端 AES-256-GCM 加密备份文件（口令不上传服务端）。
              </p>
              <div className="vault-row">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => downloadJson(records, "offerline-records.json")}
                >
                  导出 JSON（{records.length}）
                </button>
                <label className="btn btn-ghost file-btn">
                  <span>导入 JSON / 加密备份</span>
                  <input
                    type="file"
                    accept=".json"
                    hidden
                    onChange={(e) => void handleImportFile(e)}
                  />
                </label>
              </div>

              <div className="copy-field">
                <input
                  type="password"
                  className="input"
                  placeholder={
                    cryptoReady ? "输入加密/解密口令（至少 6 位）" : "浏览器端加密需 HTTPS 或本地环境"
                  }
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

              {vaultFeedback && (
                <div className={vaultFeedback.kind === "ok" ? "form-ok" : "form-error"}>
                  {vaultFeedback.text}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* 开源支持与 GitHub Star 横卡 */}
      <section className="account-oss-card" aria-label="支持 OfferLine 开源项目">
        <div className="account-oss-main">
          <span className="account-oss-ico" aria-hidden="true">
            <IconGitHub size={22} />
          </span>
          <div className="account-oss-copy">
            <div className="account-oss-title-row">
              <h2 className="account-oss-title">喜欢 OfferLine？去 GitHub 点个 Star</h2>
              <span className="account-role-tag">MIT 开源</span>
            </div>
            <p className="account-oss-desc">
              OfferLine 坚持免费开源、数据归你自己掌握。如果它帮你理顺了投递与面试节奏，顺手点一颗 Star 就是对持续维护最大的鼓励。
            </p>
          </div>
        </div>

        <div className="account-oss-actions">
          <a
            className="btn btn-soft btn-sm account-oss-link"
            href={GITHUB_ISSUES_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span>提建议或反馈</span>
            <IconExternal size={12} />
          </a>
          <a
            className="btn btn-primary btn-sm account-oss-link"
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onStarred}
          >
            <IconStar size={14} filled />
            <span>去点个 Star</span>
            <IconExternal size={12} />
          </a>
        </div>
      </section>
    </div>
  );
}
