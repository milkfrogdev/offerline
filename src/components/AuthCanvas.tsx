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

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  kind: "cobalt" | "emerald";
}

interface Star {
  x: number;
  y: number;
  vx: number;
  vy: number;
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
  { yRatio: 0.11, amp: 24, phase: 0.2, freq: 1.35, nodes: [0.12, 0.35, 0.63, 0.87] },
  { yRatio: 0.25, amp: 18, phase: 2.3, freq: 1.15, nodes: [0.06, 0.56, 0.89] },
  { yRatio: 0.44, amp: 32, phase: 1.4, freq: 1.25, nodes: [0.09, 0.28, 0.54, 0.79, 0.94] },
  { yRatio: 0.60, amp: 28, phase: 3.1, freq: 1.30, nodes: [0.15, 0.43, 0.68, 0.88] },
  { yRatio: 0.76, amp: 34, phase: 0.8, freq: 1.18, nodes: [0.11, 0.36, 0.61, 0.84] },
  { yRatio: 0.90, amp: 22, phase: 2.0, freq: 1.42, nodes: [0.18, 0.48, 0.74, 0.92] },
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
  const burstTriggerRef = useRef(0);

  useEffect(() => {
    if (boostSignal > 0) {
      boostRef.current = Math.min(1.2, boostRef.current + 0.7);
      burstTriggerRef.current += 1;
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

    // 56 drifting parallax constellation stars
    const stars: Star[] = Array.from({ length: 56 }, (_, i) => ({
      x: (((i * 197.3) % 100) / 100) * width,
      y: (((i * 311.7) % 100) / 100) * height,
      vx: (((i * 37) % 11) - 5) * 0.045,
      vy: (((i * 29) % 11) - 5) * 0.035,
      z: 0.35 + ((i * 53) % 10) * 0.08,
      size: 1.1 + (i % 3) * 0.55,
      phase: i * 0.7,
    }));

    const ripples: Ripple[] = [];
    const sparks: Spark[] = [];
    const pointer = {
      x: width * 0.45,
      y: height * 0.48,
      tx: width * 0.45,
      ty: height * 0.48,
      active: false,
    };

    const spawnBurst = (cx: number, cy: number, kind: "cobalt" | "emerald") => {
      ripples.push({ x: cx, y: cy, r: 6, maxR: 150, alpha: 0.52, kind });
      ripples.push({
        x: cx,
        y: cy,
        r: 2,
        maxR: 92,
        alpha: 0.38,
        kind: kind === "cobalt" ? "emerald" : "cobalt",
      });
      for (let i = 0; i < 10; i++) {
        const ang = (Math.PI * 2 * i) / 10 + (Math.random() - 0.5) * 0.35;
        const spd = 1.6 + Math.random() * 2.4;
        sparks.push({
          x: cx,
          y: cy,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          life: 0,
          maxLife: 34 + Math.random() * 20,
          kind: i % 2 === 0 ? kind : kind === "cobalt" ? "emerald" : "cobalt",
        });
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      pointer.tx = e.clientX;
      pointer.ty = e.clientY;
      pointer.active = true;
    };

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("button,input,a,form")) return;
      spawnBurst(e.clientX, e.clientY, Math.random() > 0.45 ? "cobalt" : "emerald");
    };

    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });

    const pulses: Pulse[] = [
      { lane: 0, t: 0.14, speed: 0.0011, kind: "cobalt", tail: 0.16 },
      { lane: 1, t: 0.62, speed: 0.0009, kind: "emerald", tail: 0.14 },
      { lane: 2, t: 0.08, speed: 0.0013, kind: "cobalt", tail: 0.20 },
      { lane: 2, t: 0.58, speed: 0.00098, kind: "emerald", tail: 0.15 },
      { lane: 3, t: 0.31, speed: 0.00115, kind: "cobalt", tail: 0.18 },
      { lane: 3, t: 0.84, speed: 0.00092, kind: "emerald", tail: 0.14 },
      { lane: 4, t: 0.22, speed: 0.00125, kind: "emerald", tail: 0.19 },
      { lane: 5, t: 0.71, speed: 0.0010, kind: "cobalt", tail: 0.16 },
    ];

    const isDark = theme === "dark";
    let lastBurstSeen = burstTriggerRef.current;

    function laneY(lane: LaneDef, xRatio: number, timeSec: number): number {
      const base = height * lane.yRatio;
      const wave =
        Math.sin(xRatio * Math.PI * 2 * lane.freq + lane.phase + timeSec * 0.28) * lane.amp +
        Math.cos(xRatio * Math.PI * 1.4 - lane.phase + timeSec * 0.17) * (lane.amp * 0.38);
      const px = xRatio * width;
      const dx = px - pointer.x;
      const dy = base + wave - pointer.y;
      const distSq = dx * dx + dy * dy;
      const influence = Math.exp(-distSq / 115000);
      const bend = (pointer.y - (base + wave)) * 0.13 * influence;
      return base + wave + bend;
    }

