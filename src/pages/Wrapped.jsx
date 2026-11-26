// "Ranilix Wrapped": the person's year in email, as full-screen stories (tap to advance, hold to
// pause), ending with a summary card they can share as an image.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { CalendarDays, Clock, Download, HardDrive, Loader2, Mail, PenLine, Receipt, RotateCcw, Send, Share2, Shield, Sparkles, Star, X } from "lucide-react";
import { BRAND } from "../config.js";
import { getSession, useSessionVersion } from "../lib/session.js";
import { useErrorText, useI18n } from "../lib/i18n.jsx";
import { formatBytes } from "../lib/validation.js";
import { AuthError, wrapped as fetchWrapped } from "../lib/api.js";

const SLIDE_MS = 6500;

/** Counts up to `to` when `run` turns on. */
function useCount(to, run, ms = 1300) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!run) { setV(0); return undefined; }
    let raf; const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / ms);
      setV(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, run, ms]);
  return v;
}

function Big({ value, active, className = "" }) {
  const { locale } = useI18n();
  const v = useCount(value, active);
  return <span className={`block font-black tabular-nums tracking-[-0.04em] ${className}`}>{new Intl.NumberFormat(locale).format(v)}</span>;
}

/** Personality from the year's data (first match wins). */
function personaOf(d) {
  const shield = d.tempAddresses + d.siteAddresses;
  if (shield >= 3) return { id: "guard", icon: Shield };
  if (d.sent >= 10 && d.sent >= d.received * 0.5) return { id: "writer", icon: PenLine };
  if (d.driveFiles >= 20) return { id: "collector", icon: HardDrive };
  if (d.receipts >= 5) return { id: "accountant", icon: Receipt };
  if (d.events >= 5) return { id: "planner", icon: CalendarDays };
  if (d.received >= 500) return { id: "magnet", icon: Mail };
  if (d.received < 30) return { id: "calm", icon: Sparkles };
  return { id: "rising", icon: Star };
}

const BG = [
  "from-[#2547ea] via-[#4a3df0] to-[#8b6cf6]",
  "from-[#0b1238] via-[#1d2b74] to-[#2547ea]",
  "from-[#ff5f6d] via-[#f43f7a] to-[#7c3aed]",
  "from-[#0f766e] via-[#0e9f87] to-[#3ee0b0]",
  "from-[#1e1b4b] via-[#4c1d95] to-[#db2777]",
  "from-[#f59e0b] via-[#f97316] to-[#e11d48]",
  "from-[#0b1238] via-[#312e81] to-[#7c3aed]",
  "from-[#2547ea] via-[#0ea5e9] to-[#22d3ee]",
];

