import { useEffect, useRef, useState } from "react";
import { PRIORITY_LABELS, createDefaultStageDrafts } from "../../shared/stages";
import {
  PRIORITY_LEVELS,
  type ApplicationRecord,
  type EncryptedEnvelope,
  type PriorityLevel,
} from "../../shared/types";
import { api, downloadText } from "../api";
import { canUseWebCrypto, decryptJson, encryptJson } from "../crypto";

export function CreateRecordDialog({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [company, setCompany] = useState("");
  const [position, setPosition] = useState("");
  const [city, setCity] = useState("");
  const [salary, setSalary] = useState("");
  const [source, setSource] = useState("");
  const [priority, setPriority] = useState<PriorityLevel>("normal");
  const [nextFollowUpAt, setNextFollowUpAt] = useState("");
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setError("");
      ref.current?.showModal();
    } else {
      ref.current?.close();
    }
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onCreate({
        company,
        position,
        city,
        salary,
        source,
        priority,
        nextFollowUpAt,
        url,
        notes,
        stages: createDefaultStageDrafts(),
      });
      setCompany("");
      setPosition("");
      setCity("");
      setSalary("");
      setSource("");
      setPriority("normal");
      setNextFollowUpAt("");
      setUrl("");
      setNotes("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog ref={ref} className="solid-dialog" onCancel={onClose}>
      <div className="dialog-head">
        <h2>新增投递记录</h2>
        <button type="button" className="quiet" onClick={onClose}>
          ×
        </button>
      </div>
      <form className="dialog-form" onSubmit={(e) => void submit(e)}>
        <div className="meta-grid">
          <label className="field">
            公司名称 *
            <input value={company} onChange={(e) => setCompany(e.target.value)} required maxLength={100} />
          </label>
          <label className="field">
            岗位名称 *
            <input value={position} onChange={(e) => setPosition(e.target.value)} required maxLength={100} />
          </label>
          <label className="field">
            城市
            <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="如 上海 / 远程" maxLength={40} />
          </label>
          <label className="field">
            期望薪资
            <input value={salary} onChange={(e) => setSalary(e.target.value)} placeholder="可选" maxLength={60} />
          </label>
          <label className="field">
            投递渠道
            <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="内推 / 官网 / Boss" maxLength={40} />
          </label>
          <label className="field">
            意向优先级
            <select value={priority} onChange={(e) => setPriority(e.target.value as PriorityLevel)}>
              {PRIORITY_LEVELS.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="meta-grid">
          <label className="field">
            下次跟进/面试日期
            <input type="date" value={nextFollowUpAt} onChange={(e) => setNextFollowUpAt(e.target.value)} />
          </label>
          <label className="field">
            官网进度链接
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" maxLength={1000} />
          </label>
        </div>
        <label className="field">
          初始备注
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="岗位 JD 要点、内推人信息等…" />
        </label>
        {error && <p className="error-text">{error}</p>}
        <div className="dialog-footer">
          <button type="button" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? "创建中…" : "创建投递"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

export function VaultAndDataDialog({
  open,
  records,
  vaultKey,
  onSetVaultKey,
  onImported,
  onClose,
  onNotice,
}: {
  open: boolean;
  records: readonly ApplicationRecord[];
  vaultKey: string;
  onSetVaultKey: (key: string) => void;
  onImported: () => Promise<void>;
  onClose: () => void;
  onNotice: (msg: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importMode, setImportMode] = useState<"merge" | "overwrite">("merge");
  const [passphrase, setPassphrase] = useState(vaultKey);
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setError("");
      setPassphrase(vaultKey);
      ref.current?.showModal();
    } else {
      ref.current?.close();
    }
  }, [open, vaultKey]);

  const cryptoReady = canUseWebCrypto();

  async function handleExportPlain() {
    downloadText(JSON.stringify(records, null, 2), "offerline-backup.json");
    onNotice("已导出标准 JSON 备份");
  }

  async function handleExportEncrypted() {
    setError("");
    if (passphrase.trim().length < 8) {
      setError("加密备份口令至少 8 个字符。");
      return;
    }
    try {
      const env = await encryptJson(records, passphrase.trim());
      downloadText(JSON.stringify({ offerlineEncryptedBackup: env }, null, 2), "offerline-backup.enc.json");
      onNotice("已导出 AES-256-GCM 加密备份");
    } catch (e) {
      setError(e instanceof Error ? e.message : "加密导出失败");
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      let items: unknown;
      if (
        parsed &&
        typeof parsed === "object" &&
        "offerlineEncryptedBackup" in parsed
      ) {
        if (!passphrase.trim()) {
          throw new Error("这是加密备份文件，请先在下方输入解密口令后再选择文件。");
        }
        items = await decryptJson(
          (parsed as { offerlineEncryptedBackup: EncryptedEnvelope }).offerlineEncryptedBackup,
          passphrase.trim(),
        );
      } else {
        items = parsed;
      }
      const res = await api<{ count: number }>("/records/import", {
        mode: importMode,
        data: items,
      });
      await onImported();
      onNotice(`已导入 ${res.count} 条记录`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "导入失败");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/auth/password", { currentPassword: curPw, newPassword: newPw });
      setCurPw("");
      setNewPw("");
      onNotice("登录密码已更新");
    } catch (err) {
      setError(err instanceof Error ? err.message : "改密失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog ref={ref} className="solid-dialog" onCancel={onClose}>
      <div className="dialog-head">
        <h2>数据备份、加密与账号安全</h2>
        <button type="button" className="quiet" onClick={onClose}>
          ×
        </button>
      </div>

      <div className="dialog-form">
        <label className="field">
          加密备份 / 端到端私密字段口令（不上传服务器）
          <div className="toolbar-left">
            <input
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder={cryptoReady ? "至少 8 位口令" : "需 HTTPS 域名才可启用 WebCrypto"}
              disabled={!cryptoReady}
            />
            {cryptoReady && (
              <button
                type="button"
                onClick={() => {
                  onSetVaultKey(passphrase.trim());
                  onNotice(passphrase.trim() ? "当前标签页已解锁加密口令" : "已锁定加密口令");
                }}
              >
                {passphrase.trim() ? "设为会话口令" : "锁定"}
              </button>
            )}
          </div>
        </label>

        {!cryptoReady && (
          <p className="auth-note">
            当前通过 HTTP 访问，浏览器禁用 WebCrypto。完成域名绑定与 HTTPS 后，即可在浏览器端直接用 AES-256-GCM 加密导出与单条记录加密存储。建议重隐私场景用个人服务器 Docker 独立部署。
          </p>
        )}

        <div className="toolbar-left">
          <button type="button" onClick={() => void handleExportPlain()}>
            导出 JSON
          </button>
          {cryptoReady && (
            <button type="button" onClick={() => void handleExportEncrypted()}>
              加密导出 (.enc.json)
            </button>
          )}
          <select
            value={importMode}
            aria-label="导入模式"
            onChange={(e) => setImportMode(e.target.value as "merge" | "overwrite")}
            style={{ width: "auto" }}
          >
            <option value="merge">合并导入（兼容旧版导出）</option>
            <option value="overwrite">覆盖导入</option>
          </select>
          <button type="button" disabled={busy} onClick={() => fileRef.current?.click()}>
            选择文件导入
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            style={{ display: "none" }}
            onChange={(e) => void handleFileSelect(e)}
          />
        </div>

        <hr style={{ border: 0, borderTop: "1px solid var(--line)", width: "100%", margin: "6px 0" }} />

        <form className="dialog-form" onSubmit={(e) => void changePassword(e)}>
          <h3>修改登录密码</h3>
          <div className="meta-grid">
            <label className="field">
              当前密码
              <input
                type="password"
                value={curPw}
                onChange={(e) => setCurPw(e.target.value)}
                required
              />
            </label>
            <label className="field">
              新密码（≥10位）
              <input
                type="password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                minLength={10}
                required
              />
            </label>
          </div>
          <div>
            <button type="submit" disabled={busy}>
              更新密码
            </button>
          </div>
        </form>

        {error && <p className="error-text">{error}</p>}
      </div>
    </dialog>
  );
}
