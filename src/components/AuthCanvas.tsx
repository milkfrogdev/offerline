import React, { useEffect, useRef } from "react";

interface Pulse {
  lane: number;
  t: number;
  speed: number;
  kind: "cobalt" | "emerald";
  tail: number;
}

interface Ripple {
  x: number;
  y: number;
  r: number;
  maxR: number;
  alpha: number;
  kind: "cobalt" | "emerald";
}

interface Star {
  x: number;
  y: number;
  z: number;
  size: number;
  phase: number;
}

interface LaneDef {
  yRatio: number;
  amp: number;
  phase: number;
  freq: number;
  nodes: number[];
}

const LANES: LaneDef[] = [
  { yRatio: 0.10, amp: 24, phase: 0.2, freq: 1.35, nodes: [0.12, 0.34, 0.62, 0.87] },
  { yRatio: 0.26, amp: 20, phase: 2.3, freq: 1.15, nodes: [0.06, 0.56, 0.89] },
  { yRatio: 0.44, amp: 32, phase: 1.4, freq: 1.25, nodes: [0.09, 0.29, 0.54, 0.79, 0.94] },
  { yRatio: 0.59, amp: 28, phase: 3.1, freq: 1.30, nodes: [0.15, 0.43, 0.68, 0.88] },
  { yRatio: 0.75, amp: 34, phase: 0.8, freq: 1.18, nodes: [0.11, 0.36, 0.60, 0.84] },
  { yRatio: 0.89, amp: 22, phase: 2.0, freq: 1.42, nodes: [0.18, 0.48, 0.74, 0.92] },
];

