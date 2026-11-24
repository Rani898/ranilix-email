// "Basketball upload": files wait at the bottom like a ball — pull back to aim, release, and a
// basket starts the upload. A gentle aim-assist turns near misses into baskets, and there are
// always plain ways to upload (auto shot, shoot them all, just upload) so nobody is stuck.
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, CloudUpload, Volume2, VolumeX, Wand2, X, Zap } from "lucide-react";
import { useI18n } from "../lib/i18n.jsx";
import { formatBytes } from "../lib/validation.js";

const G = 1900; // gravity, px/s²
const PULL_MAX = 150; // px
const POWER = 8.2; // velocity per px of pull
const SOUND_KEY = "ranilix.court.sound";

const extOf = (name = "") => {
  const e = (name.split(".").pop() || "").toUpperCase();
  return e && e.length <= 4 && e !== name.toUpperCase() ? e : "FILE";
};

/** Where a ball launched from p0 with velocity v is when it comes down through y = rimY (or null). */
function crossing(p0, v, rimY) {
  // y(t) = p0.y + v.y t + G t²/2 = rimY, take the later (descending) root
  const a = G / 2, b = v.y, c = p0.y - rimY;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b + Math.sqrt(disc)) / (2 * a);
  if (t <= 0) return null;
  return { t, x: p0.x + v.x * t };
}

/** Same direction, exact speed to drop through the rim's centre (null if that direction can't). */
function exactShot(p0, v, rim) {
  const dx = rim.x - p0.x, up = p0.y - rim.y;
  if (Math.sign(dx) !== Math.sign(v.x) || v.y >= 0) return null;
  const theta = Math.atan2(-v.y, Math.abs(v.x));
  const adx = Math.abs(dx), k = adx * Math.tan(theta) - up;
  if (k <= 0) return null;
  const speed = Math.sqrt((G * adx * adx) / (2 * Math.cos(theta) ** 2 * k));
  const s = speed / Math.hypot(v.x, v.y);
  return { x: v.x * s, y: v.y * s };
}

