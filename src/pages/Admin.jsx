import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  Palette,
  ImagePlus,
  ArrowLeft,
  Check,
  Copy,
  Eye,
  Flag,
  MoreHorizontal,
  Headset,
  Hourglass,
  RotateCcw,
  HardDrive,
  KeyRound,
  Link2,
  LayoutDashboard,
  LifeBuoy,
  Loader2,
  Mail,
  Mails,
  Megaphone,
  Menu,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  UserX,
  Wand2,
  X,
} from "lucide-react";
import { BRAND, DEMO_MODE } from "../config.js";
import LogoMark from "../components/LogoMark.jsx";
import Preferences from "../components/Preferences.jsx";
import { AnnouncementBanner, Button, Modal, Toggle } from "../components/ui.jsx";
import { getSession } from "../lib/session.js";
import { getMe, removeSkinBackground, removeSkinSticker, saveSkin, uploadSkinBackground, uploadSkinSticker } from "../lib/api.js";
import { applySkin, skinImage, useSkin } from "../lib/skin.js";
import { Mochi } from "../components/SkinDecor.jsx";
import { adminApi } from "../lib/adminApi.js";
import { useErrorText, useI18n } from "../lib/i18n.jsx";
import { formatBytes } from "../lib/validation.js";
import SupportTab from "./AdminSupport.jsx";

const DAY = 24 * 3600 * 1000;
const STAFF_TABS = ["support", "reports"];
const TABS = [
  { id: "overview", icon: LayoutDashboard },
  { id: "users", icon: Users },
  { id: "broadcast", icon: Megaphone },
  { id: "support", icon: LifeBuoy },
  { id: "reports", icon: Flag },
  { id: "settings", icon: Settings },
  { id: "look", icon: Palette },
];

/* ---------- My look (only for the admin who sets it) ---------- */

const LOOKS = [
  { id: "default", swatch: ["#2547ea", "#eef4ff", "#ffffff"] },
  { id: "noya", swatch: ["#db2f74", "#ffc6db", "#fff0f6"] },
];

