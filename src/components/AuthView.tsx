import React, { useLayoutEffect, useRef, useState } from "react";
import { AuthCanvas } from "./AuthCanvas";
import { AuthOrbitStage } from "./AuthOrbitStage";
import {
  IconArrowRight,
  IconBrand,
  IconEye,
  IconEyeOff,
  IconMoon,
  IconSun,
} from "./Icons";

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
  const [showPwd, setShowPwd] = useState(false);
  const [portalFocused, setPortalFocused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [boostSignal, setBoostSignal] = useState(0);

  // Zero-flicker spring-sliding segmented control
  const segRef = useRef<HTMLDivElement>(null);
  const [segThumb, setSegThumb] = useState<{
    left: number;
    width: number;
    ready: boolean;
    animated: boolean;
  }>({ left: 0, width: 0, ready: false, animated: false });

  useLayoutEffect(() => {
    const wrap = segRef.current;
    if (!wrap) return;
    let rafId = 0;
    const measure = () => {
      const btn = wrap.querySelector<HTMLButtonElement>(".auth-seg-btn.active");
      if (!btn) return;
      setSegThumb((prev) => ({
        left: btn.offsetLeft,
        width: btn.offsetWidth,
        ready: true,
        animated: prev.ready,
      }));
      rafId = window.requestAnimationFrame(() => {
        setSegThumb((prev) => (prev.ready && !prev.animated ? { ...prev, animated: true } : prev));
      });
    };
    measure();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(measure);
      ro.observe(wrap);
      return () => {
        window.cancelAnimationFrame(rafId);
        ro.disconnect();
      };
    }
    return () => window.cancelAnimationFrame(rafId);
  }, [mode, registrationOpen]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    setBoostSignal((n) => n + 1);
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
    <div className="auth-cinema">
      {/* 全屏 60fps 活体求职光轨 + 声纳涟漪 + 视差星尘画布 */}
      <AuthCanvas theme={theme} boostSignal={boostSignal} />

      {/* 顶部通透浮层 */}
      <header className="auth-float-nav">
        <div className="auth-nav-brand">
          <span className="brand-mark">
            <IconBrand size={15} />
          </span>
          <span className="brand-name">OfferLine</span>
        </div>

        <button
          type="button"
          className="auth-theme-switch"
          onClick={onToggleTheme}
          data-tip={theme === "dark" ? "切换到浅色外观" : "切换到深色外观"}
          data-tip-pos="bottom"
          aria-label="切换昼夜主题"
        >
          <span key={theme} className="theme-icon-swap">
            {theme === "dark" ? <IconSun size={14} /> : <IconMoon size={14} />}
          </span>
          <span>{theme === "dark" ? "浅色" : "深色"}</span>
        </button>
      </header>

      {/* 居中统合空间剧场 */}
      <main className="auth-theater">
        {/* 左侧：宣言 + 3D 立体求职星轨陀螺仪（无呆板卡片堆叠，无带框 Logo 栏） */}
        <section className="auth-hero-stage" aria-label="OfferLine 3D 星轨实景">
          <div className="auth-hero-text">
            <h1 className="auth-hero-title">
              把每一场面试
              <br />
              走成通往 <span className="auth-title-accent">Offer</span> 的线
            </h1>
            <p className="auth-hero-sub">
              投递推进、邮箱自动日程与所见即所得 Markdown 复盘，一屏实时联动。
            </p>
          </div>

          <AuthOrbitStage onPulseBoost={() => setBoostSignal((n) => n + 1)} />
        </section>

        {/* 右侧：磨砂晶体雕塑登录控制台 */}
        <section className="auth-portal" aria-label="账号登录与注册">
          <div
            className={`auth-portal-card${portalFocused ? " is-focused" : ""}`}
            onFocus={() => setPortalFocused(true)}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                setPortalFocused(false);
              }
            }}
          >
            <div className="auth-portal-head">
              <h2 className="auth-portal-title">
                {mode === "login" ? "欢迎回来" : "创建私有账号"}
              </h2>
              <p className="auth-portal-desc">
                {mode === "login"
                  ? "登录 OfferLine 继续跟进你的投递与面试安排"
                  : "所有投递、日程与面经均保存在你的私有实例中"}
              </p>
            </div>

            {registrationOpen && (
              <div className="auth-seg" ref={segRef} role="tablist" aria-label="切换登录或注册">
                <span
                  className={`auth-seg-thumb${segThumb.ready ? " is-ready" : ""}${segThumb.animated ? " is-animated" : ""}`}
                  style={{
                    transform: `translate3d(${segThumb.left}px, 0, 0)`,
                    width: `${segThumb.width}px`,
                  }}
                  aria-hidden="true"
                />
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === "login"}
                  className={`auth-seg-btn${mode === "login" ? " active" : ""}`}
                  onClick={() => {
                    setMode("login");
                    setError("");
                    setBoostSignal((n) => n + 1);
                  }}
                >
                  登录
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === "register"}
                  className={`auth-seg-btn${mode === "register" ? " active" : ""}`}
                  onClick={() => {
                    setMode("register");
                    setError("");
                    setBoostSignal((n) => n + 1);
                  }}
                >
                  注册账号
                </button>
              </div>
            )}

            <form className="auth-form" onSubmit={handleSubmit}>
              <label className="field">
                <span className="field-label">用户名</span>
                <input
                  type="text"
                  className="input auth-input"
                  autoComplete="username"
                  placeholder={mode === "login" ? "请输入用户名" : "3–32 位小写字母、数字或下划线"}
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    setBoostSignal((n) => n + 1);
                  }}
                  required
                />
              </label>

              <label className="field">
                <span className="field-label">密码</span>
                <div className="pwd-input-wrap">
                  <input
                    type={showPwd ? "text" : "password"}
                    className="input auth-input pwd-input"
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    placeholder={mode === "login" ? "请输入密码" : "设置密码（至少 10 个字符）"}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setBoostSignal((n) => n + 1);
                    }}
                    required
                  />
                  <button
                    type="button"
                    className="pwd-toggle-btn"
                    onClick={() => setShowPwd((v) => !v)}
                    data-tip={showPwd ? "隐藏密码" : "显示密码"}
                    aria-label={showPwd ? "隐藏密码" : "显示密码"}
                  >
                    {showPwd ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                  </button>
                </div>
              </label>

              {error && <div className="form-error">{error}</div>}

              <button type="submit" className="btn btn-primary auth-submit" disabled={busy}>
                <span>{busy ? "提交中…" : mode === "login" ? "进入工作台" : "创建账号"}</span>
                {!busy && <IconArrowRight size={15} />}
              </button>
            </form>
          </div>
        </section>
      </main>
    </div>
  );
}