    let rafId = 0;
    const startTs = performance.now();

    const draw = (now: number) => {
      const timeSec = prefersReduced ? 2.1 : (now - startTs) / 1000;
      pointer.x += (pointer.tx - pointer.x) * 0.085;
      pointer.y += (pointer.ty - pointer.y) * 0.085;
      boostRef.current *= 0.96;
      const speedMult = 1 + boostRef.current * 2.0;

      if (burstTriggerRef.current !== lastBurstSeen) {
        lastBurstSeen = burstTriggerRef.current;
        if (!prefersReduced) {
          spawnBurst(width * 0.34, height * 0.58, "emerald");
        }
      }

      const camNormX = pointer.x / Math.max(1, width) - 0.5;
      const camNormY = pointer.y / Math.max(1, height) - 0.5;

      // 1. Base atmospheric depth canvas
      ctx.fillStyle = isDark ? "#050811" : "#f1f4fa";
      ctx.fillRect(0, 0, width, height);

      // 2. Living Breathing Silk Aurora Pools (slow orbital drift + parallax)
      const a1x = width * (0.22 + Math.sin(timeSec * 0.22) * 0.06 - camNormX * 0.06);
      const a1y = height * (0.26 + Math.cos(timeSec * 0.18) * 0.05 - camNormY * 0.05);
      const g1 = ctx.createRadialGradient(a1x, a1y, 10, a1x, a1y, Math.max(width, height) * 0.56);
      if (isDark) {
        g1.addColorStop(0, "rgba(37, 99, 235, 0.28)");
        g1.addColorStop(0.42, "rgba(99, 102, 241, 0.10)");
        g1.addColorStop(1, "rgba(5, 8, 17, 0)");
      } else {
        g1.addColorStop(0, "rgba(37, 99, 235, 0.14)");
        g1.addColorStop(0.48, "rgba(99, 102, 241, 0.045)");
        g1.addColorStop(1, "rgba(241, 244, 250, 0)");
      }
      ctx.fillStyle = g1;
      ctx.fillRect(0, 0, width, height);

      const a2x = width * (0.78 + Math.cos(timeSec * 0.20) * 0.06 - camNormX * 0.05);
      const a2y = height * (0.72 + Math.sin(timeSec * 0.24) * 0.05 - camNormY * 0.05);
      const g2 = ctx.createRadialGradient(a2x, a2y, 10, a2x, a2y, Math.max(width, height) * 0.54);
      if (isDark) {
        g2.addColorStop(0, "rgba(16, 185, 129, 0.23)");
        g2.addColorStop(0.45, "rgba(14, 165, 233, 0.08)");
        g2.addColorStop(1, "rgba(5, 8, 17, 0)");
      } else {
        g2.addColorStop(0, "rgba(16, 185, 129, 0.13)");
        g2.addColorStop(0.48, "rgba(14, 165, 233, 0.045)");
        g2.addColorStop(1, "rgba(241, 244, 250, 0)");
      }
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, width, height);

      const a3x = width * (0.50 + Math.sin(timeSec * 0.15 + 1.2) * 0.08);
      const a3y = height * (0.86 + Math.cos(timeSec * 0.17) * 0.04);
      const g3 = ctx.createRadialGradient(a3x, a3y, 10, a3x, a3y, Math.max(width, height) * 0.42);
      if (isDark) {
        g3.addColorStop(0, "rgba(14, 165, 233, 0.16)");
        g3.addColorStop(1, "rgba(5, 8, 17, 0)");
      } else {
        g3.addColorStop(0, "rgba(59, 130, 246, 0.09)");
        g3.addColorStop(1, "rgba(241, 244, 250, 0)");
      }
      ctx.fillStyle = g3;
      ctx.fillRect(0, 0, width, height);

      // 3. True 3D Perspective Wave Terrain Horizon (lower viewport spatial floor)
      const cols = 22;
      const rows = 11;
      const focal = Math.min(width, height) * 0.92;
      const horizonY = height * (0.60 - camNormY * 0.04);
      const camOffsetX = camNormX * 220;
      const projected: { x: number; y: number; fade: number; crest: number }[][] = [];