function useSwish(on) {
  const ctx = useRef(null);
  return useCallback((kind) => {
    if (!on) return;
    try {
      ctx.current ||= new (window.AudioContext || window.webkitAudioContext)();
      const ac = ctx.current, now = ac.currentTime;
      if (kind === "swish") {
        const len = 0.35, buf = ac.createBuffer(1, ac.sampleRate * len, ac.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
        const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
        src.buffer = buf; f.type = "bandpass"; f.frequency.setValueAtTime(2400, now); f.frequency.exponentialRampToValueAtTime(700, now + len); g.gain.value = 0.35;
        src.connect(f).connect(g).connect(ac.destination); src.start();
      } else {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = "sine"; o.frequency.setValueAtTime(kind === "miss" ? 180 : 420, now); o.frequency.exponentialRampToValueAtTime(kind === "miss" ? 90 : 640, now + 0.12);
        g.gain.setValueAtTime(0.18, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        o.connect(g).connect(ac.destination); o.start(); o.stop(now + 0.2);
      }
    } catch { /* no audio */ }
  }, [on]);
}

export default function UploadCourt({ files: incoming, onShoot, onUploadAll, onClose, uploads }) {
  const { t, dir } = useI18n();
  const court = useRef(null);
  const ballRef = useRef(null);
  const [size, setSize] = useState({ w: 400, h: 470 });
  const [queue, setQueue] = useState(() => [...incoming]);
  const [drag, setDrag] = useState(null); // { start:{x,y}, pull:{x,y} }
  const [flight, setFlight] = useState(null); // { x, y, rot, scale, opacity }
  const [netHit, setNetHit] = useState(0);
  const [missMsg, setMissMsg] = useState(false);
  const [shotKeys, setShotKeys] = useState([]);
  const [doneKeys, setDoneKeys] = useState(() => new Set());
  const [dropping, setDropping] = useState(false);
  const [sound, setSound] = useState(() => { try { return localStorage.getItem(SOUND_KEY) !== "0"; } catch { return true; } });
  const busy = useRef(false);
  const auto = useRef(false);
  const play = useSwish(sound);
  const pickInput = useRef(null);

  useEffect(() => {
    const el = court.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const fresh = uploads.filter((u) => shotKeys.includes(u.key) && u.done && !u.error && !doneKeys.has(u.key));
    if (fresh.length) setDoneKeys((s) => new Set([...s, ...fresh.map((u) => u.key)]));
  }, [uploads, shotKeys, doneKeys]);
  useEffect(() => { try { localStorage.setItem(SOUND_KEY, sound ? "1" : "0"); } catch { /* ignore */ } }, [sound]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !drag && !flight) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drag, flight, onClose]);

  const { w, h } = size;
  const rim = { x: w / 2, y: 250 };
  const home = { x: dir === "rtl" ? w * 0.8 : w * 0.2, y: h - 62 };
  const ball = queue[0];

  const velocityFor = (pull) => {
    const len = Math.min(PULL_MAX, Math.hypot(pull.x, pull.y));
    const a = Math.atan2(pull.y, pull.x);
    return { x: -Math.cos(a) * len * POWER, y: -Math.sin(a) * len * POWER };
  };
  // Aim-assist: a firm enough pull aimed up toward the basket becomes a lob that drops in.
  const plan = (v0, from = home) => {
    const speed = Math.hypot(v0.x, v0.y);
    const toward = Math.sign(rim.x - from.x) === Math.sign(v0.x) || Math.abs(v0.x) < 1;
    const angle = (Math.atan2(-v0.y, Math.abs(v0.x)) * 180) / Math.PI; // above horizontal
    if (toward && angle >= 22 && speed >= 45 * POWER) {
      const lob = (deg) => exactShot(from, { x: Math.sign(rim.x - from.x) * Math.cos((deg * Math.PI) / 180), y: -Math.sin((deg * Math.PI) / 180) }, rim);
      for (let deg = 60 + Math.min(1, (angle - 22) / 60) * 18; deg <= 87; deg += 1) {
        const v = lob(deg);
        // Must be coming down when it reaches the rim (not rising through it).
        if (v) {
          const tx = (rim.x - from.x) / v.x, apexY = from.y - (v.y * v.y) / (2 * G);
          if (tx > 0 && tx > -v.y / G && apexY <= rim.y - 60) return { v, score: true, t: tx };
        }
      }
    }
    return { v: v0, score: false };
  };

  const shoot = useCallback((v0, score, from) => {
    if (busy.current || !queue.length) return;
    busy.current = true;
    const file = queue[0];
    let pos = { ...(from || home) }, vel = { ...v0 }, last = performance.now(), age = 0, sinking = null, bounced = false;
    play("pop");
    const finishMiss = () => {
      setFlight(null);
      setMissMsg(true);
      play("miss");
      setTimeout(() => setMissMsg(false), 1400);
      busy.current = false;
      auto.current = false;
    };
    const step = (now) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now; age += dt;
      if (sinking !== null) {
        // Through the net: shrink and fade, then upload.
        const k = Math.min(1, (age - sinking) / 0.32);
        setFlight({ x: rim.x, y: rim.y + k * 46, rot: age * 500, scale: 0.72 - k * 0.4, opacity: 1 - k, behind: true });
        if (k === 1) {
          setFlight(null);
          setNetHit((n) => n + 1);
          play("swish");
          const key = onShoot(file);
          if (key) setShotKeys((s) => [...s, key]);
          setQueue((q) => q.slice(1));
          busy.current = false;
          return;
        }
        requestAnimationFrame(step);
        return;
      }
      const prevY = pos.y;
      vel.y += G * dt;
      pos = { x: pos.x + vel.x * dt, y: pos.y + vel.y * dt };
      // Down through the rim — or off its edge.
      if (prevY < rim.y && pos.y >= rim.y && vel.y > 0) {
        const off = pos.x - rim.x;
        if (Math.abs(off) <= (score ? 34 : 26)) sinking = age;
        else if (!bounced && Math.abs(off) <= 52) {
          bounced = true;
          vel = { x: vel.x * 0.4 + Math.sign(off) * 160, y: -vel.y * 0.42 };
          pos = { ...pos, y: rim.y - 1 };
          play("miss");
        }
      }
      setFlight({ x: pos.x, y: pos.y, rot: age * (vel.x > 0 ? 540 : -540), scale: 1, opacity: 1, behind: false });
      if (sinking === null && (pos.y > h + 80 || pos.x < -80 || pos.x > w + 80 || age > 3)) { finishMiss(); return; }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [queue, home.x, home.y, rim.x, rim.y, h, w, onShoot, play]); // eslint-disable-line react-hooks/exhaustive-deps

  const shootAuto = () => { const { v } = plan({ x: Math.sign(rim.x - home.x) * 400, y: -900 }); shoot(v, true); };

  // "Shoot them all": one auto shot after another.
  useEffect(() => {
    if (!auto.current || busy.current || flight || !queue.length) { if (!queue.length) auto.current = false; return undefined; }
    const timer = setTimeout(() => shootAuto(), 260);
    return () => clearTimeout(timer);
  }, [queue, flight]); // eslint-disable-line react-hooks/exhaustive-deps

  const point = (e) => {
    const r = court.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onDown = (e) => {
    if (busy.current || !ball) return;
    e.preventDefault();
    ballRef.current?.setPointerCapture?.(e.pointerId);
    setDrag({ start: point(e), pull: { x: 0, y: 0 } });
  };
  const onMove = (e) => {
    if (!drag) return;
    const p = point(e);
    let pull = { x: p.x - drag.start.x, y: p.y - drag.start.y };
    const len = Math.hypot(pull.x, pull.y);
    if (len > PULL_MAX) pull = { x: (pull.x / len) * PULL_MAX, y: (pull.y / len) * PULL_MAX };
    setDrag({ ...drag, pull });
  };
  const onUp = () => {
    if (!drag) return;
    const { pull } = drag;
    setDrag(null);
    if (Math.hypot(pull.x, pull.y) < 18) return; // a tap, not a shot
    const { v, score } = plan(velocityFor(pull));
    shoot(v, score);
  };

  // Aiming dots: the real path, coloured when it's going in (and then drawn into the hoop).
  let dots = [], scoring = false;
  if (drag && Math.hypot(drag.pull.x, drag.pull.y) >= 18) {
    const from = home;
    const { v, score } = plan(velocityFor(drag.pull));
    scoring = score;
    const tHit = score ? (rim.x - from.x) / v.x : null;
    for (let i = 1; i <= 22; i++) {
      const tt = i * 0.04;
      const x = from.x + v.x * tt, y = from.y + v.y * tt + (G * tt * tt) / 2;
      if (tHit !== null && tt > tHit) break;
      dots.push({ x, y, o: 1 - i / 26 });
    }
  }

  const current = shotKeys.length ? uploads.find((u) => u.key === shotKeys[shotKeys.length - 1]) : null;
  const uploadedN = doneKeys.size;
  const ballPos = flight ? flight : drag ? { x: home.x + drag.pull.x, y: home.y + drag.pull.y, rot: 0, scale: 1, opacity: 1 } : { x: home.x, y: home.y, rot: 0, scale: 1, opacity: 1 };

  const addFiles = (list) => { if (list?.length) setQueue((q) => [...q, ...list]); };

  return (
    <div className="motion-ok fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-3 backdrop-blur-[2px]" onMouseDown={(e) => { if (e.target === e.currentTarget && !drag && !flight) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="court-title" className="w-full max-w-md rounded-[28px] border border-slate-200 bg-surface p-5 shadow-2xl sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="court-title" className="text-xl font-extrabold tracking-tight text-slate-900">{t("drive.court.title")}</h2>
            <p className="mt-0.5 text-sm text-slate-500">{t("drive.court.sub")}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button type="button" onClick={() => setSound((s) => !s)} className="grid h-8 w-8 place-items-center rounded-full text-slate-500 hover:bg-slate-100" aria-label={t(sound ? "drive.court.soundOff" : "drive.court.soundOn")} aria-pressed={sound}>
              {sound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums transition ${netHit ? "bg-brand-50 text-brand-700" : "bg-slate-100 text-slate-600"}`} key={uploadedN} style={{ animation: uploadedN ? "court-bump .35s ease" : undefined }}>
              {t("drive.court.uploaded", { n: uploadedN })}
            </span>
            <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full text-slate-500 hover:bg-slate-100" aria-label={t("drive.close")}><X className="h-4 w-4" /></button>
          </div>
        </div>

        <div ref={court} className="relative mt-4 h-[470px] touch-none select-none" dir="ltr" onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => setDrag(null)}>
          {/* Drop zone / progress card */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDropping(true); }}
            onDragLeave={() => setDropping(false)}
            onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setDropping(false); addFiles([...e.dataTransfer.files]); }}
            className={`absolute inset-x-0 top-0 h-[168px] rounded-2xl border-2 border-dashed p-3 transition ${dropping ? "border-brand-500 bg-brand-50/60" : "border-slate-200"}`}>
            {current ? (
              <div dir="auto" className="rounded-xl border border-slate-200 bg-surface p-3 shadow-sm" style={{ animation: "court-in .3s ease" }}>
                <div className="flex items-center gap-2 text-sm">
                  <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[10px] font-bold text-brand-700">{extOf(current.name)}</span>
                  <span className="min-w-0 flex-1 truncate font-semibold text-slate-800"><bdi>{current.name}</bdi></span>
                  <span className={`shrink-0 text-xs font-bold tabular-nums ${current.error ? "text-rose-600" : current.done ? "text-emerald-600" : "text-brand-700"}`}>
                    {current.error ? "!" : current.done ? t("drive.court.doneShort") : `${Math.round(current.progress * 100)}%`}
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full rounded-full transition-all duration-300 ${current.error ? "bg-rose-500" : current.done ? "bg-emerald-500" : "bg-brand-600"}`} style={{ width: `${current.error ? 100 : current.progress * 100}%` }} />
                </div>
                <p className={`mt-1.5 flex items-center justify-between gap-2 text-[11.5px] ${current.error ? "text-rose-600" : current.done ? "text-emerald-700" : "text-brand-700"}`}>
                  <span className="flex items-center gap-1">{current.done && !current.error && <Check className="h-3.5 w-3.5" />}{current.error || (current.done ? t("drive.court.done") : t("drive.court.uploading"))}</span>
                  <span className="tabular-nums text-slate-400"><bdi dir="ltr">{formatBytes(current.size)}</bdi></span>
                </p>
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <CloudUpload className="h-5 w-5 text-slate-700" aria-hidden="true" />
                <p className="mt-1.5 text-sm font-bold text-slate-800">{t("drive.court.drop")}</p>
                <p className="text-xs text-slate-400">{t("drive.court.or")}</p>
                <button type="button" onClick={() => pickInput.current?.click()} className="mt-2 rounded-full px-3 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50">{t("drive.court.choose")}</button>
              </div>
            )}
            <input ref={pickInput} type="file" multiple hidden onChange={(e) => { addFiles([...e.target.files]); e.target.value = ""; }} />
          </div>

          {/* Hoop: backboard, rim back, (ball behind net), net + rim front */}
          <div className="pointer-events-none absolute" style={{ left: rim.x - 46, top: rim.y - 66 }} aria-hidden="true">
            <div className="h-[62px] w-[92px] rounded-lg border-2 border-slate-300 bg-surface shadow-sm">
              <div className="mx-auto mt-[22px] h-[26px] w-[36px] rounded-sm border-2 border-slate-400" />
            </div>
          </div>
          <div className="pointer-events-none absolute h-[10px] w-[74px] rounded-[50%] border-[3px] border-brand-600/50" style={{ left: rim.x - 37, top: rim.y - 5 }} aria-hidden="true" />

          {ball && (flight?.behind) && <Ball file={queue[0]} pos={ballPos} count={queue.length} />}

          <svg key={netHit} className="pointer-events-none absolute" width="70" height="62" viewBox="0 0 70 62" style={{ left: rim.x - 35, top: rim.y, transformOrigin: "50% 0", animation: netHit ? "court-net .5s ease" : undefined }} aria-hidden="true">
            {[0, 1, 2, 3, 4, 5, 6].map((i) => <path key={i} d={`M${3 + i * 10.7},0 L${14 + i * 7},58`} stroke="currentColor" className="text-slate-400" strokeWidth="1.4" fill="none" />)}
            {[0, 1, 2, 3, 4, 5, 6].map((i) => <path key={`b${i}`} d={`M${3 + i * 10.7},0 L${-8 + i * 7 + 14},58`} stroke="currentColor" className="text-slate-400" strokeWidth="1.4" fill="none" />)}
            {[14, 30, 46].map((y) => <path key={y} d={`M${3 + y * 0.19},${y} L${67 - y * 0.19},${y}`} stroke="currentColor" className="text-slate-300" strokeWidth="1.2" />)}
          </svg>
          <div className="pointer-events-none absolute h-[12px] w-[74px] rounded-[50%] border-[3.5px] border-brand-600 border-t-transparent" style={{ left: rim.x - 37, top: rim.y - 6 }} aria-hidden="true" />

          {/* Aim dots */}
          {dots.map((d, i) => (
            <span key={i} className={`pointer-events-none absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${scoring ? "bg-brand-600" : "bg-slate-400"}`} style={{ left: d.x, top: d.y, opacity: d.o }} />
          ))}

          {/* The ball (the next file) */}
          {ball && !flight?.behind && (
            <button
              ref={ballRef}
              type="button"
              onPointerDown={onDown}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); shootAuto(); } }}
              aria-label={t("drive.court.ballLabel", { name: ball.name })}
              className="absolute -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-300 active:cursor-grabbing"
              style={{ left: ballPos.x, top: ballPos.y, transform: `translate(-50%,-50%) rotate(${ballPos.rot}deg) scale(${ballPos.scale})`, opacity: ballPos.opacity }}>
              <BallFace file={ball} count={queue.length} idle={!flight && !drag} />
            </button>
          )}
          {/* Home spot */}
          <span className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 rounded-full border-2 border-slate-300" style={{ left: home.x, top: home.y + 40 }} aria-hidden="true" />

          {missMsg && <p className="pointer-events-none absolute inset-x-0 top-[330px] text-center text-sm font-bold text-amber-600" style={{ animation: "court-in .25s ease" }}>{t("drive.court.miss")}</p>}
        </div>

        <p className="mt-1 text-center text-xs text-slate-500" aria-live="polite">
          {!ball ? t("drive.court.empty") : drag ? t(scoring ? "drive.court.release" : "drive.court.aim") : queue.length > 1 ? t("drive.court.left", { n: queue.length }) : t("drive.court.hint")}
        </p>
        {ball && (
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <button type="button" disabled={!!flight} onClick={() => shootAuto()} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Wand2 className="h-3.5 w-3.5" />{t("drive.court.auto")}</button>
            {queue.length > 1 && <button type="button" disabled={!!flight} onClick={() => { auto.current = true; shootAuto(); }} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Zap className="h-3.5 w-3.5" />{t("drive.court.all")}</button>}
            <button type="button" disabled={!!flight} onClick={() => { onUploadAll(queue); setQueue([]); }} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-50"><CloudUpload className="h-3.5 w-3.5" />{t("drive.court.plain")}</button>
          </div>
        )}
      </div>
    </div>
  );
}