/** The share image (1080×1920), drawn on a canvas. */
async function drawCard(d, t, locale, dir) {
  await document.fonts?.ready;
  const c = document.createElement("canvas"); c.width = 1080; c.height = 1920;
  const x = c.getContext("2d");
  const g = x.createLinearGradient(0, 0, 1080, 1920);
  g.addColorStop(0, "#2547ea"); g.addColorStop(0.55, "#4a3df0"); g.addColorStop(1, "#8b6cf6");
  x.fillStyle = g; x.fillRect(0, 0, 1080, 1920);
  // soft glow
  const r = x.createRadialGradient(880, 260, 10, 880, 260, 700); r.addColorStop(0, "rgba(255,255,255,.28)"); r.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = r; x.fillRect(0, 0, 1080, 1920);
  const font = (w, s) => `${w} ${s}px Heebo, Inter, sans-serif`;
  x.direction = dir; x.textAlign = dir === "rtl" ? "right" : "left";
  const X = dir === "rtl" ? 990 : 90;
  const num = (v) => new Intl.NumberFormat(locale).format(v);
  x.fillStyle = "rgba(255,255,255,.75)"; x.font = font(700, 40); x.fillText(`${BRAND.short} Wrapped`, X, 150);
  x.fillStyle = "#fff"; x.font = font(900, 210); x.fillText(String(d.year), X, 380);
  x.font = font(600, 46); x.fillStyle = "rgba(255,255,255,.85)"; x.fillText(d.email, X, 460);
  const p = personaOf(d);
  x.fillStyle = "rgba(255,255,255,.14)"; x.beginPath(); x.roundRect(90, 530, 900, 190, 40); x.fill();
  x.fillStyle = "rgba(255,255,255,.7)"; x.font = font(600, 36); x.fillText(t("wrapped.youAre"), X - (dir === "rtl" ? 40 : -40), 600);
  x.fillStyle = "#fff"; x.font = font(900, 72); x.fillText(t(`wrapped.persona.${p.id}.name`), X - (dir === "rtl" ? 40 : -40), 685);
  const stats = [
    [t("wrapped.card.received"), num(d.received)], [t("wrapped.card.sent"), num(d.sent)],
    [t("wrapped.card.shield"), num(d.tempAddresses + d.siteAddresses)], [t("wrapped.card.caught"), num(d.shieldCaught)],
    [t("wrapped.card.drive"), num(d.driveFiles)], [t("wrapped.card.starred"), num(d.starred)],
  ];
  stats.forEach(([label, v], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const bx = dir === "rtl" ? 990 - col * 460 : 90 + col * 460, by = 820 + row * 270;
    x.fillStyle = "rgba(255,255,255,.12)"; x.beginPath(); x.roundRect(dir === "rtl" ? bx - 440 : bx, by, 440, 240, 36); x.fill();
    const tx = dir === "rtl" ? bx - 40 : bx + 40;
    x.fillStyle = "#fff"; x.font = font(900, 96); x.fillText(v, tx, by + 130);
    x.fillStyle = "rgba(255,255,255,.75)"; x.font = font(600, 36); x.fillText(label, tx, by + 195);
  });
  if (d.topPercent) { x.fillStyle = "#fff"; x.font = font(800, 50); x.fillText(t("wrapped.card.top", { n: d.topPercent }), X, 1700); }
  x.fillStyle = "rgba(255,255,255,.8)"; x.font = font(700, 40); x.fillText(t("wrapped.card.cta", { domain: BRAND.domain }), X, 1820);
  return new Promise((res) => c.toBlob(res, "image/png"));
}

export default function WrappedPage() {
  useSessionVersion();
  if (!getSession()) return <Navigate to="/login" replace />;
  return <Wrapped />;
}

