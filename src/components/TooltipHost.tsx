import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

interface TipState {
  text: string;
  rect: DOMRect;
  preferPos: "top" | "bottom";
  instant: boolean;
}

export function TooltipHost() {
  const [tip, setTip] = useState<TipState | null>(null);
  const [coords, setCoords] = useState<{
    left: number;
    top: number;
    placement: "top" | "bottom";
    arrowX: number;
  } | null>(null);

  const tipRef = useRef<HTMLDivElement>(null);
  const activeElRef = useRef<HTMLElement | null>(null);
  const showTimerRef = useRef<number | null>(null);
  const warmUntilRef = useRef<number>(0);

  useEffect(() => {
    function clearShowTimer() {
      if (showTimerRef.current !== null) {
        window.clearTimeout(showTimerRef.current);
        showTimerRef.current = null;
      }
    }

    function hideImmediate() {
      clearShowTimer();
      if (activeElRef.current) {
        warmUntilRef.current = Date.now() + 280;
        activeElRef.current = null;
      }
      setTip(null);
      setCoords(null);
    }

    function scheduleShow(target: HTMLElement, fromKeyboard = false) {
      const text = (target.getAttribute("data-tip") || "").trim();
      if (!text) return;
      if (activeElRef.current === target) return;

      clearShowTimer();
      activeElRef.current = target;
      const preferPos = target.getAttribute("data-tip-pos") === "bottom" ? "bottom" : "top";
      const isWarm = fromKeyboard || Date.now() < warmUntilRef.current;

      const commit = () => {
        if (activeElRef.current !== target || !target.isConnected) return;
        setTip({
          text,
          rect: target.getBoundingClientRect(),
          preferPos,
          instant: isWarm,
        });
      };

      if (isWarm) {
        commit();
      } else {
        showTimerRef.current = window.setTimeout(commit, 160);
      }
    }

    function onPointerOver(e: PointerEvent) {
      if (e.pointerType === "touch") return;
      const hit = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-tip]");
      if (!hit) return;
      scheduleShow(hit, false);
    }

    function onPointerOut(e: PointerEvent) {
      const cur = activeElRef.current;
      if (!cur) return;
      const related = e.relatedTarget as HTMLElement | null;
      if (related && cur.contains(related)) return;
      const nextHit = related?.closest<HTMLElement>("[data-tip]");
      if (nextHit && nextHit !== cur) {
        scheduleShow(nextHit, false);
        return;
      }
      hideImmediate();
    }

    function onFocusIn(e: FocusEvent) {
      const target = e.target as HTMLElement | null;
      if (!target || !target.matches?.(":focus-visible")) return;
      const hit = target.closest<HTMLElement>("[data-tip]");
      if (hit) scheduleShow(hit, true);
    }

    function onFocusOut() {
      hideImmediate();
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") hideImmediate();
    }

    document.addEventListener("pointerover", onPointerOver, true);
    document.addEventListener("pointerout", onPointerOut, true);
    document.addEventListener("pointerdown", hideImmediate, true);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("scroll", hideImmediate, true);
    window.addEventListener("resize", hideImmediate);

    return () => {
      clearShowTimer();
      document.removeEventListener("pointerover", onPointerOver, true);
      document.removeEventListener("pointerout", onPointerOut, true);
      document.removeEventListener("pointerdown", hideImmediate, true);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", onFocusOut, true);
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("scroll", hideImmediate, true);
      window.removeEventListener("resize", hideImmediate);
    };
  }, []);

  useLayoutEffect(() => {
    if (!tip || !tipRef.current) return;
    const el = tipRef.current;
    const tipW = el.offsetWidth;
    const tipH = el.offsetHeight;
    const margin = 10;
    const gap = 8;
    const cx = tip.rect.left + tip.rect.width / 2;

    let placement: "top" | "bottom" = tip.preferPos;
    if (placement === "top" && tip.rect.top - tipH - gap < margin) {
      placement = "bottom";
    } else if (placement === "bottom" && tip.rect.bottom + tipH + gap > window.innerHeight - margin) {
      placement = "top";
    }

    const rawLeft = cx - tipW / 2;
    const left = Math.max(margin, Math.min(rawLeft, window.innerWidth - tipW - margin));
    const top = placement === "top" ? tip.rect.top - tipH - gap : tip.rect.bottom + gap;
    const arrowX = Math.max(12, Math.min(tipW - 12, cx - left));

    setCoords({ left, top, placement, arrowX });
  }, [tip]);

  if (!tip) return null;

  const lines = tip.text.split("\n").filter((l) => l.length > 0);
  const isMultiline = lines.length > 1;

  return (
    <div
      ref={tipRef}
      role="tooltip"
      className={`ol-tooltip${coords ? " is-placed" : ""}${tip.instant ? " is-instant" : ""}${isMultiline ? " is-multiline" : ""}`}
      data-placement={coords?.placement || tip.preferPos}
      style={
        coords
          ? ({
              left: `${Math.round(coords.left)}px`,
              top: `${Math.round(coords.top)}px`,
              "--tip-arrow-x": `${Math.round(coords.arrowX)}px`,
            } as React.CSSProperties)
          : { left: "-9999px", top: "-9999px" }
      }
    >
      {isMultiline ? (
        <div className="ol-tooltip-stack">
          <div className="ol-tooltip-head">{lines[0]}</div>
          {lines.slice(1).map((line, i) => (
            <div key={i} className="ol-tooltip-line">
              {line}
            </div>
          ))}
        </div>
      ) : (
        <span className="ol-tooltip-text">{tip.text}</span>
      )}
    </div>
  );
}
