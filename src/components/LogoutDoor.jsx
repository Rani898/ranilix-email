// Animated "log out" icon: a little figure next to an open door. Hover → it walks in place.
// Click → it walks through the door, the door slams (the row shakes), and the figure tumbles
// out underneath and falls off the screen. Then the real log-out runs.
import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";

const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** The stick figure (24×24). `walking` swings the arms and legs. */
function Figure({ walking, className = "", style }) {
  return (
    <svg viewBox="0 0 24 24" className={`logout-fig ${walking ? "is-walking" : ""} ${className}`} style={style} aria-hidden="true"
      fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="13" cy="4" r="2.3" fill="currentColor" stroke="none" />
      <path d="M12 8 L10.5 14.5" />
      <g className="lf-arm-a"><path d="M11.8 9 L8.5 12" /></g>
      <g className="lf-arm-b"><path d="M11.8 9 L15 11.5" /></g>
      <g className="lf-leg-a"><path d="M10.5 14.5 L8 19 L6 19.5" /></g>
      <g className="lf-leg-b"><path d="M10.5 14.5 L13.5 18.5 L13 21.5" /></g>
    </svg>
  );
}

/**
 * The door + figure. `phase`: "idle" | "walk" (going in) | "slam" (door shut, figure gone) | "gone".
 * Drawn left-to-right; mirrored in RTL so the figure always walks toward the door.
 */
export function LogoutDoor({ phase = "idle", hover = false }) {
  const inside = phase !== "idle";
  return (
    <span className={`logout-door relative inline-block h-8 w-11 shrink-0 ${phase === "slam" ? "is-slam" : ""}`} aria-hidden="true">
      <span className="absolute inset-0 rtl:-scale-x-100">
        {/* Door: frame + leaf. Open = a light gap on the hinge side. */}
        <span className="absolute end-1 top-0.5 bottom-0.5 w-[15px] rounded-[3px] bg-[var(--color-chart)]">
          <span className="absolute end-[3px] top-1/2 h-[3px] w-[3px] -translate-y-1/2 rounded-full bg-white/90" />
        </span>
        <span className={`logout-gap absolute top-0.5 bottom-0.5 end-[19px] w-[3px] rounded-sm bg-white transition-transform duration-150 dark:bg-slate-200 ${inside && phase !== "walk" ? "scale-x-0" : ""}`} />
        {/* Motion lines when the door slams */}
        {phase === "slam" && <span className="logout-lines absolute end-[24px] top-1/2 -translate-y-1/2"><i /><i /><i /></span>}
        {/* Figure (clipped by the door's edge as it walks in) */}
        <span className="absolute inset-y-0 start-0 end-[19px] overflow-hidden">
          {phase !== "slam" && phase !== "gone" && (
            <Figure walking={hover || phase === "walk"} className={`absolute top-1 h-6 w-6 text-[var(--color-chart)] ${phase === "walk" ? "logout-walk-in" : "start-1"}`} />
          )}
        </span>
      </span>
    </span>
  );
}

/**
 * Hook for a log-out button: returns props for the button, the icon's phase, and the falling figure
 * portal. `run()` plays the animation, then calls `onDone`.
 */
export function useLogoutAnimation(onDone) {
  const [phase, setPhase] = useState("idle");
  const [hover, setHover] = useState(false);
  const [fall, setFall] = useState(null); // { x, y, rtl }
  const ref = useRef(null);
  const busy = useRef(false);

  const run = useCallback(() => {
    if (busy.current) return;
    if (reduced()) { onDone(); return; }
    busy.current = true;
    setPhase("walk");
    setTimeout(() => {
      setPhase("slam");
      const door = ref.current?.querySelector(".logout-door")?.getBoundingClientRect();
      if (door) setFall({ x: door.left + door.width / 2, y: door.bottom - 4, rtl: document.documentElement.dir === "rtl" });
    }, 520);
    setTimeout(() => setPhase("gone"), 760);
    setTimeout(() => { busy.current = false; onDone(); }, 1350);
  }, [onDone]);

  const portal = fall && createPortal(
    <span className="pointer-events-none fixed z-[100] text-[var(--color-chart)]" style={{ left: fall.x, top: fall.y }} aria-hidden="true">
      <span className={`logout-fall block ${fall.rtl ? "is-rtl" : ""}`}><Figure walking className="h-7 w-7 -translate-x-1/2" /></span>
    </span>,
    document.body,
  );

  return {
    ref,
    phase,
    hover,
    run,
    portal,
    hoverProps: { onMouseEnter: () => setHover(true), onMouseLeave: () => setHover(false), onFocus: () => setHover(true), onBlur: () => setHover(false) },
  };
}