export function AuthCanvas({
  theme,
  boostSignal = 0,
}: {
  theme: "light" | "dark";
  boostSignal?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boostRef = useRef(0);

  useEffect(() => {
    if (boostSignal > 0) {
      boostRef.current = Math.min(1, boostRef.current + 0.65);
    }
  }, [boostSignal]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    let width = window.innerWidth;
    let height = window.innerHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    // Deterministic subtle parallax depth dust (zero random flicker)
    const stars: Star[] = Array.from({ length: 42 }, (_, i) => ({
      x: ((i * 197.3) % 100) / 100,
      y: ((i * 311.7) % 100) / 100,
      z: 0.35 + ((i * 53) % 10) * 0.08,
      size: 1 + (i % 3) * 0.55,
      phase: i * 0.7,
    }));

    const ripples: Ripple[] = [];
    const pointer = { x: width * 0.46, y: height * 0.5, tx: width * 0.46, ty: height * 0.5 };

    const onPointerMove = (e: PointerEvent) => {
      pointer.tx = e.clientX;
      pointer.ty = e.clientY;
    };

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("button,input,a,form")) return;
      ripples.push({
        x: e.clientX,
        y: e.clientY,
        r: 6,
        maxR: 130,
        alpha: 0.42,
        kind: Math.random() > 0.45 ? "cobalt" : "emerald",
      });
    };

    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });

    const pulses: Pulse[] = [
      { lane: 0, t: 0.14, speed: 0.00105, kind: "cobalt", tail: 0.15 },
      { lane: 1, t: 0.62, speed: 0.00088, kind: "emerald", tail: 0.13 },
      { lane: 2, t: 0.08, speed: 0.00125, kind: "cobalt", tail: 0.18 },
      { lane: 2, t: 0.58, speed: 0.00095, kind: "emerald", tail: 0.14 },
      { lane: 3, t: 0.31, speed: 0.00112, kind: "cobalt", tail: 0.16 },
      { lane: 3, t: 0.84, speed: 0.0009, kind: "emerald", tail: 0.13 },
      { lane: 4, t: 0.22, speed: 0.0012, kind: "emerald", tail: 0.17 },
      { lane: 5, t: 0.71, speed: 0.00096, kind: "cobalt", tail: 0.15 },
    ];

    const isDark = theme === "dark";

    function laneY(lane: LaneDef, xRatio: number, timeSec: number): number {
      const base = height * lane.yRatio;
      const wave =
        Math.sin(xRatio * Math.PI * 2 * lane.freq + lane.phase + timeSec * 0.26) * lane.amp +
        Math.cos(xRatio * Math.PI * 1.4 - lane.phase + timeSec * 0.16) * (lane.amp * 0.38);
      const px = xRatio * width;
      const dx = px - pointer.x;
      const dy = base + wave - pointer.y;
      const distSq = dx * dx + dy * dy;
      const influence = Math.exp(-distSq / 105000);
      const bend = (pointer.y - (base + wave)) * 0.12 * influence;
      return base + wave + bend;
    }

    let rafId = 0;
    const startTs = performance.now();

    const draw = (now: number) => {
      const timeSec = prefersReduced ? 1.8 : (now - startTs) / 1000;
      pointer.x += (pointer.tx - pointer.x) * 0.08;
      pointer.y += (pointer.ty - pointer.y) * 0.08;
      boostRef.current *= 0.96;
      const speedMult = 1 + boostRef.current * 1.8;

      // 1. Deep atmospheric base
      ctx.fillStyle = isDark ? "#060911" : "#f2f5fa";
      ctx.fillRect(0, 0, width, height);

      // 2. Sculpted multi-center illumination pools
      const g1 = ctx.createRadialGradient(
        width * 0.22,
        height * 0.28,
        10,
        width * 0.22,
        height * 0.28,
        Math.max(width, height) * 0.58,
      );
      if (isDark) {
        g1.addColorStop(0, "rgba(37, 99, 235, 0.24)");
        g1.addColorStop(0.45, "rgba(37, 99, 235, 0.07)");
        g1.addColorStop(1, "rgba(6, 9, 17, 0)");
      } else {
        g1.addColorStop(0, "rgba(37, 99, 235, 0.12)");
        g1.addColorStop(0.5, "rgba(37, 99, 235, 0.035)");
        g1.addColorStop(1, "rgba(242, 245, 250, 0)");
      }
      ctx.fillStyle = g1;
      ctx.fillRect(0, 0, width, height);

      const g2 = ctx.createRadialGradient(
        width * 0.80,
        height * 0.72,
        10,
        width * 0.80,
        height * 0.72,
        Math.max(width, height) * 0.54,
      );
      if (isDark) {
        g2.addColorStop(0, "rgba(16, 185, 129, 0.18)");
        g2.addColorStop(0.48, "rgba(16, 185, 129, 0.045)");
        g2.addColorStop(1, "rgba(6, 9, 17, 0)");
      } else {
        g2.addColorStop(0, "rgba(16, 185, 129, 0.11)");
        g2.addColorStop(0.52, "rgba(16, 185, 129, 0.025)");
        g2.addColorStop(1, "rgba(242, 245, 250, 0)");
      }
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, width, height);

      // Reactive pointer illumination aura
      const gp = ctx.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, 380);
      gp.addColorStop(
        0,
        isDark
          ? `rgba(96, 165, 250, ${0.12 + boostRef.current * 0.08})`
          : `rgba(37, 99, 235, ${0.075 + boostRef.current * 0.05})`,
      );
      gp.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = gp;
      ctx.fillRect(0, 0, width, height);

      // 3. Parallax Depth Starfield Dust
      const pxNorm = (pointer.x / Math.max(1, width) - 0.5) * 32;
      const pyNorm = (pointer.y / Math.max(1, height) - 0.5) * 24;
      for (const st of stars) {
        const sx = ((st.x * width - pxNorm * st.z + width) % width);
        const sy = ((st.y * height - pyNorm * st.z + height) % height);
        const twinkle = 0.45 + 0.55 * Math.sin(timeSec * 1.4 + st.phase);
        ctx.beginPath();
        ctx.arc(sx, sy, st.size, 0, Math.PI * 2);
        ctx.fillStyle = isDark
          ? `rgba(148, 163, 184, ${0.14 + twinkle * 0.22})`
          : `rgba(37, 99, 235, ${0.08 + twinkle * 0.14})`;
        ctx.fill();
      }

      // 4. Flowing OfferLine Bezier Streams + Dynamic Milestone Rings
      const segments = 72;
      for (let li = 0; li < LANES.length; li++) {
        const lane = LANES[li];
        ctx.beginPath();
        for (let s = 0; s <= segments; s++) {
          const xr = s / segments;
          const x = xr * width;
          const y = laneY(lane, xr, timeSec);
          if (s === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = isDark ? "rgba(148, 163, 184, 0.14)" : "rgba(15, 23, 42, 0.08)";
        ctx.lineWidth = 1.25;
        ctx.stroke();

        for (const nx of lane.nodes) {
          const x = nx * width;
          const y = laneY(lane, nx, timeSec);
          let proximity = 0;
          let nearKind: "cobalt" | "emerald" = "cobalt";
          for (const p of pulses) {
            if (p.lane !== li) continue;
            const prevT = p.t - p.speed * speedMult;
            // Spawn expanding sonar ripple the exact instant a pulse crosses a node
            if (!prefersReduced && prevT < nx && p.t >= nx && ripples.length < 18) {
              ripples.push({
                x,
                y,
                r: 4,
                maxR: 48,
                alpha: isDark ? 0.5 : 0.36,
                kind: p.kind,
              });
            }
            const d = Math.abs(p.t - nx);
            if (d < 0.11) {
              const strength = 1 - d / 0.11;
              if (strength > proximity) {
                proximity = strength;
                nearKind = p.kind;
              }
            }
          }

          if (proximity > 0.02) {
            ctx.beginPath();
            ctx.arc(x, y, 6 + proximity * 10, 0, Math.PI * 2);
            ctx.fillStyle =
              nearKind === "emerald"
                ? `rgba(16, 185, 129, ${(isDark ? 0.28 : 0.20) * proximity})`
                : `rgba(59, 130, 246, ${(isDark ? 0.30 : 0.20) * proximity})`;
            ctx.fill();
          }

          ctx.beginPath();
          ctx.arc(x, y, 3.4 + proximity * 1.8, 0, Math.PI * 2);
          ctx.fillStyle = isDark ? "#0a101d" : "#ffffff";
          ctx.fill();
          ctx.lineWidth = 1.6;
          ctx.strokeStyle =
            proximity > 0.08
              ? nearKind === "emerald"
                ? "#10b981"
                : "#3b82f6"
              : isDark
                ? "rgba(148, 163, 184, 0.34)"
                : "rgba(15, 23, 42, 0.22)";
          ctx.stroke();
        }
      }

      // 5. Luminous Comet Signal Pulses
      for (const p of pulses) {
        if (!prefersReduced) {
          p.t += p.speed * speedMult;
          if (p.t > 1.2) p.t = -0.16;
        }
        const lane = LANES[p.lane];
        const headX = p.t * width;
        const headY = laneY(lane, p.t, timeSec);
        const tailStart = p.t - p.tail;
        const tailSteps = 22;

        for (let k = 0; k < tailSteps; k++) {
          const r0 = tailStart + (p.tail * k) / tailSteps;
          const r1 = tailStart + (p.tail * (k + 1)) / tailSteps;
          if (r1 < 0 || r0 > 1) continue;
          const frac = (k + 1) / tailSteps;
          ctx.beginPath();
          ctx.moveTo(r0 * width, laneY(lane, r0, timeSec));
          ctx.lineTo(r1 * width, laneY(lane, r1, timeSec));
          ctx.strokeStyle =
            p.kind === "emerald"
              ? `rgba(16, 185, 129, ${frac * (isDark ? 0.92 : 0.72)})`
              : `rgba(59, 130, 246, ${frac * (isDark ? 0.94 : 0.75)})`;
          ctx.lineWidth = 1.3 + frac * 2.2;
          ctx.lineCap = "round";
          ctx.stroke();
        }

        if (p.t >= 0 && p.t <= 1) {
          ctx.beginPath();
          ctx.arc(headX, headY, 11, 0, Math.PI * 2);
          ctx.fillStyle =
            p.kind === "emerald"
              ? isDark
                ? "rgba(16, 185, 129, 0.28)"
                : "rgba(16, 185, 129, 0.20)"
              : isDark
                ? "rgba(59, 130, 246, 0.30)"
                : "rgba(59, 130, 246, 0.22)";
          ctx.fill();

          ctx.beginPath();
          ctx.arc(headX, headY, 3.2, 0, Math.PI * 2);
          ctx.fillStyle = p.kind === "emerald" ? "#34d399" : "#60a5fa";
          ctx.fill();
        }
      }

      // 6. Expanding Sonar Ripples
      for (let i = ripples.length - 1; i >= 0; i--) {
        const rp = ripples[i];
        rp.r += (rp.maxR - rp.r) * 0.075 + 0.6;
        rp.alpha *= 0.94;
        if (rp.alpha < 0.015 || rp.r >= rp.maxR) {
          ripples.splice(i, 1);
          continue;
        }
        ctx.beginPath();
        ctx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2);
        ctx.strokeStyle =
          rp.kind === "emerald"
            ? `rgba(16, 185, 129, ${rp.alpha})`
            : `rgba(59, 130, 246, ${rp.alpha})`;
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }

      if (!prefersReduced) {
        rafId = window.requestAnimationFrame(draw);
      }
    };

    rafId = window.requestAnimationFrame(draw);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [theme]);

  return <canvas ref={canvasRef} className="auth-kinetic-canvas" aria-hidden="true" />;
}
