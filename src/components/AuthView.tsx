import React, { useLayoutEffect, useRef, useState } from "react";
import {
  IconArrowRight,
  IconBrand,
  IconEye,
  IconEyeOff,
  IconMoon,
  IconSun,
} from "./Icons";

const EMBLEM_STEPS = ["投递", "笔试", "一面", "终面", "Offer"] as const;

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [emblemIdx, setEmblemIdx] = useState(3);

  const segRef = useRef<HTMLDivElement>(null);
  const [segThumb, setSegThumb] = useState<{
    left: number;
    width: number;
    ready: boolean;
    animated: boolean;
  }>({
    left: 0,
    width: 0,
    ready: false,
    animated: false,
  });

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
    <div className="auth-stage-center">
      {/* 极淡建筑感正交辅助线背景（贴合主卡四条切线，纯 1px 细线，零渐变、零重影） */}
      <div className="auth-arch-lines" aria-hidden="true">
        <span className="auth-vline auth-vline-l" />
        <span className="auth-vline auth-vline-r" />
      </div>

      <main className="auth-center-col" aria-label="OfferLine 登录与注册">
        {/* 居中雕塑主卡（品牌、主题切换与登录表单完整收拢于 420px 版心内） */}
        <section className="auth-card-wrap">
          <span className="auth-cross auth-cross-tl" aria-hidden="true" />
          <span className="auth-cross auth-cross-tr" aria-hidden="true" />
          <span className="auth-cross auth-cross-bl" aria-hidden="true" />
          <span className="auth-cross auth-cross-br" aria-hidden="true" />

          <div className="auth-card">
            <header className="auth-card-head">
              <div className="auth-card-brand">
                <span className="brand-mark">
                  <IconBrand size={15} />
                </span>
                <span className="brand-name">OfferLine</span>
              </div>

              <button
                type="button"
                className="auth-theme-icon-btn"
                onClick={onToggleTheme}
                data-tip={theme === "dark" ? "切换到浅色外观" : "切换到深色外观"}
                data-tip-pos="bottom"
                aria-label="切换昼夜主题"
              >
                <span key={theme} className="theme-icon-swap">
                  {theme === "dark" ? <IconSun size={15} /> : <IconMoon size={15} />}
                </span>
              </button>
            </header>

            <div className="auth-card-body">
              <div className="auth-form-head">
                <h1 className="auth-form-title">
                  {mode === "login" ? "欢迎回来" : "创建账号"}
                </h1>
                <p className="auth-form-desc">
                  {mode === "login"
                    ? "登录继续管理你的投递进度、日程与面经"
                    : "注册私有账号，所有记录仅保存在你的实例中"}
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
                    onChange={(e) => setUsername(e.target.value)}
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
                      onChange={(e) => setPassword(e.target.value)}
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
          </div>
        </section>

        {/* 卡片正下方无外框 5 节点轻盈时间线徽带（OfferLine 专属视觉签名） */}
        <div className="auth-emblem-track" role="group" aria-label="OfferLine 流程缩影">
          {EMBLEM_STEPS.map((label, idx) => {
            const isOfferWin = emblemIdx === EMBLEM_STEPS.length - 1;
            const state = isOfferWin
              ? "pass"
              : idx < emblemIdx
                ? "pass"
                : idx === emblemIdx
                  ? "current"
                  : "pending";
            const prevPass = isOfferWin || (idx > 0 && idx - 1 < emblemIdx);
            return (
              <button
                key={label}
                type="button"
                className={`auth-enode st-${state}`}
                onClick={() => setEmblemIdx(idx)}
                data-tip={`切换到「${label}」`}
              >
                <span className="auth-enode-row">
                  {idx > 0 && <span className={`auth-earm left ${prevPass ? "pass" : ""}`} />}
                  <span className="auth-edot">
                    {state === "pass" && (
                      <svg viewBox="0 0 12 12" className="tl-mark" aria-hidden="true">
                        <path
                          d="M2.6 6.2 5 8.5 9.5 3.6"
                          stroke="currentColor"
                          strokeWidth="1.9"
                          fill="none"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                    {state === "current" && (
                      <>
                        <span className="tl-current-pulse" aria-hidden="true" />
                        <span className="tl-current-core" aria-hidden="true" />
                      </>
                    )}
                  </span>
                  {idx < EMBLEM_STEPS.length - 1 && (
                    <span className={`auth-earm right ${state === "pass" ? "pass" : ""}`} />
                  )}
                </span>
                <span className="auth-elabel">{label}</span>
              </button>
            );
          })}
        </div>
      </main>
    </div>
  );
}
