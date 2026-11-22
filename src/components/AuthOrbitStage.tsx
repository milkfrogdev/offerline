import React, { useEffect, useRef, useState } from "react";
import { CompanyLogo } from "./CompanyLogo";
import { IconCalendar, IconVideo } from "./Icons";

const STEPS = ["投递", "笔试", "一面", "二面", "谈薪", "Offer"] as const;

interface OrbitBrand {
  company: string;
  role: string;
  defaultStage: number;
  ring: 0 | 1;
  angleOffset: number;
  scheduleHint: string;
}

const ORBIT_BRANDS: OrbitBrand[] = [
  { company: "字节跳动", role: "基础架构后端研发", defaultStage: 4, ring: 0, angleOffset: 0.25, scheduleHint: "明天 15:00 三面" },
  { company: "DeepSeek", role: "大模型推理引擎", defaultStage: 3, ring: 0, angleOffset: 1.50, scheduleHint: "今天 16:30 终面" },
  { company: "腾讯", role: "WXG 微信后台开发", defaultStage: 4, ring: 0, angleOffset: 2.75, scheduleHint: "今天 19:00 终面" },
  { company: "NVIDIA", role: "CUDA Kernel 性能优化", defaultStage: 3, ring: 0, angleOffset: 4.02, scheduleHint: "周四 10:30 二面" },
  { company: "OpenAI", role: "Inference Systems", defaultStage: 5, ring: 0, angleOffset: 5.28, scheduleHint: "已获正式 Offer" },
  { company: "小米", role: "系统平台 Java / Go", defaultStage: 5, ring: 1, angleOffset: 0.75, scheduleHint: "已获正式 Offer" },
  { company: "华为", role: "2012 实验室存储引擎", defaultStage: 2, ring: 1, angleOffset: 2.01, scheduleHint: "明天 10:30 一面" },
  { company: "阿里云", role: "云原生容器网络", defaultStage: 3, ring: 1, angleOffset: 3.26, scheduleHint: "周五 14:00 二面" },
  { company: "Google", role: "Software Engineer", defaultStage: 4, ring: 1, angleOffset: 4.52, scheduleHint: "下周一 谈薪沟通" },
  { company: "Apple", role: "Core OS Systems", defaultStage: 3, ring: 1, angleOffset: 5.78, scheduleHint: "周三 11:00 技术面" },
];

