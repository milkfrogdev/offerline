import React, { useLayoutEffect, useRef, useState } from "react";
import { CompanyLogo } from "./CompanyLogo";
import {
  IconArrowRight,
  IconBrand,
  IconCalendar,
  IconCheck,
  IconEye,
  IconEyeOff,
  IconMail,
  IconMoon,
  IconNote,
  IconPipeline,
  IconShield,
  IconSun,
  IconVideo,
} from "./Icons";

type ShowcaseTab = "timeline" | "schedule" | "notes";

const DEMO_STEPS = ["投递", "笔试", "一面", "二面", "谈薪", "Offer"] as const;

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

  // Interactive showcase states
  const [showcaseTab, setShowcaseTab] = useState<ShowcaseTab>("timeline");
  const [bytedanceIdx, setBytedanceIdx] = useState(4);
  const [deepseekIdx, setDeepseekIdx] = useState(3);
  const [demoSynced, setDemoSynced] = useState(false);
  const [demoChecks, setDemoChecks] = useState<[boolean, boolean]>([true, false]);

  const segRef = useRef<HTMLDivElement>(null);
  const [segThumb, setSegThumb] = useState<{ left: number; width: number; ready: boolean }>({
    left: 0,
    width: 0,
    ready: false,
  });

  const winTabRef = useRef<HTMLDivElement>(null);
  const [winThumb, setWinThumb] = useState<{ left: number; width: number; ready: boolean }>({
    left: 0,
    width: 0,
    ready: false,
  });

  useLayoutEffect(() => {
    const wrap = segRef.current;
    if (!wrap) return;
    const measure = () => {
      const btn = wrap.querySelector<HTMLButtonElement>(".auth-seg-btn.active");
      if (!btn) return;
      setSegThumb({ left: btn.offsetLeft, width: btn.offsetWidth, ready: true });
    };
    measure();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(measure);
      ro.observe(wrap);
      return () => ro.disconnect();
    }
    return undefined;
  }, [mode, registrationOpen]);

  useLayoutEffect(() => {
    const wrap = winTabRef.current;
    if (!wrap) return;
    const measure = () => {
      const btn = wrap.querySelector<HTMLButtonElement>(".auth-win-tab.active");
      if (!btn) return;
      setWinThumb({ left: btn.offsetLeft, width: btn.offsetWidth, ready: true });
    };
    measure();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(measure);
      ro.observe(wrap);
      return () => ro.disconnect();
    }
    return undefined;
  }, [showcaseTab]);

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

  function renderDemoTrack(
    activeIdx: number,
    onSelect: (idx: number) => void,
    allPass = false,
  ) {
    return (
      <div className="auth-demo-track" role="group" aria-label="交互时间线演示">
        {DEMO_STEPS.map((label, idx) => {
          const state = allPass
            ? "pass"
            : idx < activeIdx
              ? "pass"
              : idx === activeIdx
                ? "current"
                : "pending";
          const prevPass = allPass || (idx > 0 && idx - 1 < activeIdx);
          return (
            <button
              key={label}
              type="button"
              className={`auth-pnode st-${state}`}
              onClick={() => !allPass && onSelect(idx)}
              data-tip={allPass ? `${label}（已通过）` : `点击切换到「${label}」`}
            >
              <span className="auth-pnode-row">
                {idx > 0 && <span className={`auth-parm left ${prevPass ? "pass" : ""}`} />}
                <span className="auth-pdot">
                  {state === "pass" && (
                    <svg viewBox="0 0 12 12" className="tl-mark" aria-hidden="true">
                      <path
                        d="M2.6 6.2 5 8.5 9.5 3.6"
                        stroke="currentColor"
                        strokeWidth="1.8"
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
                {idx < DEMO_STEPS.length - 1 && (
                  <span className={`auth-parm right ${state === "pass" ? "pass" : ""}`} />
                )}
              </span>
              <span className="auth-plabel">{label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="auth-frame">
      {/* 顶栏：建筑感 1px 细线框定 */}
      <header className="auth-topbar">
        <div className="auth-topbar-left">
          <span className="brand-mark">
            <IconBrand size={15} />
          </span>
          <span className="brand-name">OfferLine</span>
          <span className="auth-bar-divider" aria-hidden="true" />
          <span className="auth-bar-subtitle">求职进度与日程工作台</span>
        </div>

        <div className="auth-topbar-right">
          <button
            type="button"
            className="auth-theme-pill"
            onClick={onToggleTheme}
            data-tip={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}
            data-tip-pos="bottom"
          >
            <span key={theme} className="theme-icon-swap">
              {theme === "dark" ? <IconSun size={14} /> : <IconMoon size={14} />}
            </span>
            <span>{theme === "dark" ? "浅色外观" : "深色外观"}</span>
          </button>
        </div>
      </header>

      {/* 主体：左实景微缩工作台 + 右专注登录舱 */}
      <main className="auth-body">
        <section className="auth-showcase-chamber" aria-label="OfferLine 产品预览">
          <div className="auth-showcase-inner">
            <div className="auth-headline-block">
              <h1 className="auth-display">
                把每一次投递和面试
                <br />
                排成清晰的时间线
              </h1>
              <p className="auth-sublead">
                投递进度、邮箱日程与所见即所得 Markdown 面经，集中在一处私有工作台。
              </p>
            </div>

            {/* 统一微缩工作台实景窗（单块精致表面，支持 3 视图实时切换体验） */}
            <div className="auth-window">
              <div className="auth-win-bar">
                <div className="auth-win-tabs" ref={winTabRef} role="tablist" aria-label="切换产品预览">
                  <span
                    className={`auth-win-thumb${winThumb.ready ? " is-ready" : ""}`}
                    style={{
                      transform: `translate3d(${winThumb.left}px, 0, 0)`,
                      width: `${winThumb.width}px`,
                    }}
                    aria-hidden="true"
                  />
                  <button
                    type="button"
                    role="tab"
                    aria-selected={showcaseTab === "timeline"}
                    className={`auth-win-tab${showcaseTab === "timeline" ? " active" : ""}`}
                    onClick={() => setShowcaseTab("timeline")}
                  >
                    <IconPipeline size={13} />
                    <span>投递时间线</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={showcaseTab === "schedule"}
                    className={`auth-win-tab${showcaseTab === "schedule" ? " active" : ""}`}
                    onClick={() => setShowcaseTab("schedule")}
                  >
                    <IconCalendar size={13} />
                    <span>自动日程</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={showcaseTab === "notes"}
                    className={`auth-win-tab${showcaseTab === "notes" ? " active" : ""}`}
                    onClick={() => setShowcaseTab("notes")}
                  >
                    <IconNote size={13} />
                    <span>面经复盘</span>
                  </button>
                </div>

                <span className="auth-win-hint">
                  {showcaseTab === "timeline"
                    ? "点击任意节点试玩推进"
                    : showcaseTab === "schedule"
                      ? "IMAP 监听解析并同步进度"
                      : "默认 Markdown 实时渲染"}
                </span>
              </div>

              <div key={showcaseTab} className="auth-win-stage">
                {showcaseTab === "timeline" && (
                  <div className="auth-win-timeline">
                    <div className="auth-win-row">
                      <div className="auth-win-company">
                        <CompanyLogo company="字节跳动" size="md" />
                        <div className="auth-win-ident">
                          <span className="auth-win-name">字节跳动</span>
                          <span className="auth-win-role">基础架构后端研发</span>
                        </div>
                      </div>
                      {renderDemoTrack(bytedanceIdx, setBytedanceIdx)}
                    </div>

                    <div className="auth-win-row">
                      <div className="auth-win-company">
                        <CompanyLogo company="DeepSeek" size="md" />
                        <div className="auth-win-ident">
                          <span className="auth-win-name">DeepSeek</span>
                          <span className="auth-win-role">大模型推理引擎</span>
                        </div>
                      </div>
                      {renderDemoTrack(deepseekIdx, setDeepseekIdx)}
                    </div>

                    <div className="auth-win-row">
                      <div className="auth-win-company">
                        <CompanyLogo company="小米" size="md" />
                        <div className="auth-win-ident">
                          <span className="auth-win-name">
                            小米
                            <span className="offer-inline-badge">已获 Offer</span>
                          </span>
                          <span className="auth-win-role">系统平台 Java / Go 研发</span>
                        </div>
                      </div>
                      {renderDemoTrack(5, () => undefined, true)}
                    </div>
                  </div>
                )}

                {showcaseTab === "schedule" && (
                  <div className="auth-win-schedule">
                    <div className="auth-sch-row">
                      <div className="auth-sch-time">
                        <strong>16:30</strong>
                        <span>今天</span>
                      </div>
                      <span className="auth-sch-line" aria-hidden="true" />
                      <CompanyLogo company="DeepSeek" size="sm" />
                      <div className="auth-sch-info">
                        <div className="auth-sch-title">DeepSeek 推理引擎三面（技术终面）</div>
                        <div className="auth-sch-meta">
                          <span className="auth-mini-chip">
                            <IconVideo size={12} />
                            <span>腾讯会议</span>
                          </span>
                          <span>自动生成 .ics 提醒</span>
                        </div>
                      </div>
                    </div>

                    <div className="auth-sch-row">
                      <div className="auth-sch-time">
                        <strong>19:00</strong>
                        <span>今天</span>
                      </div>
                      <span className="auth-sch-line" aria-hidden="true" />
                      <CompanyLogo company="腾讯" size="sm" />
                      <div className="auth-sch-info">
                        <div className="auth-sch-title">腾讯 WXG HR 综合面谈</div>
                        <div className="auth-sch-meta">
                          <span className="auth-mini-chip">
                            <IconVideo size={12} />
                            <span>腾讯会议</span>
                          </span>
                          <span>45 分钟</span>
                        </div>
                      </div>
                    </div>

                    <div className="auth-sch-row is-inbox">
                      <div className="auth-sch-time">
                        <strong>15:00</strong>
                        <span>明天</span>
                      </div>
                      <span className="auth-sch-line" aria-hidden="true" />
                      <CompanyLogo company="字节跳动" size="sm" />
                      <div className="auth-sch-info">
                        <div className="auth-sch-title">字节跳动 AI Infra 分布式系统三面</div>
                        <div className="auth-sch-meta">
                          <span>邮箱自动解析待确认</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className={`btn btn-sm ${demoSynced ? "btn-soft" : "btn-primary"}`}
                        onClick={() => setDemoSynced((v) => !v)}
                      >
                        <IconCheck size={13} />
                        <span>{demoSynced ? "已同步时间线" : "同步进度"}</span>
                      </button>
                    </div>
                  </div>
                )}

                {showcaseTab === "notes" && (
                  <div className="auth-win-notes">
                    <div className="auth-note-head">
                      <div className="auth-note-ident">
                        <CompanyLogo company="DeepSeek" size="sm" />
                        <span className="auth-win-name">DeepSeek</span>
                        <span className="note-stage">二面</span>
                        <span className="note-feeling feel-great">发挥顺畅</span>
                      </div>
                      <span className="auth-note-mode-tag">Markdown 所见即所得</span>
                    </div>

                    <div className="auth-note-doc">
                      <div className="auth-note-h2">推理引擎核心深挖</div>
                      <p className="auth-note-p">
                        深入讨论 <code>Continuous Batching</code> 下 Prefill 与 Decode 相互干扰，推导{" "}
                        <code>Chunked Prefill</code> 的尾延迟边界与吞吐收益。
                      </p>
                      <div className="auth-note-todos">
                        {(
                          [
                            "整理 PagedAttention 显存碎片率公式",
                            "补练无锁 RingBuffer 边界条件测试",
                          ] as const
                        ).map((label, idx) => (
                          <button
                            key={label}
                            type="button"
                            className={`auth-todo-item${demoChecks[idx] ? " is-done" : ""}`}
                            onClick={() =>
                              setDemoChecks((prev) =>
                                idx === 0 ? [!prev[0], prev[1]] : [prev[0], !prev[1]],
                              )
                            }
                          >
                            <span className="auth-todo-box" aria-hidden="true">
                              {demoChecks[idx] && <IconCheck size={11} />}
                            </span>
                            <span>{label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* 右侧：纯净聚焦登录舱 */}
        <section className="auth-form-chamber" aria-label="账号登录与注册">
          <div className="auth-form-shell">
            <div className="auth-form-head">
              <h2 className="auth-form-title">
                {mode === "login" ? "登录工作台" : "创建私有账号"}
              </h2>
              <p className="auth-form-desc">
                {mode === "login"
                  ? "输入账号继续跟进你的投递进度与面试安排"
                  : "所有投递、日程与面经均保存在你的私有实例中"}
              </p>
            </div>

            {registrationOpen && (
              <div className="auth-seg" ref={segRef} role="tablist" aria-label="切换登录或注册">
                <span
                  className={`auth-seg-thumb${segThumb.ready ? " is-ready" : ""}`}
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
                  placeholder="3–32 位小写字母、数字或下划线"
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
                    placeholder="至少 10 个字符"
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

            <div className="auth-trust-grid">
              <div className="auth-trust-item">
                <IconShield size={14} />
                <span>AES-256-GCM 端到端加密</span>
              </div>
              <div className="auth-trust-item">
                <IconMail size={14} />
                <span>IMAP 邮箱监听零中转</span>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* 底栏：轻盈技术规格条 */}
      <footer className="auth-bottombar">
        <span className="auth-bottom-copy">OfferLine 私有部署个人求职工作台</span>
        <div className="auth-bottom-specs">
          <span>62 家大厂官方图标</span>
          <span>MySQL 持久化存储</span>
          <span>系统日历 .ics 订阅</span>
        </div>
      </footer>
    </div>
  );
}