function LookTab({ toast }) {
  const { t } = useI18n();
  const errorText = useErrorText();
  const skin = useSkin();
  const [nickname, setNickname] = useState(skin.nickname || "");
  const [busy, setBusy] = useState("");
  const file = useRef(null);
  const stickerFile = useRef(null);
  useEffect(() => { setNickname(skin.nickname || ""); }, [skin.nickname]);
  const run = async (what, fn, done) => {
    setBusy(what);
    try { applySkin(await fn()); if (done) toast(done); } catch (e) { toast(errorText(e)); }
    setBusy("");
  };
  const pick = (id) => run(id, () => saveSkin({ skin: id, ...(id === "noya" && !skin.nickname && !nickname ? { nickname: t("admin.look.defaultName") } : {}) }), t("admin.look.saved"));
  const onFile = (kind) => (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!/^image\//.test(f.type)) { toast(t("admin.look.notImage")); return; }
    const max = kind === "bg" ? 8 : 2;
    if (f.size > max * 1024 * 1024) { toast(t("admin.look.tooBig", { mb: max })); return; }
    const up = kind === "bg" ? uploadSkinBackground : uploadSkinSticker;
    run(kind, async () => { const s = await up(f); return s.skin === "noya" ? s : saveSkin({ skin: "noya" }); }, t(kind === "bg" ? "admin.look.bgSaved" : "admin.look.stickerSaved"));
  };
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">{t("admin.look.title")}</h1>
        <p className="mt-1 text-slate-600">{t("admin.look.intro")}</p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-surface p-5">
        <h2 className="font-bold text-slate-900">{t("admin.look.pickTitle")}</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {LOOKS.map((l) => {
            const on = (skin.skin || "default") === l.id;
            return (
              <button key={l.id} type="button" onClick={() => !on && pick(l.id)} disabled={!!busy} aria-pressed={on}
                className={`relative flex items-center gap-4 rounded-2xl border-2 p-4 text-start transition ${on ? "border-brand-600 bg-brand-50" : "border-slate-200 hover:border-slate-300"}`}>
                <span className="flex shrink-0 -space-x-2 rtl:space-x-reverse">
                  {l.swatch.map((c) => <span key={c} className="h-9 w-9 rounded-full border-2 border-white shadow" style={{ background: c }} />)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-slate-900">{t(`admin.look.${l.id}`)}</span>
                  <span className="block text-sm text-slate-500">{t(`admin.look.${l.id}Hint`)}</span>
                </span>
                {l.id === "noya" && <Mochi size={48} />}
                {on && <span className="absolute -top-2 end-3 rounded-full bg-brand-600 px-2 py-0.5 text-xs font-bold text-white">{t("admin.look.active")}</span>}
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-surface p-5">
        <h2 className="font-bold text-slate-900">{t("admin.look.nameTitle")}</h2>
        <p className="mt-1 text-sm text-slate-500">{t("admin.look.nameHint")}</p>
        <form className="mt-3 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); run("name", () => saveSkin({ nickname }), t("admin.look.saved")); }}>
          <input value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={30} placeholder={t("admin.look.defaultName")} aria-label={t("admin.look.nameTitle")}
            className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-surface px-3 py-2.5 text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100" />
          <Button type="submit" disabled={!!busy}>{t("admin.look.saveName")}</Button>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-surface p-5">
        <h2 className="font-bold text-slate-900">{t("admin.look.bgTitle")}</h2>
        <p className="mt-1 text-sm text-slate-500">{t("admin.look.bgHint")}</p>
        <div className="mt-4 grid aspect-[16/7] place-items-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 bg-cover bg-center"
          style={skin.background ? { backgroundImage: `url("${skinImage(skin.background)}")` } : undefined}>
          {!skin.background && <span className="flex flex-col items-center gap-1 text-sm text-slate-500"><ImagePlus className="h-7 w-7" aria-hidden="true" />{t("admin.look.noBg")}</span>}
        </div>
        <input ref={file} type="file" accept="image/*" className="hidden" onChange={onFile("bg")} />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={() => file.current?.click()} disabled={!!busy}>{busy === "bg" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}{t(skin.background ? "admin.look.changeBg" : "admin.look.addBg")}</Button>
          {skin.background && <Button variant="ghost" disabled={!!busy} onClick={() => run("rmbg", () => removeSkinBackground(), t("admin.look.bgRemoved"))}>{t("admin.look.removeBg")}</Button>}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-surface p-5">
        <h2 className="font-bold text-slate-900">{t("admin.look.stickerTitle")}</h2>
        <p className="mt-1 text-sm text-slate-500">{t("admin.look.stickerHint")}</p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <span className="grid h-24 w-24 place-items-center rounded-2xl bg-brand-50">
            {skin.sticker ? <img src={skinImage(skin.sticker)} alt="" className="h-20 w-20 object-contain" /> : <Mochi size={72} />}
          </span>
          <div className="flex flex-wrap gap-2">
            <input ref={stickerFile} type="file" accept="image/png,image/webp,image/gif,image/jpeg" className="hidden" onChange={onFile("sticker")} />
            <Button onClick={() => stickerFile.current?.click()} disabled={!!busy}>{busy === "sticker" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}{t(skin.sticker ? "admin.look.changeSticker" : "admin.look.addSticker")}</Button>
            {skin.sticker && <Button variant="ghost" disabled={!!busy} onClick={() => run("rmst", () => removeSkinSticker(), t("admin.look.stickerRemoved"))}>{t("admin.look.removeSticker")}</Button>}
          </div>
        </div>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-surface p-5">
        <div>
          <h2 className="font-bold text-slate-900">{t("admin.look.resetTitle")}</h2>
          <p className="mt-1 text-sm text-slate-500">{t("admin.look.resetHint")}</p>
        </div>
        <Button variant="ghost" disabled={!!busy || (skin.skin || "default") === "default"} onClick={() => pick("default")}><RotateCcw className="h-4 w-4" />{t("admin.look.reset")}</Button>
      </section>
      <p className="text-xs text-slate-500">{t("admin.look.onlyYou")}</p>
    </div>
  );
}

/* ---------- small helpers ---------- */

function useFormatters() {
  const { locale } = useI18n();
  return useMemo(() => {
    const num = new Intl.NumberFormat(locale);
    const rel = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    return {
      num: (n) => num.format(n),
      date: (ts) => new Date(ts).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" }),
      dateTime: (ts) => new Date(ts).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }),
      dayLabel: (ts) => new Date(ts).toLocaleDateString(locale, { day: "numeric", month: "numeric" }),
      relative: (ts) => {
        const diff = ts - Date.now();
        const abs = Math.abs(diff);
        if (abs < 3600 * 1000) return rel.format(Math.round(diff / 60000), "minute");
        if (abs < DAY) return rel.format(Math.round(diff / 3600000), "hour");
        if (abs < 30 * DAY) return rel.format(Math.round(diff / DAY), "day");
        return new Date(ts).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
      },
    };
  }, [locale]);
}

function randomPassword() {
  const sets = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnopqrstuvwxyz", "23456789", "!@#$%&*?"];
  const all = sets.join("");
  const pick = (s) => s[crypto.getRandomValues(new Uint32Array(1))[0] % s.length];
  const chars = [...sets.map(pick), ...Array.from({ length: 8 }, () => pick(all))];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

function Card({ children, className = "" }) {
  return <section className={`rounded-2xl border border-slate-200 bg-surface ${className}`}>{children}</section>;
}

function PageHeader({ title, subtitle, children }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-slate-600">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function Spinner() {
  return <div className="grid place-items-center py-24 text-slate-400"><Loader2 className="h-7 w-7 animate-spin" /></div>;
}

/* ---------- Overview ---------- */

function StatTile({ icon: Icon, label, value, note }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-600">{label}</p>
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-50 text-brand-600"><Icon className="h-4 w-4" aria-hidden="true" /></span>
      </div>
      <p className="mt-3 text-3xl font-extrabold tabular-nums tracking-tight text-slate-900"><bdi dir="ltr">{value}</bdi></p>
      {note && <p className="mt-1 text-xs font-medium text-slate-500">{note}</p>}
    </Card>
  );
}

function SignupChart({ data }) {
  const { t } = useI18n();
  const f = useFormatters();
  const [hover, setHover] = useState(null);
  const max = Math.max(4, ...data.map((d) => d.count));
  const top = Math.ceil(max / 4) * 4; // a round top value so gridlines land on whole numbers
  const total = data.reduce((n, d) => n + d.count, 0);

  return (
    <Card className="p-5 lg:col-span-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-bold text-slate-900">{t("admin.overview.chartTitle")}</h2>
        <p className="text-sm tabular-nums text-slate-500">{t("admin.overview.chartTotal", { n: f.num(total) })}</p>
      </div>

      <div className="relative mt-6 h-56" dir="ltr">
        {/* gridlines + values */}
        {[0, 0.5, 1].map((p) => (
          <div key={p} className="absolute inset-x-0 flex items-center gap-2" style={{ bottom: `calc((100% - 1.75rem) * ${p * 0.86} + 1.75rem)`, transform: "translateY(50%)" }}>
            <span className="w-6 text-end text-[11px] tabular-nums text-slate-500">{f.num(Math.round(top * p))}</span>
            <span className="h-px flex-1 bg-slate-200" />
          </div>
        ))}
        {/* bars */}
        <div className="absolute inset-0 flex items-end gap-1.5 ps-8 pb-7 sm:gap-2" aria-hidden="true">
          {data.map((d, i) => (
            <div
              key={d.day}
              className="relative flex h-full flex-1 cursor-default items-end justify-center"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              <div
                className={`w-full max-w-7 rounded-t-[4px] transition-opacity ${hover !== null && hover !== i ? "opacity-40" : ""}`}
                style={{ height: `${(d.count / top) * 86}%`, minHeight: d.count ? 3 : 0, background: "var(--color-chart)" }}
              />
              {hover === i && (
                <div className={`pointer-events-none absolute top-0 z-10 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-center text-xs text-white shadow-lg ${i > data.length - 3 ? "end-0" : i < 2 ? "start-0" : ""}`}>
                  <span className="block font-semibold tabular-nums">{t("admin.overview.chartTooltip", { n: f.num(d.count) })}</span>
                  <span className="block text-white/70">{f.date(d.day)}</span>
                </div>
              )}
              <span className={`absolute -bottom-6 text-[11px] tabular-nums text-slate-500 ${i % 2 ? "max-sm:hidden" : ""}`}>{f.dayLabel(d.day)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Same data as a table for screen readers */}
      <table className="sr-only">
        <caption>{t("admin.overview.chartTitle")}</caption>
        <thead><tr><th>{t("admin.overview.day")}</th><th>{t("admin.overview.count")}</th></tr></thead>
        <tbody>{data.map((d) => <tr key={d.day}><td>{f.date(d.day)}</td><td>{d.count}</td></tr>)}</tbody>
      </table>
    </Card>
  );
}

function Overview({ go }) {
  const { t } = useI18n();
  const f = useFormatters();
  const errorText = useErrorText();
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([adminApi.stats(), adminApi.broadcasts()])
      .then(([s, b]) => { setStats(s); setRecent(b.broadcasts.slice(0, 3)); })
      .catch((e) => setError(errorText(e)));
  }, [errorText]);

  if (error) return <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>;
  if (!stats) return <Spinner />;

  return (
    <div className="space-y-6">
      <PageHeader title={t("admin.overview.title")} subtitle={t("admin.overview.subtitle")} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={Users} label={t("admin.overview.users")} value={f.num(stats.users)} note={t("admin.overview.newToday", { n: f.num(stats.newToday) })} />
        <StatTile icon={UserPlus} label={t("admin.overview.newWeek")} value={f.num(stats.newWeek)} note={`${t("admin.overview.activeWeek")}: ${f.num(stats.activeWeek)}`} />
        <StatTile icon={Mail} label={t("admin.overview.receivedToday")} value={f.num(stats.receivedToday)} />
        <StatTile icon={HardDrive} label={t("admin.overview.storage")} value={formatBytes(stats.storageBytes)} note={t("admin.overview.filesCount", { n: f.num(stats.files) })} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <SignupChart data={stats.signups} />
        <Card className="flex flex-col p-5">
          <p className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${stats.signupsOpen ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
            <span className={`h-2 w-2 rounded-full ${stats.signupsOpen ? "bg-emerald-500" : "bg-amber-500"}`} />
            {stats.signupsOpen ? t("admin.overview.signupsOpen") : t("admin.overview.signupsClosed")}
          </p>
          <div className="mt-4 grid gap-2">
            <Button onClick={() => go("broadcast")}><Megaphone className="h-4 w-4" /> {t("admin.overview.quickBroadcast")}</Button>
            <Button variant="ghost" onClick={() => go("reports")}><Flag className="h-4 w-4" /> {t("admin.reports.quick", { n: f.num(stats.openReports || 0) })}</Button>
            <Button variant="ghost" onClick={() => go("settings")}><Settings className="h-4 w-4" /> {t("admin.overview.quickSettings")}</Button>
          </div>
          <h3 className="mt-6 text-sm font-semibold text-slate-700">{t("admin.overview.recent")}</h3>
          {recent.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">{t("admin.overview.noBroadcasts")}</p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100">
              {recent.map((b) => (
                <li key={b.id} className="py-2.5">
                  <p dir="auto" className="truncate text-sm font-medium text-slate-800">{b.subject}</p>
                  <p className="text-xs text-slate-500">{f.relative(b.createdAt)} · {t("admin.broadcast.recipients", { n: f.num(b.recipients) })}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ---------- Users ---------- */

/** One "Actions" button per user: a menu with every option and a short line on what it does. */
function UserActionsMenu({ user, onPick }) {
  const { t } = useI18n();
  const [pos, setPos] = useState(null); // where the open menu sits (fixed, so the table's scroll box can't clip it)
  const btn = useRef(null);
  const menu = useRef(null);
  const open = !!pos;

  const toggle = () => {
    if (open) return setPos(null);
    const r = btn.current.getBoundingClientRect();
    const width = 300;
    const rtl = document.documentElement.dir === "rtl";
    const left = Math.min(Math.max(8, rtl ? r.left : r.right - width), window.innerWidth - width - 8);
    const below = window.innerHeight - r.bottom;
    setPos(below > 560 || below > r.top ? { left, top: r.bottom + 6, width } : { left, bottom: window.innerHeight - r.top + 6, width });
  };

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!menu.current?.contains(e.target) && !btn.current?.contains(e.target)) setPos(null); };
    const onKey = (e) => { if (e.key === "Escape") { setPos(null); btn.current?.focus(); } };
    const onScroll = (e) => { if (!menu.current?.contains(e.target)) setPos(null); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    menu.current?.querySelector("button")?.focus();
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  const m = (k) => t(`admin.users.menu.${k}`);
  const items = [
    { kind: "linked", icon: Link2, title: m("linked"), desc: m("linkedDesc") },
    { kind: "accounts", icon: Mails, title: m("accounts"), desc: m("accountsDesc") },
    { kind: "drive", icon: HardDrive, title: m("drive"), desc: m("driveDesc") },
    { kind: "reset", icon: KeyRound, title: m("reset"), desc: m("resetDesc") },
    ...(user.admin ? [] : [
      { kind: "staff", icon: Headset, title: m("staff"), desc: m("staffDesc"), on: !!user.staff },
      { kind: "temp", icon: Hourglass, title: m("temp"), desc: m("tempDesc"), on: !!user.tempAccess },
      { sep: true },
      user.suspended
        ? { kind: "restore", icon: UserCheck, title: m("restore"), desc: m("restoreDesc") }
        : { kind: "suspend", icon: UserX, title: m("suspend"), desc: m("suspendDesc"), warn: true },
      { kind: "delete", icon: Trash2, title: m("delete"), desc: m("deleteDesc"), danger: true },
    ]),
  ];
  const onKeyNav = (e) => {
    if (!["ArrowDown", "ArrowUp"].includes(e.key)) return;
    e.preventDefault();
    const list = [...menu.current.querySelectorAll("button")];
    const i = list.indexOf(document.activeElement);
    list[(i + (e.key === "ArrowDown" ? 1 : -1) + list.length) % list.length]?.focus();
  };

  return (
    <>
      <button ref={btn} type="button" onClick={toggle} aria-haspopup="menu" aria-expanded={open} aria-label={t("admin.users.menu.open", { email: user.email })}
        className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold transition ${open ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-700 hover:bg-slate-100"}`}>
        {t("admin.users.menu.label")} <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>
      {open && (
        <div ref={menu} role="menu" aria-label={t("admin.users.menu.open", { email: user.email })} onKeyDown={onKeyNav}
          className="fixed z-50 max-h-[min(40rem,calc(100dvh-1rem))] overflow-y-auto rounded-2xl border border-slate-200 bg-surface p-1.5 text-start shadow-xl animate-[supportIn_.12s_ease-out]"
          style={{ left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width }}>
          <p dir="ltr" className="truncate px-3 pb-1.5 pt-1 text-xs font-semibold text-slate-500 rtl:text-right">{user.email}</p>
          {items.map((it, i) => it.sep ? <div key={`sep${i}`} className="my-1.5 border-t border-slate-100" role="separator" /> : (
            <button key={it.kind} type="button" role="menuitem" onClick={() => { setPos(null); onPick(it.kind); }}
              className={`flex w-full items-start gap-3 rounded-xl px-3 py-2 text-start transition focus:outline-none ${it.danger ? "hover:bg-rose-50 focus:bg-rose-50" : "hover:bg-slate-50 focus:bg-slate-100"}`}>
              <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${it.danger ? "bg-rose-50 text-rose-600" : it.warn ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}><it.icon className="h-4 w-4" aria-hidden="true" /></span>
              <span className="min-w-0 flex-1">
                <span className={`flex items-center gap-2 text-sm font-semibold ${it.danger ? "text-rose-700" : "text-slate-900"}`}>
                  {it.title}
                  {it.on !== undefined && (
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${it.on ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{it.on ? m("on") : m("off")}</span>
                  )}
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{it.desc}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function RolePills({ user }) {
  const { t } = useI18n();
  if (user.admin || (!user.staff && !user.tempAccess)) return null;
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {user.staff && <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700"><Headset className="h-3 w-3" /> {t("admin.users.staffPill")}</span>}
      {user.tempAccess && <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700"><Hourglass className="h-3 w-3" /> {t("admin.users.tempPill")}</span>}
    </span>
  );
}

function StatusPill({ user }) {
  const { t } = useI18n();
  if (user.admin) return <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700"><ShieldCheck className="h-3.5 w-3.5" /> {t("admin.users.admin")}</span>;
  if (user.suspended) return <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700"><span className="h-1.5 w-1.5 rounded-full bg-rose-500" /> {t("admin.users.suspended")}</span>;
  return <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> {t("admin.users.active")}</span>;
}

function IconAction({ label, onClick, icon: Icon, danger, active }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
      className={`grid h-9 w-9 place-items-center rounded-lg transition hover:bg-slate-100 ${active ? "bg-brand-50 text-brand-700" : "text-slate-500"} ${danger ? "hover:text-rose-600" : "hover:text-slate-900"}`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function SuspendModal({ user, onClose, onDone }) {
  const { t } = useI18n();
  const errorText = useErrorText();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async () => {
    setBusy(true);
    try { await adminApi.setSuspended(user.id, true); onDone(); } catch (e) { setError(errorText(e)); setBusy(false); }
  };
  return (
    <Modal tone="danger" title={t("admin.users.suspendTitle", { email: user.email })} onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>{t("admin.users.cancel")}</Button><Button variant="danger" onClick={run} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{t("admin.users.suspendButton")}</Button></>}>
      <p>{t("admin.users.suspendText")}</p>
      {error && <p role="alert" className="mt-3 text-rose-600">{error}</p>}
    </Modal>
  );
}

function ResetModal({ user, onClose, onDone }) {
  const { t } = useI18n();
  const errorText = useErrorText();
  const [password, setPassword] = useState(randomPassword);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const copy = async () => {
    try { await navigator.clipboard.writeText(password); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  };
  const run = async () => {
    setBusy(true);
    try { await adminApi.resetPassword(user.id, password); onDone(); } catch (e) { setError(errorText(e)); setBusy(false); }
  };
  return (
    <Modal title={t("admin.users.resetTitle", { email: user.email })} onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>{t("admin.users.cancel")}</Button><Button onClick={run} disabled={busy || password.length < 8}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{t("admin.users.setPassword")}</Button></>}>
      <p>{t("admin.users.resetText")}</p>
      <label htmlFor="new-password" className="mt-4 block text-sm font-semibold text-slate-800">{t("admin.users.newPassword")}</label>
      <div className="mt-1.5 flex gap-2">
        <input id="new-password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-surface px-3 py-2.5 font-mono text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100" />
        <IconAction label={t("admin.users.generate")} icon={Wand2} onClick={() => setPassword(randomPassword())} />
        <IconAction label={copied ? t("admin.users.copied") : t("admin.users.copy")} icon={copied ? Check : Copy} onClick={copy} />
      </div>
      {error && <p role="alert" className="mt-3 text-rose-600">{error}</p>}
    </Modal>
  );
}

const MBYTES = 1024 * 1024;

/** Drive size for one person: any amount up to everything the storage holds. */
function DriveQuotaModal({ user, onClose, onDone }) {
  const { t } = useI18n();
  const errorText = useErrorText();
  const [info, setInfo] = useState(null);
  const [unit, setUnit] = useState(user.drive?.quota >= 1024 * MBYTES ? "GB" : "MB");
  const [value, setValue] = useState(() => {
    const q = user.drive?.quota || 0;
    return String(q >= 1024 * MBYTES ? +(q / 1024 / MBYTES).toFixed(2) : Math.round(q / MBYTES));
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { adminApi.settings().then((s) => setInfo(s.drive)).catch(() => setInfo({ capacityMb: 1024 })); }, []);
  const maxMb = info?.capacityMb ?? 0;
  const mb = Number(value) * (unit === "GB" ? 1024 : 1);
  const valid = info && Number.isFinite(mb) && mb >= 0 && mb <= maxMb;
  const run = async (quotaMb) => {
    setBusy(true);
    try { await adminApi.setDriveQuota(user.id, quotaMb); onDone(); } catch (e) { setError(errorText(e)); setBusy(false); }
  };
  const presets = [100, 500, 1024, 5 * 1024, 10 * 1024].filter((p) => !info || p <= maxMb);
  const fmt = (m) => (m >= 1024 ? `${+(m / 1024).toFixed(1)} GB` : `${m} MB`);
  return (
    <Modal title={t("admin.users.driveTitle", { email: user.email })} onClose={onClose}
      footer={<>
        {user.drive?.custom && <Button variant="ghost" className="me-auto" onClick={() => run(null)} disabled={busy}>{t("admin.users.driveReset")}</Button>}
        <Button variant="ghost" onClick={onClose}>{t("admin.users.cancel")}</Button>
        <Button onClick={() => run(Math.round(mb * 100) / 100)} disabled={busy || !valid}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{t("admin.users.driveSave")}</Button>
      </>}>
      <p>{t("admin.users.driveText")}</p>
      <p className="mt-3 font-semibold text-slate-800">{t("admin.users.driveUsed", { used: formatBytes(user.drive?.used || 0), quota: formatBytes(user.drive?.quota || 0) })}</p>
      {!info ? <Loader2 className="mt-4 h-5 w-5 animate-spin text-slate-400" /> : (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            {presets.map((p) => (
              <button key={p} type="button" onClick={() => { setUnit(p >= 1024 ? "GB" : "MB"); setValue(String(p >= 1024 ? p / 1024 : p)); }}
                className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${Math.abs(mb - p) < 0.01 ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 text-slate-700 hover:border-brand-400"}`}><bdi dir="ltr">{fmt(p)}</bdi></button>
            ))}
            <button type="button" onClick={() => { setUnit(maxMb >= 1024 ? "GB" : "MB"); setValue(String(maxMb >= 1024 ? +(maxMb / 1024).toFixed(2) : maxMb)); }}
              className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${Math.abs(mb - maxMb) < 0.01 ? "border-brand-600 bg-brand-600 text-white" : "border-violet-300 bg-violet-50 text-violet-700 hover:border-violet-500"}`}>{t("admin.users.driveMaxBtn", { max: fmt(maxMb) })}</button>
          </div>
          <label htmlFor="drive-quota" className="mt-4 block text-sm font-semibold text-slate-800">{t("admin.users.driveLabel")}</label>
          <div className="mt-1.5 flex items-center gap-2">
            <input id="drive-quota" type="number" min="0" step="any" inputMode="decimal" dir="ltr" value={value} onChange={(e) => setValue(e.target.value)}
              className="w-32 rounded-xl border border-slate-300 bg-surface px-3 py-2.5 text-center text-lg font-bold tabular-nums text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100" />
            <div className="inline-flex rounded-xl border border-slate-300 p-1">
              {["MB", "GB"].map((u2) => (
                <button key={u2} type="button" aria-pressed={unit === u2} onClick={() => setUnit(u2)} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${unit === u2 ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{u2}</button>
              ))}
            </div>
          </div>
          <p className={`mt-2 text-sm ${valid ? "text-slate-500" : "text-rose-600"}`}>{t("admin.users.driveMax", { max: fmt(maxMb) })}</p>
          {info.backend === "kv" && <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">{t("admin.users.driveKvNote")}</p>}
        </>
      )}
      {error && <p role="alert" className="mt-3 text-rose-600">{error}</p>}
    </Modal>
  );
}

function StaffModal({ user, onClose, onDone }) {
  const { t } = useI18n();
  const errorText = useErrorText();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const adding = !user.staff;
  const run = async () => {
    setBusy(true);
    try { await adminApi.setStaff(user.id, adding); onDone(); } catch (e) { setError(errorText(e)); setBusy(false); }
  };
  return (
    <Modal title={t(adding ? "admin.users.staffAddTitle" : "admin.users.staffRemoveTitle", { email: user.email })} onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>{t("admin.users.cancel")}</Button><Button variant={adding ? "primary" : "danger"} onClick={run} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{t(adding ? "admin.users.staffAdd" : "admin.users.staffRemove")}</Button></>}>
      <p>{t(adding ? "admin.users.staffAddText" : "admin.users.staffRemoveText")}</p>
      {adding && (
        <ul className="mt-3 space-y-1.5 text-sm">
          {t("admin.users.staffCan").map((x) => <li key={x} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />{x}</li>)}
          {t("admin.users.staffCannot").map((x) => <li key={x} className="flex gap-2 text-slate-500"><X className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />{x}</li>)}
        </ul>
      )}
      {error && <p role="alert" className="mt-3 text-rose-600">{error}</p>}
    </Modal>
  );
}

function LinkedList({ user, onPick }) {
  const { t } = useI18n();
  const f = useFormatters();
  const list = user.linked?.length ? user.linked : [{ id: user.id, email: user.email, createdAt: user.createdAt, main: true }];
  return (
    <ul className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
      {list.map((a) => (
        <li key={a.id} className={`flex items-center gap-3 px-3 py-2.5 ${a.id === user.id ? "bg-brand-50" : ""}`}>
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700" aria-hidden="true">{a.email[0].toUpperCase()}</span>
          <div className="min-w-0 flex-1">
            {onPick && a.id !== user.id
              ? <button type="button" onClick={() => onPick(a.email)} className="block truncate font-medium text-brand-700 hover:underline" dir="ltr">{a.email}</button>
              : <span dir="ltr" className="block truncate font-medium text-slate-900">{a.email}</span>}
            <span className="text-xs text-slate-500">{t("admin.users.linkedCreated", { date: f.date(a.createdAt) })}</span>
          </div>
          {a.main && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">{t("admin.users.linkedMain")}</span>}
          {a.id === user.id && <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-700">{t("admin.users.linkedThis")}</span>}
        </li>
      ))}
    </ul>
  );
}

function LinkedModal({ user, onClose, onPick }) {
  const { t } = useI18n();
  const n = user.linked?.length || 1;
  return (
    <Modal title={t("admin.users.linkedTitle", { email: user.email })} onClose={onClose}
      footer={<Button variant="ghost" onClick={onClose}>{t("admin.users.close")}</Button>}>
      <p>{n > 1 ? t("admin.users.linkedText", { n }) : t("admin.users.linkedNone")}</p>
      <LinkedList user={user} onPick={onPick} />
      <p className="mt-3 text-xs text-slate-500">{t("admin.users.linkedHint")}</p>
    </Modal>
  );
}

function AccountsModal({ user, onClose, onDone }) {
  const { t } = useI18n();
  const errorText = useErrorText();
  const used = user.accounts?.used ?? 1;
  const [max, setMax] = useState(String(user.accounts?.max ?? 5));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const n = Number(max);
  const valid = Number.isInteger(n) && n >= 1 && n <= 100;
  const run = async () => {
    setBusy(true);
    try { await adminApi.setAccountLimit(user.id, n); onDone(); } catch (e) { setError(errorText(e)); setBusy(false); }
  };
  return (
    <Modal title={t("admin.users.accountsTitle", { email: user.email })} onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>{t("admin.users.cancel")}</Button><Button onClick={run} disabled={busy || !valid}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{t("admin.users.accountsSave")}</Button></>}>
      <p>{t("admin.users.accountsText")}</p>
      <p className="mt-3 font-semibold text-slate-800">{t("admin.users.accountsUsed", { used, max: user.accounts?.max ?? 5 })}</p>
      <LinkedList user={user} />
      <label htmlFor="accounts-max" className="mt-4 block text-sm font-semibold text-slate-800">{t("admin.users.accountsLabel")}</label>
      <div className="mt-1.5 flex items-center gap-2">
        <button type="button" onClick={() => setMax(String(Math.max(1, (Number(max) || 1) - 1)))} className="grid h-11 w-11 place-items-center rounded-xl border border-slate-300 text-lg font-bold text-slate-700 hover:bg-slate-100" aria-label="-1">−</button>
        <input id="accounts-max" type="number" min="1" max="100" inputMode="numeric" dir="ltr" value={max} onChange={(e) => setMax(e.target.value)}
          className="w-24 rounded-xl border border-slate-300 bg-surface px-3 py-2.5 text-center text-lg font-bold tabular-nums text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100" />
        <button type="button" onClick={() => setMax(String(Math.min(100, (Number(max) || 0) + 1)))} className="grid h-11 w-11 place-items-center rounded-xl border border-slate-300 text-lg font-bold text-slate-700 hover:bg-slate-100" aria-label="+1">+</button>
      </div>
      {!valid && <p className="mt-2 text-rose-600">{t("errors.accounts_range")}</p>}
      {error && <p role="alert" className="mt-3 text-rose-600">{error}</p>}
    </Modal>
  );
}

function DeleteModal({ user, onClose, onDone }) {
  const { t } = useI18n();
  const errorText = useErrorText();
  const name = user.email.split("@")[0];
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async () => {
    setBusy(true);
    try { await adminApi.deleteUser(user.id, confirm); onDone(); } catch (e) { setError(errorText(e)); setBusy(false); }
  };
  return (
    <Modal tone="danger" title={t("admin.users.deleteTitle", { email: user.email })} onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>{t("admin.users.cancel")}</Button><Button variant="danger" onClick={run} disabled={busy || confirm.toLowerCase() !== name}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{t("admin.users.deleteButton")}</Button></>}>
      <p>{t("admin.users.deleteText")}</p>
      <label htmlFor="delete-confirm" className="mt-4 block text-sm font-semibold text-slate-800">{t("admin.users.deleteConfirm", { name: <code dir="ltr" className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-900">{name}</code> })}</label>
      <input id="delete-confirm" dir="ltr" autoComplete="off" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-surface px-3 py-2.5 font-mono text-sm text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-4 focus:ring-rose-200" />
      {error && <p role="alert" className="mt-3 text-rose-600">{error}</p>}
    </Modal>
  );
}

function UsersTab({ toast }) {
  const { t } = useI18n();
  const f = useFormatters();
  const errorText = useErrorText();
  const [q, setQ] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState(null); // { kind, user }

  const load = useCallback(async (query, append = false, offset = 0) => {
    try {
      const res = await adminApi.users(query, offset);
      setData((prev) => (append && prev ? { total: res.total, users: [...prev.users, ...res.users] } : res));
      setError("");
    } catch (e) { setError(errorText(e)); }
  }, [errorText]);

  useEffect(() => {
    const timer = setTimeout(() => load(q), 250);
    return () => clearTimeout(timer);
  }, [q, load]);

  const restore = async (u) => {
    try { await adminApi.setSuspended(u.id, false); toast(t("admin.users.restoredToast", { email: u.email })); load(q); } catch (e) { toast(errorText(e)); }
  };
  const done = (msgKey, u) => () => { setDialog(null); toast(t(msgKey, { email: u.email })); load(q); };
  const toggleTemp = async (u) => {
    try {
      await adminApi.setTempAccess(u.id, !u.tempAccess);
      toast(t(u.tempAccess ? "admin.users.tempRemovedToast" : "admin.users.tempAddedToast", { email: u.email }));
      load(q);
    } catch (e) { toast(errorText(e)); }
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t("admin.users.title")} subtitle={data ? t("admin.users.subtitle", { n: f.num(data.total) }) : " "}>
        <label className="flex w-full items-center gap-2 rounded-xl border border-slate-300 bg-surface px-3 focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-100 sm:w-72">
          <Search className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
          <input id="user-search" dir="ltr" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("admin.users.search")} aria-label={t("admin.users.search")} className="w-full bg-transparent py-2.5 text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none rtl:text-right" />
        </label>
      </PageHeader>

      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
      {!data ? <Spinner /> : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  {["user", "joined", "lastLogin", "messages", "storage", "drive", "addresses", "status"].map((k) => (
                    <th key={k} scope="col" className={`px-4 py-3 font-semibold ${["messages", "storage", "drive", "addresses"].includes(k) ? "text-end" : "text-start"}`}>{t(`admin.users.${k}`)}</th>
                  ))}
                  <th scope="col" className="px-4 py-3 text-end font-semibold"><span className="sr-only">{t("admin.users.actions")}</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.users.length === 0 && (
                  <tr><td colSpan={9} className="px-4 py-12 text-center text-slate-500">{t("admin.users.empty")}</td></tr>
                )}
                {data.users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700" aria-hidden="true">{u.email[0].toUpperCase()}</span>
                        <div className="min-w-0">
                          <span dir="ltr" className="block truncate font-medium text-slate-900">{u.email}</span>
                          {u.linked?.length > 1 && (
                            <button type="button" onClick={() => setDialog({ kind: "linked", user: u })} className="mt-0.5 inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-700 hover:bg-violet-100">
                              <Link2 className="h-3 w-3" aria-hidden="true" />{t("admin.users.linkedBadge", { n: u.linked.length - 1 })}
                            </button>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{f.date(u.createdAt)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{u.lastLoginAt ? f.relative(u.lastLoginAt) : <span className="text-slate-400">{t("admin.users.never")}</span>}</td>
                    <td className="px-4 py-3 text-end tabular-nums text-slate-700">{f.num(u.messages)}</td>
                    <td className="px-4 py-3 text-end tabular-nums text-slate-700"><bdi dir="ltr">{formatBytes(u.storageBytes)}</bdi></td>
                    <td className="px-4 py-3 text-end tabular-nums text-slate-700">
                      <button type="button" onClick={() => setDialog({ kind: "drive", user: u })} className="whitespace-nowrap rounded-lg px-2 py-1 text-xs font-semibold hover:bg-slate-100" title={t("admin.users.driveAction")}>
                        <bdi dir="ltr">{u.drive ? `${formatBytes(u.drive.used)} / ${formatBytes(u.drive.quota)}` : "–"}</bdi>
                      </button>
                    </td>
                    <td className="px-4 py-3 text-end tabular-nums text-slate-700">
                      <button type="button" onClick={() => setDialog({ kind: "accounts", user: u })} className="rounded-lg px-2 py-1 font-semibold hover:bg-slate-100" title={t("admin.users.accountsAction")}>
                        <bdi dir="ltr">{u.admin ? "∞" : u.accounts ? `${u.accounts.used}/${u.accounts.max}` : "–"}</bdi>
                      </button>
                    </td>
                    <td className="px-4 py-3"><StatusPill user={u} /><RolePills user={u} /></td>
                    <td className="px-4 py-2 text-end">
                      <UserActionsMenu user={u} onPick={(kind) => {
                        if (kind === "restore") restore(u);
                        else if (kind === "temp") toggleTemp(u);
                        else setDialog({ kind, user: u });
                      }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.users.length < data.total && (
            <div className="border-t border-slate-200 p-3 text-center">
              <Button variant="ghost" onClick={() => load(q, true, data.users.length)}>{t("admin.users.loadMore")}</Button>
            </div>
          )}
        </Card>
      )}

      {dialog?.kind === "suspend" && <SuspendModal user={dialog.user} onClose={() => setDialog(null)} onDone={done("admin.users.suspendedToast", dialog.user)} />}
      {dialog?.kind === "reset" && <ResetModal user={dialog.user} onClose={() => setDialog(null)} onDone={done("admin.users.resetDone", dialog.user)} />}
      {dialog?.kind === "drive" && <DriveQuotaModal user={dialog.user} onClose={() => setDialog(null)} onDone={done("admin.users.driveDone", dialog.user)} />}
      {dialog?.kind === "staff" && <StaffModal user={dialog.user} onClose={() => setDialog(null)} onDone={done(dialog.user.staff ? "admin.users.staffRemovedToast" : "admin.users.staffAddedToast", dialog.user)} />}
      {dialog?.kind === "linked" && <LinkedModal user={dialog.user} onClose={() => setDialog(null)} onPick={(email) => { setDialog(null); setQ(email.split("@")[0]); }} />}
      {dialog?.kind === "accounts" && <AccountsModal user={dialog.user} onClose={() => setDialog(null)} onDone={done("admin.users.accountsDone", dialog.user)} />}
      {dialog?.kind === "delete" && <DeleteModal user={dialog.user} onClose={() => setDialog(null)} onDone={done("admin.users.deletedToast", dialog.user)} />}
    </div>
  );
}

/* ---------- Reports ---------- */

const REPORT_TONE = {
  bug: "bg-rose-50 text-rose-700",
  idea: "bg-violet-50 text-violet-700",
  spam: "bg-amber-50 text-amber-800",
  account: "bg-sky-50 text-sky-700",
  other: "bg-slate-100 text-slate-700",
};

/** "Mozilla/5.0 (iPhone…) … Safari" → "Safari · iPhone" */
function deviceName(ua = "") {
  const os = /iPhone|iPad/.test(ua) ? (ua.match(/iPhone|iPad/)[0]) : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "";
  const browser = /Edg\//.test(ua) ? "Edge" : /SamsungBrowser/.test(ua) ? "Samsung Internet" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "";
  return [browser, os].filter(Boolean).join(" · ") || ua.slice(0, 40);
}

function ReportsTab({ toast, onCount }) {
  const { t } = useI18n();
  const f = useFormatters();
  const errorText = useErrorText();
  const [status, setStatus] = useState("open");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async (s) => {
    try {
      const res = await adminApi.reports(s);
      setData(res);
      onCount(res.open);
      setError("");
    } catch (e) { setError(errorText(e)); }
  }, [errorText, onCount]);

  useEffect(() => { setData(null); load(status); }, [status, load]);

  const act = async (fn, msg) => {
    try { await fn(); toast(t(msg)); load(status); } catch (e) { toast(errorText(e)); }
  };

  const filters = [["open", data?.open], ["resolved", data?.resolved], ["all", data ? data.open + data.resolved : undefined]];

  return (
    <div className="space-y-6">
      <PageHeader title={t("admin.reports.title")} subtitle={t("admin.reports.subtitle")}>
        <div className="flex flex-wrap gap-2" role="tablist">
          {filters.map(([id, n]) => (
            <button key={id} type="button" role="tab" aria-selected={status === id} onClick={() => setStatus(id)}
              className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${status === id ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-300 text-slate-600 hover:bg-slate-100"}`}>
              {t(`admin.reports.filters.${id}`)}{n !== undefined && <span className="ms-1.5 tabular-nums opacity-70">{f.num(n)}</span>}
            </button>
          ))}
        </div>
      </PageHeader>
      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
      {!data ? <Spinner /> : data.reports.length === 0 ? (
        <Card className="px-6 py-14 text-center">
          <Flag className="mx-auto h-9 w-9 text-slate-300" />
          <p className="mt-3 font-semibold text-slate-700">{t(status === "open" ? "admin.reports.emptyOpen" : "admin.reports.empty")}</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {data.reports.map((r) => (
            <Card key={r.id} className={`p-5 ${r.status === "resolved" ? "opacity-75" : ""}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${REPORT_TONE[r.category] || REPORT_TONE.other}`}>{t(`report.categories.${r.category}`)}</span>
                {r.status === "resolved" && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700"><Check className="h-3.5 w-3.5" /> {t("admin.reports.resolved")}</span>}
                <span dir="ltr" className="text-sm font-semibold text-slate-800">{r.email}</span>
                <span className="text-sm text-slate-500">· {f.relative(r.createdAt)}</span>
              </div>
              <p dir="auto" className="mt-3 whitespace-pre-wrap break-words leading-relaxed text-slate-800 [unicode-bidi:plaintext]">{r.message}</p>
              <p className="mt-2 text-xs text-slate-400"><bdi dir="ltr">{r.page || "/"}</bdi>{r.userAgent && <> · <bdi dir="ltr">{deviceName(r.userAgent)}</bdi></>}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {r.status === "open"
                  ? <Button onClick={() => act(() => adminApi.setReportStatus(r.id, "resolved"), "admin.reports.resolvedToast")}><Check className="h-4 w-4" /> {t("admin.reports.resolve")}</Button>
                  : <Button variant="ghost" onClick={() => act(() => adminApi.setReportStatus(r.id, "open"), "admin.reports.reopenedToast")}><RotateCcw className="h-4 w-4" /> {t("admin.reports.reopen")}</Button>}
                <Button variant="ghost" onClick={() => act(() => adminApi.deleteReport(r.id), "admin.reports.deletedToast")}><Trash2 className="h-4 w-4" /> {t("admin.reports.delete")}</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Broadcast ---------- */

function InboxPreview({ subject, body }) {
  const { t } = useI18n();
  const empty = !subject.trim() && !body.trim();
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <Eye className="h-3.5 w-3.5" aria-hidden="true" /> {t("admin.broadcast.preview")}
      </div>
      {empty ? (
        <p className="px-5 py-16 text-center text-sm text-slate-500">{t("admin.broadcast.previewEmpty")}</p>
      ) : (
        <div className="p-5">
          <div className="flex items-center gap-3">
            <LogoMark size={40} />
            <div className="min-w-0">
              <p className="font-semibold text-slate-900">{t("admin.broadcast.fromName")} <bdi dir="ltr" className="font-normal text-slate-500">&lt;team@{BRAND.domain}&gt;</bdi></p>
              <p className="text-xs text-slate-500">{new Date().toLocaleString()}</p>
            </div>
          </div>
          <h3 dir="auto" className="mt-4 text-xl font-bold text-slate-900">{subject || "…"}</h3>
          <p dir="auto" className="mt-3 max-h-80 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700 [unicode-bidi:plaintext]">{body}</p>
        </div>
      )}
    </Card>
  );
}

function BroadcastTab({ toast }) {
  const { t } = useI18n();
  const f = useFormatters();
  const errorText = useErrorText();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(null); // "test" | "all"
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState(null);
  const [recipients, setRecipients] = useState(null);

  const loadHistory = useCallback(() => {
    adminApi.broadcasts().then((r) => setHistory(r.broadcasts)).catch(() => setHistory([]));
    adminApi.stats().then((s) => setRecipients(s.recipients)).catch(() => {});
  }, []);
  useEffect(loadHistory, [loadHistory]);

  const ready = subject.trim() && body.trim();
  const send = async (test) => {
    setBusy(test ? "test" : "all");
    setError("");
    try {
      const res = await adminApi.sendBroadcast(subject.trim(), body.trim(), test);
      toast(test ? t("admin.broadcast.testSent") : t("admin.broadcast.sent", { n: f.num(res.recipients) }));
      if (!test) { setSubject(""); setBody(""); loadHistory(); }
    } catch (e) { setError(errorText(e)); }
    setBusy(null);
    setConfirming(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t("admin.broadcast.title")} subtitle={t("admin.broadcast.subtitle")} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <p className="text-sm font-semibold text-slate-700">{t("admin.broadcast.templates")}</p>
          <div className="mt-2 space-y-3">
            {t("admin.broadcast.tplGroups").map((group) => (
              <div key={group.name}>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{group.name}</p>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {group.items.map((tpl) => (
                    <button
                      key={tpl.label}
                      type="button"
                      onClick={() => { setSubject(tpl.subject); setBody(tpl.body); setError(""); }}
                      aria-pressed={subject === tpl.subject}
                      className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${subject === tpl.subject ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-300 text-slate-700 hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700"}`}
                    >
                      {tpl.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">{t("admin.broadcast.tplHint")}</p>
          <label htmlFor="bc-subject" className="mt-5 block text-sm font-semibold text-slate-800">{t("admin.broadcast.subject")}</label>
          <input id="bc-subject" dir="auto" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={t("admin.broadcast.subjectPlaceholder")} maxLength={300} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-surface px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100" />
          <label htmlFor="bc-body" className="mt-4 block text-sm font-semibold text-slate-800">{t("admin.broadcast.body")}</label>
          <textarea id="bc-body" dir="auto" value={body} onChange={(e) => setBody(e.target.value)} placeholder={t("admin.broadcast.bodyPlaceholder")} rows={10} className="mt-1.5 w-full resize-y rounded-xl border border-slate-300 bg-surface px-4 py-3 leading-relaxed text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100 [unicode-bidi:plaintext]" />
          {error && <p role="alert" className="mt-3 text-sm text-rose-600">{error}</p>}
          <div className="mt-5 flex flex-wrap gap-2">
            <Button onClick={() => setConfirming(true)} disabled={!ready || !!busy}><Send className="h-4 w-4 rtl:-scale-x-100" /> {t("admin.broadcast.sendAll")}</Button>
            <Button variant="ghost" onClick={() => send(true)} disabled={!ready || !!busy}>{busy === "test" && <Loader2 className="h-4 w-4 animate-spin" />}{t("admin.broadcast.sendTest")}</Button>
          </div>
        </Card>
        <InboxPreview subject={subject} body={body} />
      </div>

      <Card className="p-5">
        <h2 className="font-bold text-slate-900">{t("admin.broadcast.history")}</h2>
        {!history ? <Spinner /> : history.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">{t("admin.broadcast.historyEmpty")}</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {history.map((b) => {
              const pct = b.recipients ? Math.round((b.read / b.recipients) * 100) : 0;
              return (
                <li key={b.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p dir="auto" className="truncate font-medium text-slate-900">{b.subject}</p>
                    <p className="text-xs text-slate-500">{f.dateTime(b.createdAt)} · {t("admin.broadcast.recipients", { n: f.num(b.recipients) })}</p>
                  </div>
                  <div className="flex w-44 items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200" role="presentation">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--color-chart)" }} />
                    </div>
                    <span className="w-16 text-end text-xs tabular-nums text-slate-600">{t("admin.broadcast.readRate", { p: pct })}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {confirming && (
        <Modal title={t("admin.broadcast.confirmTitle", { n: f.num(recipients ?? 0) })} onClose={() => !busy && setConfirming(false)}
          footer={<><Button variant="ghost" onClick={() => setConfirming(false)} disabled={!!busy}>{t("admin.broadcast.cancel")}</Button><Button onClick={() => send(false)} disabled={!!busy}>{busy === "all" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 rtl:-scale-x-100" />}{t("admin.broadcast.confirmButton")}</Button></>}>
          <p>{t("admin.broadcast.confirmText", { n: f.num(recipients ?? 0) })}</p>
          <p dir="auto" className="mt-3 rounded-lg bg-slate-100 px-3 py-2 font-medium text-slate-800">{subject}</p>
        </Modal>
      )}
    </div>
  );
}

/* ---------- Settings ---------- */

/** Discord bot: setup checklist + "register commands" button. */
function DiscordCard({ toast }) {
  const { t } = useI18n();
  const errorText = useErrorText();
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { adminApi.discord().then(setD).catch(() => setD({})); }, []);

  const register = async () => {
    setBusy(true);
    try { const r = await adminApi.discordRegister(); toast(t("admin.discord.registered", { n: r.commands })); } catch (e) { toast(errorText(e)); }
    setBusy(false);
  };

  const Item = ({ done, children }) => (
    <li className="flex items-start gap-2.5">
      <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ${done ? "bg-emerald-500 text-white" : "border-2 border-slate-300"}`}>{done && <Check className="h-3.5 w-3.5" />}</span>
      <span className={done ? "text-slate-500" : "text-slate-800"}>{children}</span>
    </li>
  );

  return (
    <Card className="p-5">
      <h2 className="font-bold text-slate-900">{t("admin.discord.title")}</h2>
      <p className="mt-1 text-sm text-slate-500">{t("admin.discord.text")}</p>
      {!d ? <Spinner /> : (
        <>
          <ol className="mt-4 space-y-2.5 text-sm">
            <Item done={!!d.appId && d.hasPublicKey}>{t("admin.discord.stepIds")}</Item>
            <Item done={d.hasToken}>{t("admin.discord.stepToken")}</Item>
            <Item done={false}>{t("admin.discord.stepEndpoint")} <code dir="ltr" className="mt-1 block w-fit max-w-full break-all rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-800">https://api.{BRAND.domain}/api/discord/interactions</code></Item>
            <Item done={d.linked}>{t("admin.discord.stepInvite")}</Item>
            <Item done={d.linked}>{t("admin.discord.stepSetup")}</Item>
          </ol>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button onClick={register} disabled={busy || !d.appId || !d.hasToken}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{t("admin.discord.register")}</Button>
            {d.inviteUrl && <a href={d.inviteUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100">{t("admin.discord.invite")}</a>}
          </div>
          {d.linked && (
            <p className="mt-4 text-sm text-slate-600">
              {t("admin.discord.linked")} {d.logChannels > 0 && <span className="ms-2 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">{t("admin.discord.logChannels", { n: d.logChannels })}</span>} {["updates", "role"].map((k) => <span key={k} className={`ms-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${d.channels?.[k] ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{t(`admin.discord.ch.${k}`)}</span>)}
            </p>
          )}
        </>
      )}
    </Card>
  );
}

function DriveSettingsCard({ s, save, saving }) {
  const { t } = useI18n();
  const [def, setDef] = useState(String(s.driveDefaultMb ?? 100));
  const [cap, setCap] = useState(String(Math.round((s.drive?.capacityMb || 1024) / 1024)));
  const [usage, setUsage] = useState(null);
  useEffect(() => { adminApi.stats().then((st) => setUsage({ used: st.driveUsed || 0, capacity: st.driveCapacity || 0 })).catch(() => {}); }, []);
  const d = s.drive || { backend: "kv", capacityMb: 1024, maxFileMb: 24 };
  const n = Number(def);
  const valid = Number.isFinite(n) && n >= 0 && n <= d.capacityMb;
  const pct = usage?.capacity ? Math.min(100, (usage.used / usage.capacity) * 100) : 0;
  return (
    <Card className="p-5">
      <h2 className="flex items-center gap-2 font-bold text-slate-900"><HardDrive className="h-4.5 w-4.5 text-brand-600" /> {t("admin.settings.driveTitle")}</h2>
      <p className="mt-1 text-sm text-slate-500">{t(d.backend === "r2" ? "admin.settings.driveR2" : "admin.settings.driveKv", { cap: d.capacityMb >= 1024 ? `${d.capacityMb / 1024} GB` : `${d.capacityMb} MB`, file: d.maxFileMb })}</p>
      {usage && (
        <div className="mt-4">
          <div className="flex justify-between text-sm"><span className="font-semibold text-slate-800">{t("admin.settings.driveUsage")}</span><span className="tabular-nums text-slate-600"><bdi dir="ltr">{formatBytes(usage.used)} / {formatBytes(usage.capacity)}</bdi></span></div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${pct > 90 ? "bg-rose-500" : "bg-brand-600"}`} style={{ width: `${Math.max(pct, usage.used ? 1 : 0)}%` }} /></div>
        </div>
      )}
      {d.backend === "r2" && (() => {
        const g = Number(cap);
        const okCap = Number.isInteger(g) && g >= 1 && g <= (d.maxCapGb || 2000);
        const cost = Math.max(0, g - 10) * 0.015;
        return (
          <div className="mt-5 rounded-xl border border-slate-200 p-4">
            <label htmlFor="drive-cap" className="block text-sm font-semibold text-slate-800">{t("admin.settings.driveCap")}</label>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <input id="drive-cap" type="number" min="1" max={d.maxCapGb || 2000} dir="ltr" value={cap} onChange={(e) => setCap(e.target.value)}
                className="w-32 rounded-xl border border-slate-300 bg-surface px-3 py-2.5 text-center font-bold tabular-nums text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100" />
              <span className="text-sm font-semibold text-slate-600">GB</span>
              {[10, 100, 500, 1000].map((p) => (
                <button key={p} type="button" onClick={() => setCap(String(p))} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${g === p ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 text-slate-700 hover:border-brand-400"}`}><bdi dir="ltr">{p} GB</bdi></button>
              ))}
              <Button onClick={() => save({ driveCapGb: g })} disabled={saving || !okCap}>{t("admin.settings.save")}</Button>
            </div>
            <p className={`mt-2 text-sm ${okCap ? "text-slate-600" : "text-rose-600"}`}>
              {okCap ? (g <= 10 ? t("admin.settings.driveCapFree") : t("admin.settings.driveCapCost", { cost: cost.toFixed(2) })) : t("admin.settings.driveCapRange", { max: d.maxCapGb || 2000 })}
            </p>
          </div>
        );
      })()}
      <label htmlFor="drive-default" className="mt-5 block text-sm font-semibold text-slate-800">{t("admin.settings.driveDefault")}</label>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <input id="drive-default" type="number" min="0" max={d.capacityMb} dir="ltr" value={def} onChange={(e) => setDef(e.target.value)}
          className="w-32 rounded-xl border border-slate-300 bg-surface px-3 py-2.5 text-center font-bold tabular-nums text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100" />
        <span className="text-sm font-semibold text-slate-600">MB</span>
        <Button onClick={() => save({ driveDefaultMb: n })} disabled={saving || !valid}>{t("admin.settings.save")}</Button>
      </div>
      <p className={`mt-2 text-sm ${valid ? "text-slate-500" : "text-rose-600"}`}>{t("admin.settings.driveDefaultHint", { max: d.capacityMb })}</p>
    </Card>
  );
}

function SettingsTab({ toast }) {
  const { t } = useI18n();
  const errorText = useErrorText();
  const [s, setS] = useState(null);
  const [saving, setSaving] = useState(false);

  const [outbound, setOutbound] = useState(null);
  useEffect(() => { adminApi.settings().then(setS).catch((e) => toast(errorText(e))); }, [toast, errorText]);
  useEffect(() => { adminApi.stats().then((st) => st.outboundLimit && setOutbound({ today: st.outboundToday || 0, limit: st.outboundLimit })).catch(() => {}); }, []);

  const save = async (patch) => {
    setSaving(true);
    try { setS(await adminApi.saveSettings(patch)); toast(t("admin.settings.saved")); } catch (e) { toast(errorText(e)); }
    setSaving(false);
  };

  if (!s) return <Spinner />;
  const a = s.announcement;
  const setA = (patch) => setS({ ...s, announcement: { ...a, ...patch } });

  return (
    <div className="space-y-6">
      <PageHeader title={t("admin.settings.title")} subtitle={t("admin.settings.subtitle")} />
      <Card className="p-5">
        <h2 className="font-bold text-slate-900">{t("admin.settings.bannerTitle")}</h2>
        <p className="mt-1 text-sm text-slate-500">{t("admin.settings.bannerText")}</p>
        <div className="mt-5 space-y-5">
          <Toggle id="banner-enabled" checked={a.enabled} onChange={(v) => setA({ enabled: v })} label={t("admin.settings.bannerEnabled")} />
          <div>
            <label htmlFor="banner-text" className="block text-sm font-semibold text-slate-800">{t("admin.settings.bannerMessage")}</label>
            <input id="banner-text" dir="auto" value={a.text} maxLength={500} onChange={(e) => setA({ text: e.target.value })} placeholder={t("admin.settings.bannerPlaceholder")} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-surface px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100" />
          </div>
          <fieldset>
            <legend className="text-sm font-semibold text-slate-800">{t("admin.settings.level")}</legend>
            <div className="mt-2 inline-flex rounded-xl border border-slate-300 p-1">
              {["info", "warning", "success"].map((lvl) => (
                <button key={lvl} type="button" aria-pressed={a.level === lvl} onClick={() => setA({ level: lvl })} className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition ${a.level === lvl ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
                  {t(`admin.settings.levels.${lvl}`)}
                </button>
              ))}
            </div>
          </fieldset>
          <div>
            <p className="text-sm font-semibold text-slate-800">{t("admin.settings.preview")}</p>
            <div className={`mt-2 overflow-hidden rounded-xl ${a.enabled ? "" : "opacity-50"}`}>
              <AnnouncementBanner text={a.text || t("admin.settings.bannerPlaceholder")} level={a.level} />
            </div>
          </div>
          <Button onClick={() => save({ announcement: a })} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}{t("admin.settings.save")}</Button>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="font-bold text-slate-900">{t("admin.settings.outboundTitle")}</h2>
        <div className="mt-4 space-y-3">
          <Toggle id="outbound-enabled" checked={s.outboundEnabled} disabled={saving} onChange={(v) => save({ outboundEnabled: v })} label={t("admin.settings.outboundEnabled")} description={t("admin.settings.outboundText", { domain: BRAND.domain, limit: outbound?.limit ?? 95 })} />
          {!s.outboundConfigured && (
            <p className="rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-800">{t("admin.settings.outboundNotConfigured", { domain: BRAND.domain })}</p>
          )}
          {outbound && s.outboundConfigured && (
            <p className="text-sm tabular-nums text-slate-600">{t("admin.settings.outboundUsage", { n: outbound.today, limit: outbound.limit })}</p>
          )}
        </div>
      </Card>

      <DriveSettingsCard s={s} save={save} saving={saving} />

      <Card className="p-5">
        <h2 className="flex items-center gap-2 font-bold text-slate-900"><Hourglass className="h-4.5 w-4.5 text-violet-600" /> {t("admin.settings.tempTitle")}</h2>
        <p className="mt-1 text-sm text-slate-500">{t("admin.settings.tempText")}</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {["off", "chosen", "all"].map((m) => (
            <button key={m} type="button" aria-pressed={s.tempMode === m} disabled={saving} onClick={() => save({ tempMode: m })}
              className={`rounded-xl border p-3 text-start transition ${s.tempMode === m ? "border-brand-600 bg-brand-50 ring-2 ring-brand-200" : "border-slate-300 hover:border-brand-400"}`}>
              <span className="block text-sm font-bold text-slate-900">{t(`admin.settings.tempModes.${m}.title`)}</span>
              <span className="mt-0.5 block text-xs text-slate-500">{t(`admin.settings.tempModes.${m}.text`)}</span>
            </button>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="font-bold text-slate-900">{t("admin.settings.signupsTitle")}</h2>
        <div className="mt-4">
          <Toggle id="signups-open" checked={s.signupsOpen} disabled={saving} onChange={(v) => save({ signupsOpen: v })} label={t("admin.settings.signupsOpen")} description={t("admin.settings.signupsText")} />
        </div>
      </Card>
      <DiscordCard toast={toast} />
    </div>
  );
}

/* ---------- Shell ---------- */

function NotAllowed() {
  const { t } = useI18n();
  return (
    <div className="grid min-h-dvh place-items-center bg-surface px-6 text-center">
      <div>
        <p className="font-display text-6xl font-extrabold text-slate-200">404</p>
        <h1 className="mt-4 text-2xl font-bold text-slate-900">{t("admin.notAllowedTitle")}</h1>
        <p className="mt-2 text-slate-600">{t("admin.notAllowedText")}</p>
        <Link to="/" className="mt-6 inline-flex rounded-xl bg-brand-600 px-5 py-3 font-semibold text-white hover:bg-brand-500">{t("admin.goHome")}</Link>
      </div>
    </div>
  );
}

export default function Admin() {
  const { t } = useI18n();
  const session = getSession();
  const [allowed, setAllowed] = useState(null); // null = checking
  const [tab, setTab] = useState(() => (TABS.some((x) => `#${x.id}` === window.location.hash) ? window.location.hash.slice(1) : "overview"));
  const [menuOpen, setMenuOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const [openReports, setOpenReports] = useState(0);
  const [supportUnread, setSupportUnread] = useState(0);
  const [staffOnly, setStaffOnly] = useState(false);

  useEffect(() => {
    if (!session) return;
    getMe().then((me) => {
      if (me.skin) applySkin(me.skin);
      const staff = !me.isAdmin && !!me.isStaff;
      setAllowed(!!me.isAdmin || staff);
      setStaffOnly(staff);
      if (staff && !STAFF_TABS.includes(tab)) setTab("support");
      if (me.isAdmin || staff) {
        adminApi.reports("open").then((r) => setOpenReports(r.open)).catch(() => {});
        adminApi.support("open").then((r) => setSupportUnread(r.unread)).catch(() => {});
      }
    }).catch(() => setAllowed(false));
  }, [session?.email]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const original = document.title;
    document.title = `${t("admin.title")} · ${BRAND.short}`;
    return () => { document.title = original; };
  }, [t]);

  useEffect(() => {
    if (!toastMsg) return;
    const timer = setTimeout(() => setToastMsg(""), 3000);
    return () => clearTimeout(timer);
  }, [toastMsg]);

  const toast = useCallback((m) => setToastMsg(m), []);
  const go = (id) => { setTab(id); setMenuOpen(false); history.replaceState(null, "", `#${id}`); window.scrollTo(0, 0); };

  if (!session) return <Navigate to="/login" replace />;
  if (allowed === null) return <div className="min-h-dvh bg-surface"><Spinner /></div>;
  if (!allowed) return <NotAllowed />;

  const nav = (
    <nav className="mt-8 space-y-1">
      {TABS.filter(({ id }) => !staffOnly || STAFF_TABS.includes(id)).map(({ id, icon: Icon }) => (
        <button key={id} type="button" onClick={() => go(id)} aria-current={tab === id ? "page" : undefined}
          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${tab === id ? "bg-white/12 text-white" : "text-white/65 hover:bg-white/6 hover:text-white"}`}>
          <Icon className="h-5 w-5" aria-hidden="true" /> <span className="flex-1 text-start">{t(`admin.nav.${id}`)}</span>
          {id === "support" && supportUnread > 0 && <span className="rounded-full bg-rose-500 px-2 py-0.5 text-xs font-bold text-white">{supportUnread}</span>}
          {id === "reports" && openReports > 0 && <span className="rounded-full bg-amber-400 px-2 py-0.5 text-xs font-bold text-[#3b2800]">{openReports}</span>}
        </button>
      ))}
    </nav>
  );

  return (
    <div className="min-h-dvh bg-slate-50 lg:flex">
      {/* Sidebar */}
      {menuOpen && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setMenuOpen(false)} />}
      <aside className={`fixed inset-y-0 start-0 z-40 flex w-64 flex-col bg-ink p-5 text-white transition-transform lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0 ${menuOpen ? "translate-x-0" : "max-lg:ltr:-translate-x-full max-lg:rtl:translate-x-full"}`}>
        <div className="flex items-center justify-between">
          <Link to="/" dir="ltr" className="flex items-center gap-2.5 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40" title={t("nav.home", { name: BRAND.name })}>
            <LogoMark size={34} />
            <span className="font-display text-lg font-extrabold tracking-[-0.03em]">{BRAND.short}</span>
            <span className="rounded-md bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#3b2800]">{t(staffOnly ? "admin.staffBadge" : "admin.badge")}</span>
          </Link>
          <button type="button" onClick={() => setMenuOpen(false)} className="rounded-lg p-1.5 text-white/70 hover:bg-white/10 lg:hidden" aria-label={t("compose.close")}><X className="h-5 w-5" /></button>
        </div>
        {nav}
        <div className="mt-auto space-y-3 border-t border-white/10 pt-4">
          <Link to="/inbox" className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-white/70 hover:bg-white/6 hover:text-white">
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {t("admin.backToInbox")}
          </Link>
          <p dir="ltr" className="truncate px-3 text-xs text-white/50 rtl:text-right">{session.email}</p>
        </div>
      </aside>

      {/* Main */}
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-slate-200 bg-surface/90 px-4 backdrop-blur sm:px-8">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setMenuOpen(true)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" aria-label={t("admin.openMenu")}><Menu className="h-5 w-5" /></button>
            <p className="font-semibold text-slate-900">{t(staffOnly ? "admin.staffTitle" : "admin.title")}</p>
          </div>
          <Preferences />
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
          {DEMO_MODE && (
            <p className="mb-6 rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-800">{t("admin.previewData")}</p>
          )}
          {!staffOnly && tab === "overview" && <Overview go={go} />}
          {!staffOnly && tab === "users" && <UsersTab toast={toast} />}
          {!staffOnly && tab === "broadcast" && <BroadcastTab toast={toast} />}
          {!staffOnly && tab === "settings" && <SettingsTab toast={toast} />}
          {!staffOnly && tab === "look" && <LookTab toast={toast} />}
          {tab === "support" && <SupportTab toast={toast} onCount={setSupportUnread} />}
          {tab === "reports" && <ReportsTab toast={toast} onCount={setOpenReports} />}
        </main>
      </div>

      {toastMsg && (
        <div role="status" className="fixed bottom-6 left-1/2 z-50 max-w-[90vw] -translate-x-1/2 rounded-xl bg-ink px-5 py-3 text-sm font-medium text-white shadow-lg">{toastMsg}</div>
      )}
    </div>
  );
}
