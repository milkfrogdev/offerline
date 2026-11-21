import React, { useState } from "react";
import { IconBrand, IconCalendar, IconMail, IconMoon, IconNote, IconShield, IconSun } from "./Icons";

export function AuthView({
  registrationOpen,
  theme,
  onToggleTheme,
  onLogin,
  onRegister,
}: {
  registrationOpen: boolean;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onLogin: (username: string, password: string) => Promise<void>;
  onRegister: (username: string, password: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "login") {
        await onLogin(username.trim(), password);
      } else {
        await onRegister(username.trim(), password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败，请重试。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-topbar">
        <div className="auth-brand-inline">
          <span className="brand-mark">
            <IconBrand size={16} />
          </span>
          <span className="brand-name">OfferLine</span>
        </div>
        <button
          type="button"
          className="icon-btn"
          onClick={onToggleTheme}
          title={theme === "dark" ? "切换到浅色" : "切换到深色"}
          aria-label="切换昼夜主题"
        >
          {theme === "dark" ? <IconSun size={16} /> : <IconMoon size={16} />}
        </button>
      </div>

      <main className="auth-grid">
        <section className="auth-intro">
          <h1 className="auth-headline">
            投递、日程与面经
            <br />
            收拢在一处清净工作台
          </h1>
          <p className="auth-lead">
            面向求职周期的个人工作台。多公司全链路一览无余，接入邮箱自动识别面试与笔试通知，数据完全归你自己掌控。
          </p>

          <ul className="auth-features">
            <li>
              <span className="auth-feat-icon">
                <IconMail size={15} />
              </span>
              <div>
                <div className="auth-feat-title">邮箱监听自动生成日程</div>
                <div className="auth-feat-desc">
                  支持 QQ、163、Gmail 与企业邮箱 IMAP 授权接入，解析笔面试时间与会议链接并输出标准日历订阅。
                </div>
              </div>
            </li>
            <li>
              <span className="auth-feat-icon">
                <IconNote size={15} />
              </span>
              <div>
                <div className="auth-feat-title">全链路进度与面经沉淀</div>
                <div className="auth-feat-desc">
                  单页铺开每家公司的完整流程节点，就地点击流转状态，随时为每一轮记录问题与复盘。
                </div>
              </div>
            </li>
            <li>
              <span className="auth-feat-icon">
                <IconShield size={15} />
              </span>
              <div>
                <div className="auth-feat-title">推荐私有部署，支持端到端加密</div>
                <div className="auth-feat-desc">
                  邮箱授权码 AES-256-GCM 加密存储，支持浏览器端加密备份导出，零第三方数据锁定。
                </div>
              </div>
            </li>
          </ul>
        </section>

        <section className="auth-card">
          <div className="auth-tabs">
            <button
              type="button"
              className={`auth-tab${mode === "login" ? " active" : ""}`}
              onClick={() => {
                setMode("login");
                setError("");
              }}
            >
              登录
            </button>
            {registrationOpen && (
              <button
                type="button"
                className={`auth-tab${mode === "register" ? " active" : ""}`}
                onClick={() => {
                  setMode("register");
                  setError("");
                }}
              >
                注册账号
              </button>
            )}
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="field">
              <span className="field-label">用户名</span>
              <input
                type="text"
                className="input"
                autoComplete="username"
                placeholder="3–32 位小写字母、数字或下划线"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </label>

            <label className="field">
              <span className="field-label">密码</span>
              <input
                type="password"
                className="input"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                placeholder="至少 10 个字符"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>

            {error && <div className="form-error">{error}</div>}

            <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
              {busy ? "提交中…" : mode === "login" ? "进入工作台" : "创建账号"}
            </button>
          </form>

          <div className="auth-foot">
            <IconCalendar size={13} />
            <span>支持 Docker 独立部署至个人服务器</span>
          </div>
        </section>
      </main>
    </div>
  );
}