function Wrapped() {
  const { t, locale, dir } = useI18n();
  const errorText = useErrorText();
  const navigate = useNavigate();
  const [d, setD] = useState(null);
  const [error, setError] = useState("");
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [sharing, setSharing] = useState(false);
  const holdTimer = useRef(null);
  const held = useRef(false);

  useEffect(() => {
    fetchWrapped().then(setD).catch((e) => { if (e instanceof AuthError) navigate("/login"); else setError(errorText(e)); });
  }, [errorText, navigate]);

  useEffect(() => {
    const original = document.title;
    document.title = `${t("wrapped.title", { year: d?.year || new Date().getFullYear() })} · ${BRAND.short}`;
    return () => { document.title = original; };
  }, [t, d]);

  const monthName = (m) => new Date(2024, m - 1, 1).toLocaleDateString(locale, { month: "long" });
  const dayName = (w) => new Date(2024, 0, 7 + w).toLocaleDateString(locale, { weekday: "long" }); // 2024-01-07 is a Sunday
  const num = (v) => new Intl.NumberFormat(locale).format(v);

  const slides = useMemo(() => {
    if (!d) return [];
    const s = ["intro", "received"];
    if (d.sent > 0) s.push("sent");
    if (d.topSenders.length) s.push("senders");
    if (d.busiestWeekday !== null && d.received > 0) s.push("rhythm");
    if (d.tempAddresses + d.siteAddresses > 0) s.push("shield");
    if (d.driveFiles > 0) s.push("drive");
    if (d.receipts + d.events + d.mochiChats + d.starred > 0) s.push("extras");
    s.push("persona", "summary");
    return s;
  }, [d]);
  const last = slides.length - 1;
  const id = slides[i];

  // Auto-advance (not on the last slide), paused while holding.
  useEffect(() => {
    if (!d || paused || i >= last) return undefined;
    let raf; let t0 = performance.now() - elapsed;
    const step = (now) => {
      const e = now - t0;
      if (e >= SLIDE_MS) { setElapsed(0); setI((v) => Math.min(last, v + 1)); return; }
      setElapsed(e);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [d, i, paused, last]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = useCallback((delta) => { setElapsed(0); setI((v) => Math.max(0, Math.min(last, v + delta))); }, [last]);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") navigate("/inbox");
      if (e.key === "ArrowRight") go(dir === "rtl" ? -1 : 1);
      if (e.key === "ArrowLeft") go(dir === "rtl" ? 1 : -1);
      if (e.key === " ") { e.preventDefault(); setPaused((p) => !p); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, dir, navigate]);

  const onDown = () => { held.current = false; holdTimer.current = setTimeout(() => { held.current = true; setPaused(true); }, 220); };
  const onUp = (e) => {
    clearTimeout(holdTimer.current);
    if (held.current) { setPaused(false); return; }
    if (id === "summary" && e.target.closest("button, a")) return;
    const r = e.currentTarget.getBoundingClientRect();
    const fromStart = dir === "rtl" ? r.right - e.clientX : e.clientX - r.left;
    go(fromStart < r.width * 0.3 ? -1 : 1);
  };

  const share = async () => {
    setSharing(true);
    try {
      const blob = await drawCard(d, t, locale, dir);
      const file = new File([blob], `ranilix-wrapped-${d.year}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: t("wrapped.title", { year: d.year }), text: t("wrapped.shareText", { domain: BRAND.domain }) });
      } else {
        const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      }
    } catch { /* cancelled */ }
    setSharing(false);
  };

  if (error) {
    return (
      <div className="grid min-h-dvh place-items-center bg-[#0b1238] p-6 text-center text-white">
        <div><p>{error}</p><Link to="/inbox" className="mt-4 inline-block rounded-full bg-white/15 px-5 py-2.5 font-semibold">{t("wrapped.back")}</Link></div>
      </div>
    );
  }
  if (!d) return <div className="grid min-h-dvh place-items-center bg-[#0b1238] text-white/70"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  const persona = personaOf(d);
  const PIcon = persona.icon;
  const maxMonth = Math.max(1, ...d.months);

  return (
    <div className="motion-ok fixed inset-0 grid place-items-center bg-[#05081c] sm:p-6">
      <div className={`wr-slide relative h-full w-full overflow-hidden bg-gradient-to-br text-white sm:h-[min(860px,100%)] sm:max-w-[440px] sm:rounded-[32px] sm:shadow-2xl ${BG[i % BG.length]}`}
        onPointerDown={onDown} onPointerUp={onUp} onPointerCancel={() => { clearTimeout(holdTimer.current); setPaused(false); }}
        role="region" aria-roledescription={t("wrapped.story")} aria-label={t("wrapped.title", { year: d.year })}>
        {/* glow blobs */}
        <span className="wr-blob pointer-events-none absolute -top-24 -end-24 h-72 w-72 rounded-full bg-white/20 blur-3xl" aria-hidden="true" />
        <span className="wr-blob2 pointer-events-none absolute -bottom-32 -start-24 h-80 w-80 rounded-full bg-black/20 blur-3xl" aria-hidden="true" />

        {/* progress */}
        <div className="absolute inset-x-3 top-3 z-10 flex gap-1" aria-hidden="true">
          {slides.map((s, k) => (
            <span key={s} className="h-1 flex-1 overflow-hidden rounded-full bg-white/30">
              <i className="block h-full rounded-full bg-white" style={{ width: k < i ? "100%" : k > i ? "0%" : i === last ? "100%" : `${(elapsed / SLIDE_MS) * 100}%` }} />
            </span>
          ))}
        </div>
        <div className="absolute inset-x-3 top-6 z-10 flex items-center justify-between">
          <span className="text-xs font-bold tracking-wide text-white/80">{BRAND.short} Wrapped {d.year}</span>
          <button type="button" onPointerUp={(e) => e.stopPropagation()} onClick={() => navigate("/inbox")} className="grid h-10 w-10 place-items-center rounded-full bg-white/10 hover:bg-white/20" aria-label={t("wrapped.close")}><X className="h-5 w-5" /></button>
        </div>

        <div key={id} className="wr-in relative flex h-full flex-col justify-center px-7 pt-16 pb-12" aria-live="polite">
          {id === "intro" && (
            <>
              <p className="wr-up text-lg font-semibold text-white/80">{t("wrapped.intro.kicker")}</p>
              <h1 className="wr-up mt-2 text-[110px] font-black leading-none tracking-[-0.05em]" style={{ animationDelay: ".15s" }}>{d.year}</h1>
              <p className="wr-up mt-4 text-2xl font-bold leading-snug" style={{ animationDelay: ".35s" }}>{t("wrapped.intro.title")}</p>
              {d.daysWithUs && <p className="wr-up mt-6 text-white/75" style={{ animationDelay: ".55s" }}>{t("wrapped.intro.days", { n: num(d.daysWithUs) })}</p>}
              <p className="wr-up absolute inset-x-7 bottom-10 text-center text-sm text-white/60" style={{ animationDelay: "1s" }}>{t("wrapped.tapHint")}</p>
            </>
          )}
          {id === "received" && (
            <>
              <p className="wr-up text-xl font-semibold text-white/80">{t("wrapped.received.kicker")}</p>
              <Big value={d.received} active className="wr-up text-[96px] leading-none" />
              <p className="wr-up text-2xl font-bold">{t("wrapped.received.unit")}</p>
              <div className="wr-up mt-8 flex h-28 items-end gap-1.5" style={{ animationDelay: ".4s" }} aria-hidden="true">
                {d.months.map((v, k) => (
                  <span key={k} className={`wr-bar flex-1 rounded-t-md ${k + 1 === d.busiestMonth ? "bg-white" : "bg-white/35"}`} style={{ height: `${Math.max(4, (v / maxMonth) * 100)}%`, animationDelay: `${0.45 + k * 0.05}s` }} />
                ))}
              </div>
              {d.busiestMonth && <p className="wr-up mt-3 text-white/85" style={{ animationDelay: ".9s" }}>{t("wrapped.received.month", { month: monthName(d.busiestMonth) })}</p>}
              {d.topPercent && <p className="wr-up mt-5 inline-flex w-fit rounded-full bg-white/15 px-4 py-2 font-bold" style={{ animationDelay: "1.2s" }}>{t("wrapped.received.top", { n: d.topPercent })}</p>}
            </>
          )}
          {id === "sent" && (
            <>
              <Send className="wr-pop h-14 w-14" aria-hidden="true" />
              <p className="wr-up mt-6 text-xl font-semibold text-white/80">{t("wrapped.sent.kicker")}</p>
              <Big value={d.sent} active className="wr-up text-[96px] leading-none" />
              <p className="wr-up text-2xl font-bold">{t("wrapped.sent.unit")}</p>
              <p className="wr-up mt-6 text-lg text-white/85" style={{ animationDelay: ".6s" }}>
                {d.sent >= d.received ? t("wrapped.sent.more") : t("wrapped.sent.ratio", { n: Math.max(1, Math.round(d.received / Math.max(1, d.sent))) })}
              </p>
            </>
          )}
          {id === "senders" && (
            <>
              <p className="wr-up text-xl font-semibold text-white/80">{t("wrapped.senders.kicker")}</p>
              <ol className="mt-6 space-y-3">
                {d.topSenders.map((s, k) => (
                  <li key={s.addr} className="wr-up flex items-center gap-4 rounded-3xl bg-white/12 p-4" style={{ animationDelay: `${0.25 + k * 0.25}s` }}>
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white text-2xl font-black text-[#2547ea]">{k + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-lg font-bold"><bdi>{s.name || s.addr.split("@")[0]}</bdi></span>
                      <span dir="ltr" className="block truncate text-sm text-white/70 rtl:text-right">{s.addr}</span>
                    </span>
                    <span className="text-end"><b className="block text-2xl tabular-nums">{num(s.count)}</b><span className="text-xs text-white/70">{t("wrapped.senders.emails")}</span></span>
                  </li>
                ))}
              </ol>
            </>
          )}
          {id === "rhythm" && (
            <>
              <Clock className="wr-pop h-14 w-14" aria-hidden="true" />
              <p className="wr-up mt-6 text-xl font-semibold text-white/80">{t("wrapped.rhythm.kicker")}</p>
              <p className="wr-up mt-2 text-5xl font-black leading-tight" style={{ animationDelay: ".2s" }}>{dayName(d.busiestWeekday)}</p>
              {d.busiestHour !== null && <p className="wr-up mt-1 text-4xl font-black text-white/90" style={{ animationDelay: ".4s" }}>{t("wrapped.rhythm.hour", { h: String(d.busiestHour).padStart(2, "0") })}</p>}
              {d.busiestDay && (
                <p className="wr-up mt-8 rounded-3xl bg-white/12 p-4 text-lg" style={{ animationDelay: ".8s" }}>
                  {t("wrapped.rhythm.day", { date: new Date(`${d.busiestDay.day}T12:00:00`).toLocaleDateString(locale, { day: "numeric", month: "long" }), n: num(d.busiestDay.count) })}
                </p>
              )}
            </>
          )}
          {id === "shield" && (
            <>
              <Shield className="wr-pop h-16 w-16" aria-hidden="true" />
              <p className="wr-up mt-6 text-xl font-semibold text-white/85">{t("wrapped.shield.kicker")}</p>
              <Big value={d.tempAddresses + d.siteAddresses} active className="wr-up text-[96px] leading-none" />
              <p className="wr-up text-2xl font-bold">{t("wrapped.shield.unit")}</p>
              {d.shieldCaught > 0 && <p className="wr-up mt-8 rounded-3xl bg-black/15 p-4 text-lg" style={{ animationDelay: ".7s" }}>{t("wrapped.shield.caught", { n: num(d.shieldCaught) })}</p>}
            </>
          )}
          {id === "drive" && (
            <>
              <HardDrive className="wr-pop h-14 w-14" aria-hidden="true" />
              <p className="wr-up mt-6 text-xl font-semibold text-white/85">{t("wrapped.drive.kicker")}</p>
              <Big value={d.driveFiles} active className="wr-up text-[96px] leading-none" />
              <p className="wr-up text-2xl font-bold">{t("wrapped.drive.unit", { size: <bdi dir="ltr">{formatBytes(d.driveBytes)}</bdi> })}</p>
              {d.driveShared > 0 && <p className="wr-up mt-8 text-lg text-white/90" style={{ animationDelay: ".6s" }}>{t("wrapped.drive.shared", { n: num(d.driveShared) })}</p>}
            </>
          )}
          {id === "extras" && (
            <>
              <p className="wr-up text-xl font-semibold text-white/85">{t("wrapped.extras.kicker")}</p>
              <div className="mt-6 grid grid-cols-2 gap-3">
                {[[Star, d.starred, "starred"], [Receipt, d.receipts, "receipts"], [CalendarDays, d.events, "events"], [Sparkles, d.mochiChats, "mochi"]].filter(([, v]) => v > 0).map(([Icon, v, k], j) => (
                  <div key={k} className="wr-up rounded-3xl bg-white/12 p-4" style={{ animationDelay: `${0.2 + j * 0.18}s` }}>
                    <Icon className="h-6 w-6 text-white/85" aria-hidden="true" />
                    <b className="mt-2 block text-4xl font-black tabular-nums">{num(v)}</b>
                    <span className="text-sm text-white/80">{t(`wrapped.extras.${k}`)}</span>
                  </div>
                ))}
              </div>
              {d.receiptsIls > 0 && <p className="wr-up mt-5 text-white/85" style={{ animationDelay: "1s" }}>{t("wrapped.extras.spent", { n: num(d.receiptsIls) })}</p>}
            </>
          )}
          {id === "persona" && (
            <div className="text-center">
              <p className="wr-up text-xl font-semibold text-white/80">{t("wrapped.youAre")}</p>
              <span className="wr-pop mx-auto mt-6 grid h-28 w-28 place-items-center rounded-[34px] bg-white text-[#4a3df0] shadow-2xl" style={{ animationDelay: ".3s" }}><PIcon className="h-14 w-14" aria-hidden="true" /></span>
              <h2 className="wr-up mt-6 text-5xl font-black" style={{ animationDelay: ".6s" }}>{t(`wrapped.persona.${persona.id}.name`)}</h2>
              <p className="wr-up mx-auto mt-4 max-w-xs text-lg text-white/85" style={{ animationDelay: ".9s" }}>{t(`wrapped.persona.${persona.id}.text`)}</p>
            </div>
          )}
          {id === "summary" && (
            <>
              <p className="wr-up text-sm font-bold uppercase tracking-widest text-white/70">{BRAND.short} Wrapped</p>
              <h2 className="wr-up text-6xl font-black">{d.year}</h2>
              <p dir="ltr" className="wr-up truncate text-white/80 rtl:text-right">{d.email}</p>
              <div className="wr-up mt-5 rounded-3xl bg-white/14 p-4" style={{ animationDelay: ".15s" }}>
                <p className="text-sm text-white/75">{t("wrapped.youAre")}</p>
                <p className="flex items-center gap-2 text-2xl font-black"><PIcon className="h-6 w-6" aria-hidden="true" />{t(`wrapped.persona.${persona.id}.name`)}</p>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                {[["received", d.received], ["sent", d.sent], ["shield", d.tempAddresses + d.siteAddresses], ["caught", d.shieldCaught], ["drive", d.driveFiles], ["starred", d.starred]].map(([k, v], j) => (
                  <div key={k} className="wr-up rounded-3xl bg-white/12 px-4 py-3" style={{ animationDelay: `${0.25 + j * 0.07}s` }}>
                    <b className="block text-3xl font-black tabular-nums">{num(v)}</b>
                    <span className="text-xs text-white/75">{t(`wrapped.card.${k}`)}</span>
                  </div>
                ))}
              </div>
              <div className="wr-up mt-6 flex flex-wrap gap-2.5" style={{ animationDelay: ".7s" }}>
                <button type="button" onClick={share} disabled={sharing} className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-white px-5 py-3.5 font-bold text-[#2547ea] shadow-lg disabled:opacity-70">
                  {sharing ? <Loader2 className="h-5 w-5 animate-spin" /> : navigator.share ? <Share2 className="h-5 w-5" /> : <Download className="h-5 w-5" />}{t("wrapped.share")}
                </button>
                <button type="button" onClick={() => { setElapsed(0); setI(0); }} className="inline-flex items-center gap-2 rounded-full bg-white/15 px-5 py-3.5 font-semibold" aria-label={t("wrapped.replay")}><RotateCcw className="h-5 w-5" /></button>
              </div>
            </>
          )}
        </div>
        {paused && <span className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/30 px-3 py-1 text-xs font-semibold">{t("wrapped.paused")}</span>}
      </div>
    </div>
  );
}