function BallFace({ file, count, idle }) {
  return (
    <span className="relative block h-[58px] w-[46px] rounded-lg border border-slate-200 bg-surface shadow-[0_8px_18px_-8px_rgb(30_40_90/0.45)]" style={{ animation: idle ? "court-idle 1.8s ease-in-out infinite" : undefined }}>
      <span className="absolute end-0 top-0 h-3 w-3 rounded-bl-md border-b border-s border-slate-200 bg-slate-100" />
      <span className="absolute inset-x-2 top-3 space-y-1"><i className="block h-[3px] rounded bg-slate-200" /><i className="block h-[3px] w-3/4 rounded bg-slate-200" /></span>
      <span className="absolute bottom-2 start-1.5 rounded bg-brand-600 px-1 text-[8.5px] font-bold leading-[14px] text-white">{extOf(file.name)}</span>
      {count > 1 && <span className="absolute -top-2 -end-2 grid h-5 min-w-5 place-items-center rounded-full bg-ink px-1 text-[10px] font-bold text-white">{count}</span>}
    </span>
  );
}

function Ball({ file, pos, count }) {
  return (
    <span className="pointer-events-none absolute" style={{ left: pos.x, top: pos.y, transform: `translate(-50%,-50%) rotate(${pos.rot}deg) scale(${pos.scale})`, opacity: pos.opacity }}>
      <BallFace file={file} count={count} />
    </span>
  );
}
