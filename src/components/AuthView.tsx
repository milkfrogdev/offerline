import { useState } from "react";
import type { UserProfile } from "../../shared/types";
import { api } from "../api";

export function AuthView({
  registrationOpen,
  onSuccess,
}: {
  registrationOpen: boolean;
  onSuccess: (user: UserProfile) => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await api<{ user: UserProfile }>(`/auth/${mode}`, {
        username,
        password,
      });
      onSuccess(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败，请重试。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-wrap">
      <section className="auth-card">
        <div className="auth-brand">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="3" stroke="currentColor" strokeWidth="1.8" />
            <path d="M7 9h10M7 13h6M7 17h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <span>OfferLine</span>
        </div>
        <div className="auth-tabs">
          <button
            type="button"
            className={mode === "login" ? "active" : ""}
            onClick={() => {
              setMode("login");
              setError("");
            }}
          >
            登录
          </button>
          <button
            type="button"
            className={mode === "register" ? "active" : ""}
            onClick={() => {
              setMode("register");
              setError("");
            }}
          >
            注册
          </button>
        </div>
        <form className="auth-form" onSubmit={(e) => void submit(e)}>
          <label className="field">
            用户名
            <input
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              required
              minLength={3}
              maxLength={32}
              pattern="[a-z0-9_]{3,32}"
              placeholder="3–32 位小写字母、数字或下划线"
            />
          </label>
          <label className="field">
            密码
            <input
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={10}
              maxLength={128}
              placeholder="至少 10 个字符"
            />
          </label>
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
          {mode === "register" && !registrationOpen && (
            <p className="error-text">当前站点已关闭公开注册。</p>
          )}
          <button
            type="submit"
            className="primary"
            disabled={busy || (mode === "register" && !registrationOpen)}
          >
            {busy ? "请稍候…" : mode === "login" ? "登录 →" : "创建账号"}
          </button>
        </form>
        <div className="auth-note">
          支持个人服务器 Docker 单容器自部署；HTTPS 下支持浏览器端 AES-256-GCM 端到端加密备份与敏感记录口令锁定。
        </div>
      </section>
    </main>
  );
}