export function AuthOrbitStage({
  onPulseBoost,
}: {
  onPulseBoost: () => void;
}) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [stageByCompany, setStageByCompany] = useState<Record<string, number>>(() =>
    Object.fromEntries(ORBIT_BRANDS.map((b) => [b.company, b.defaultStage])),
  );

  const stageRef = useRef<HTMLDivElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const hoveredRef = useRef(false);

  const activeBrand = ORBIT_BRANDS[selectedIdx];
  const activeStage = stageByCompany[activeBrand.company] ?? activeBrand.defaultStage;
  const isOfferWin = activeStage === STEPS.length - 1;

  useEffect(() => {
    const stageEl = stageRef.current;
    if (!stageEl) return;
    const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    let angle = 0.35;
    let speed = 0.24;
    let targetSpeed = 0.24;
    let tiltX = 0;
    let tiltY = 0;
    let targetTiltX = 0;
    let targetTiltY = 0;
    let lastTs = performance.now();
    let rafId = 0;

    const onMove = (e: PointerEvent) => {
      const rect = stageEl.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const nx = (e.clientX - (rect.left + rect.width / 2)) / (window.innerWidth * 0.5);
      const ny = (e.clientY - (rect.top + rect.height / 2)) / (window.innerHeight * 0.5);
      targetTiltY = Math.max(-9, Math.min(9, nx * 9));
      targetTiltX = Math.max(-7, Math.min(7, -ny * 7));
    };

    const onLeave = () => {
      targetTiltX = 0;
      targetTiltY = 0;
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerleave", onLeave);

    const renderFrame = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTs) / 1000));
      lastTs = now;

      targetSpeed = hoveredRef.current ? 0.045 : 0.24;
      speed += (targetSpeed - speed) * 0.08;
      if (!prefersReduced) {
        angle += dt * speed;
      }

      tiltX += (targetTiltX - tiltX) * 0.08;
      tiltY += (targetTiltY - tiltY) * 0.08;

      const w = stageEl.clientWidth || 700;
      const h = stageEl.clientHeight || 420;
      const cx = w * 0.5;
      const cy = h * 0.5;

      // Saturn-ring clearance geometry: orbits cleanly frame the tilted HUD without EVER colliding
      const rx0 = Math.min(336, w * 0.47);
      const ry0 = Math.min(176, h * 0.42);
      const tilt0 = -0.14; // -8 deg cinema roll

      const rx1 = Math.min(294, w * 0.415);
      const ry1 = Math.min(154, h * 0.37);
      const tilt1 = 0.15; // +8.6 deg counter-roll

      for (let i = 0; i < ORBIT_BRANDS.length; i++) {
        const b = ORBIT_BRANDS[i];
        const el = nodeRefs.current[i];
        if (!el) continue;

        const dir = b.ring === 0 ? 1 : -1.14;
        const a = b.angleOffset + angle * dir;
        const rx = b.ring === 0 ? rx0 : rx1;
        const ry = b.ring === 0 ? ry0 : ry1;
        const roll = b.ring === 0 ? tilt0 : tilt1;

        const lx = Math.cos(a) * rx;
        const ly = Math.sin(a) * ry;
        const depth = Math.sin(a); // -1 (top back) .. +1 (bottom front)

        const cosR = Math.cos(roll);
        const sinR = Math.sin(roll);
        const px = cx + lx * cosR - ly * sinR + tiltY * (1.6 + depth * 1.2);
        const py = cy + lx * sinR + ly * cosR - tiltX * (1.2 + depth * 1.0);

        const scale = 0.8 + (depth + 1) * 0.2; // 0.80 .. 1.20
        const opacity = 0.56 + (depth + 1) * 0.22; // 0.56 .. 1.00
        // Only elevate in front of HUD when well clear below its bottom edge
        const zIndex = depth > 0.62 ? 24 + Math.round(depth * 6) : 8 + Math.round((depth + 1) * 3);

        el.style.transform = `translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, 0) translate(-50%, -50%) scale(${scale.toFixed(3)})`;
        el.style.opacity = opacity.toFixed(2);
        el.style.zIndex = String(zIndex);
      }

      if (hudRef.current) {
        const rxDeg = 7 + tiltX * 0.6;
        const ryDeg = -8 + tiltY * 0.7;
        hudRef.current.style.transform = `perspective(1200px) rotateX(${rxDeg.toFixed(2)}deg) rotateY(${ryDeg.toFixed(2)}deg) rotateZ(-0.6deg)`;
      }

      if (!prefersReduced) {
        rafId = window.requestAnimationFrame(renderFrame);
      }
    };

    rafId = window.requestAnimationFrame(renderFrame);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  function pickBrand(idx: number) {
    setSelectedIdx(idx);
    onPulseBoost();
  }

  function pickStage(stageIdx: number) {
    setStageByCompany((prev) => ({ ...prev, [activeBrand.company]: stageIdx }));
    onPulseBoost();
  }

  return (
    <div
      ref={stageRef}
      className="auth-orbit-stage"
      onPointerEnter={() => {
        hoveredRef.current = true;
      }}
      onPointerLeave={() => {
        hoveredRef.current = false;
      }}
    >
      {/* 两条交叉倾斜的 3D 椭圆星轨（纯矢量细线 + 流动能量光弧，零 CSS 渐变） */}
      <svg
        className="auth-orbit-rings"
        viewBox="0 0 720 420"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
      >
        <g transform="translate(360 210) rotate(-8)">
          <ellipse cx="0" cy="0" rx="336" ry="176" className="orbit-ring-base" />
          <ellipse cx="0" cy="0" rx="336" ry="176" className="orbit-ring-beam is-cobalt" />
        </g>
        <g transform="translate(360 210) rotate(8.6)">
          <ellipse cx="0" cy="0" rx="294" ry="154" className="orbit-ring-base" />
          <ellipse cx="0" cy="0" rx="294" ry="154" className="orbit-ring-beam is-emerald" />
        </g>
      </svg>

      {/* 10 枚 100% 无框裸显的真实大厂高清官标，沿 3D 轨道景深公转 */}
      {ORBIT_BRANDS.map((brand, idx) => {
        const isSelected = idx === selectedIdx;
        return (
          <button
            key={brand.company}
            ref={(el) => {
              nodeRefs.current[idx] = el;
            }}
            type="button"
            className={`orbit-brand-node${isSelected ? " is-selected" : ""}`}
            onClick={() => pickBrand(idx)}
            data-tip={`${brand.company}（点击切入中央时间线）`}
            aria-label={`切换到 ${brand.company}`}
          >
            <CompanyLogo company={brand.company} size="md" />
          </button>
        );
      })}

      {/* 穿过星轨核心的 3D 透视斜角悬浮晶体 HUD（单块立体核心，彻底告别呆板三卡片） */}
      <div ref={hudRef} className="orbit-hud-wrap">
        {/* 高景深浮动日程浮签（Z 轴突出悬浮在主轴右上角） */}
        <div className="orbit-float-chip">
          <IconCalendar size={12} />
          <span>{activeBrand.scheduleHint}</span>
          <span className="orbit-float-sep" aria-hidden="true" />
          <IconVideo size={12} />
          <span>自动同步 .ics</span>
        </div>

        <div key={activeBrand.company} className="orbit-hud-ribbon">
          <div className="orbit-hud-top">
            <div className="orbit-hud-brand">
              <CompanyLogo company={activeBrand.company} size="md" />
              <div className="orbit-hud-ident">
                <span className="orbit-hud-name">
                  <span>{activeBrand.company}</span>
                  {isOfferWin && <span className="offer-inline-badge">已获 Offer</span>}
                </span>
                <span className="orbit-hud-role">{activeBrand.role}</span>
              </div>
            </div>
            <span className="orbit-hud-hint">点击节点或轨道图标试玩</span>
          </div>

          <div className="auth-demo-track" role="group" aria-label={`${activeBrand.company} 交互时间线`}>
            {STEPS.map((label, idx) => {
              const state = isOfferWin
                ? "pass"
                : idx < activeStage
                  ? "pass"
                  : idx === activeStage
                    ? "current"
                    : "pending";
              const prevPass = isOfferWin || (idx > 0 && idx - 1 < activeStage);
              return (
                <button
                  key={label}
                  type="button"
                  className={`auth-pnode st-${state}`}
                  onClick={() => pickStage(idx)}
                  data-tip={`切换到「${label}」`}
                >
                  <span className="auth-pnode-row">
                    {idx > 0 && <span className={`auth-parm left ${prevPass ? "pass" : ""}`} />}
                    <span className="auth-pdot">
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
                    {idx < STEPS.length - 1 && (
                      <span className={`auth-parm right ${state === "pass" ? "pass" : ""}`} />
                    )}
                  </span>
                  <span className="auth-plabel">{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