      for (let r = 0; r < rows; r++) {
        const rowPts: { x: number; y: number; fade: number; crest: number }[] = [];
        const depthNorm = r / (rows - 1); // 0 (far horizon) .. 1 (near camera)
        const z = 4.6 - depthNorm * 3.45; // 4.6 .. 1.15
        const fade = Math.pow(depthNorm, 1.35) * (1 - Math.max(0, depthNorm - 0.88) * 3.5);
        for (let c = 0; c < cols; c++) {
          const u = (c / (cols - 1) - 0.5) * 2.55;
          const worldX = u * width * 0.85 - camOffsetX;
          const wave =
            Math.sin(c * 0.48 + timeSec * 0.85 * (1 + boostRef.current * 0.5) + r * 0.35) * 18 +
            Math.cos(r * 0.62 - timeSec * 0.7 + c * 0.25) * 14;
          const worldY = 165 + wave;
          const scale = focal / (z * 320);
          const sx = width * 0.5 + worldX * scale;
          const sy = horizonY + worldY * scale;
          rowPts.push({ x: sx, y: sy, fade: Math.max(0, fade), crest: (wave + 32) / 64 });
        }
        projected.push(rowPts);
      }

      // Draw transverse wave contours
      ctx.lineWidth = 1;
      for (let r = 0; r < rows; r++) {
        const rowPts = projected[r];
        const alpha = rowPts[0].fade * (isDark ? 0.22 : 0.14);
        if (alpha < 0.01) continue;
        ctx.beginPath();
        for (let c = 0; c < cols; c++) {
          const p = rowPts[c];
          if (c === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.strokeStyle = isDark
          ? `rgba(96, 165, 250, ${alpha.toFixed(3)})`
          : `rgba(37, 99, 235, ${alpha.toFixed(3)})`;
        ctx.stroke();
      }

      // Draw longitudinal perspective meridians + illuminated crest dots
      for (let c = 0; c < cols; c++) {
        ctx.beginPath();
        for (let r = 0; r < rows; r++) {
          const p = projected[r][c];
          if (r === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.strokeStyle = isDark ? "rgba(56, 189, 248, 0.08)" : "rgba(37, 99, 235, 0.055)";
        ctx.stroke();

        for (let r = 2; r < rows; r += 2) {
          const p = projected[r][c];
          if (p.fade < 0.08) continue;
          const dotAlpha = p.fade * (0.22 + p.crest * 0.55);
          ctx.beginPath();
          ctx.arc(p.x, p.y, 1.2 + p.crest * 1.4, 0, Math.PI * 2);
          ctx.fillStyle =
            p.crest > 0.62
              ? `rgba(16, 185, 129, ${(dotAlpha * (isDark ? 0.95 : 0.7)).toFixed(3)})`
              : `rgba(96, 165, 250, ${(dotAlpha * (isDark ? 0.85 : 0.6)).toFixed(3)})`;
          ctx.fill();
        }
      }

      // 4. Interactive Magnetic Constellation Field
      const pxShift = camNormX * 36;
      const pyShift = camNormY * 26;
      const screenStars: { x: number; y: number; size: number; twinkle: number }[] = [];

      for (const st of stars) {
        if (!prefersReduced) {
          st.x += st.vx * speedMult;
          st.y += st.vy * speedMult;
          if (st.x < 0) st.x += width;
          if (st.x > width) st.x -= width;
          if (st.y < 0) st.y += height;
          if (st.y > height) st.y -= height;
        }
        const sx = (st.x - pxShift * st.z + width) % width;
        const sy = (st.y - pyShift * st.z + height) % height;
        const twinkle = 0.45 + 0.55 * Math.sin(timeSec * 1.6 + st.phase);
        screenStars.push({ x: sx, y: sy, size: st.size, twinkle });
      }

      // Pairwise subtle constellation filaments + magnetic cursor threads
      const maxPairDist = 148;
      const maxPtrDist = 205;
      ctx.lineWidth = 0.9;
      for (let i = 0; i < screenStars.length; i++) {
        const a = screenStars[i];

        // Connect to cursor magnetically
        const pdx = a.x - pointer.x;
        const pdy = a.y - pointer.y;
        const pd = Math.hypot(pdx, pdy);
        if (pd < maxPtrDist) {
          const strength = 1 - pd / maxPtrDist;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(pointer.x, pointer.y);
          ctx.strokeStyle = isDark
            ? `rgba(96, 165, 250, ${(strength * 0.34).toFixed(3)})`
            : `rgba(37, 99, 235, ${(strength * 0.22).toFixed(3)})`;
          ctx.stroke();
        }

        for (let j = i + 1; j < screenStars.length; j++) {
          const b = screenStars[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.hypot(dx, dy);
          if (dist < maxPairDist) {
            const strength = 1 - dist / maxPairDist;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = isDark
              ? `rgba(148, 163, 184, ${(strength * 0.15).toFixed(3)})`
              : `rgba(15, 23, 42, ${(strength * 0.08).toFixed(3)})`;
            ctx.stroke();
          }
        }

        ctx.beginPath();
        ctx.arc(a.x, a.y, a.size, 0, Math.PI * 2);
        ctx.fillStyle = isDark
          ? `rgba(203, 213, 225, ${(0.22 + a.twinkle * 0.38).toFixed(3)})`
          : `rgba(37, 99, 235, ${(0.14 + a.twinkle * 0.22).toFixed(3)})`;
        ctx.fill();
      }

      // Reactive pointer spotlight halo
      const gp = ctx.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, 380);
      gp.addColorStop(
        0,
        isDark
          ? `rgba(96, 165, 250, ${0.14 + boostRef.current * 0.09})`
          : `rgba(37, 99, 235, ${0.08 + boostRef.current * 0.06})`,
      );
      gp.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = gp;
      ctx.fillRect(0, 0, width, height);

      // 5. Flowing OfferLine Bezier Highways + Glowing Milestone Nodes
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
        ctx.strokeStyle = isDark ? "rgba(148, 163, 184, 0.14)" : "rgba(15, 23, 42, 0.085)";
        ctx.lineWidth = 1.2;
        ctx.stroke();

        for (const nx of lane.nodes) {
          const x = nx * width;
          const y = laneY(lane, nx, timeSec);
          let proximity = 0;
          let nearKind: "cobalt" | "emerald" = "cobalt";
          for (const p of pulses) {
            if (p.lane !== li) continue;
            const prevT = p.t - p.speed * speedMult;
            if (!prefersReduced && prevT < nx && p.t >= nx && ripples.length < 22) {
              ripples.push({
                x,
                y,
                r: 4,
                maxR: 54,
                alpha: isDark ? 0.56 : 0.4,
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
            ctx.arc(x, y, 7 + proximity * 12, 0, Math.PI * 2);
            ctx.fillStyle =
              nearKind === "emerald"
                ? `rgba(16, 185, 129, ${(isDark ? 0.30 : 0.22) * proximity})`
                : `rgba(59, 130, 246, ${(isDark ? 0.32 : 0.22) * proximity})`;
            ctx.fill();
          }

          ctx.beginPath();
          ctx.arc(x, y, 3.4 + proximity * 1.9, 0, Math.PI * 2);
          ctx.fillStyle = isDark ? "#080d18" : "#ffffff";
          ctx.fill();
          ctx.lineWidth = 1.65;
          ctx.strokeStyle =
            proximity > 0.08
              ? nearKind === "emerald"
                ? "#10b981"
                : "#3b82f6"
              : isDark
                ? "rgba(148, 163, 184, 0.36)"
                : "rgba(15, 23, 42, 0.22)";
          ctx.stroke();
        }
      }

      // 6. Double-Layer White-Hot Luminous Comet Pulses
      for (const p of pulses) {
        if (!prefersReduced) {
          p.t += p.speed * speedMult;
          if (p.t > 1.22) p.t = -0.18;
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
              ? `rgba(16, 185, 129, ${frac * (isDark ? 0.96 : 0.78)})`
              : `rgba(59, 130, 246, ${frac * (isDark ? 0.98 : 0.80)})`;
          ctx.lineWidth = 1.4 + frac * 2.5;
          ctx.lineCap = "round";
          ctx.stroke();
        }

        if (p.t >= 0 && p.t <= 1) {
          ctx.beginPath();
          ctx.arc(headX, headY, 13, 0, Math.PI * 2);
          ctx.fillStyle =
            p.kind === "emerald"
              ? isDark
                ? "rgba(16, 185, 129, 0.30)"
                : "rgba(16, 185, 129, 0.22)"
              : isDark
                ? "rgba(59, 130, 246, 0.32)"
                : "rgba(59, 130, 246, 0.24)";
          ctx.fill();

          ctx.beginPath();
          ctx.arc(headX, headY, 3.6, 0, Math.PI * 2);
          ctx.fillStyle = p.kind === "emerald" ? "#34d399" : "#60a5fa";
          ctx.fill();

          ctx.beginPath();
          ctx.arc(headX, headY, 1.6, 0, Math.PI * 2);
          ctx.fillStyle = "#ffffff";
          ctx.fill();
        }
      }

      // 7. Expanding Sonar Ripples & Click Burst Sparks
      for (let i = ripples.length - 1; i >= 0; i--) {
        const rp = ripples[i];
        rp.r += (rp.maxR - rp.r) * 0.075 + 0.65;
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
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      for (let i = sparks.length - 1; i >= 0; i--) {
        const sp = sparks[i];
        sp.x += sp.vx;
        sp.y += sp.vy;
        sp.vx *= 0.95;
        sp.vy *= 0.95;
        sp.life += 1;
        const remain = 1 - sp.life / sp.maxLife;
        if (remain <= 0) {
          sparks.splice(i, 1);
          continue;
        }
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 1.4 + remain * 1.8, 0, Math.PI * 2);
        ctx.fillStyle =
          sp.kind === "emerald"
            ? `rgba(52, 211, 153, ${remain * 0.9})`
            : `rgba(96, 165, 250, ${remain * 0.9})`;
        ctx.fill();
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
