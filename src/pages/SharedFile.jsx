// Public download page for a file someone shared from their drive: /share?f=<token>.
import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, ChevronLeft, Clock, Download, Eye, FileAudio, Folder, FolderOpen, Link2Off, Loader2, Lock, Play, RefreshCw, ShieldCheck, X, XCircle } from "lucide-react";
import { BRAND } from "../config.js";
import LogoMark from "../components/LogoMark.jsx";
import Preferences from "../components/Preferences.jsx";
import { useErrorText, useI18n } from "../lib/i18n.jsx";
import { formatBytes } from "../lib/validation.js";
import { previewKind, typeOf } from "../lib/fileTypes.js";
import { sharedFileUrl, sharedInfo, sharedItemUrl, sharedList, sharedRequest } from "../lib/api.js";
import { Button, Modal } from "../components/ui.jsx";
import { mmss, useVideoThumb } from "../lib/videoThumbs.js";

// A weak phone connection often fails once and works a second later: try a few times before giving up.
async function withRetry(fn, tries = 3) {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) {
      const gone = e?.code === "drive_link_gone" || e?.code === "drive_not_found";
      if (gone || i >= tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
}

function Unplayable({ href, name, dl }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center gap-3 p-8 text-center">
      <p className="max-w-sm text-sm text-white/80">{t(dl.can ? "shared.cantPlay" : "shared.cantPlayLocked")}</p>
      {dl.can ? (
        <a href={href} download={name} className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-bold text-[#0B1220] hover:bg-white/90">
          <Download className="h-4 w-4" aria-hidden="true" /> {t("shared.download")}
        </a>
      ) : <AskButton dl={dl} light />}
    </div>
  );
}

// Stop the easy ways of saving a picture or video (right click, dragging) on a view-only link.
const noSave = (dl) => (dl.can ? {} : { onContextMenu: (e) => e.preventDefault(), draggable: false, controlsList: "nodownload noremoteplayback", disablePictureInPicture: true });

/** The "ask to download" button, or where the request stands. */
function AskButton({ dl, light = false, small = false }) {
  const { t } = useI18n();
  if (dl.can) return null;
  if (dl.access === "pending") {
    return <span className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold ${light ? "bg-white/15 text-white" : "bg-amber-50 text-amber-700"}`}><Clock className="h-4 w-4" aria-hidden="true" /> {t("shared.req.pendingShort")}</span>;
  }
  return (
    <button type="button" onClick={dl.ask}
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl font-bold ${small ? "px-3 py-2 text-sm" : "px-4 py-2 text-sm"} ${light ? "bg-white text-[#0B1220] hover:bg-white/90" : "bg-brand-600 text-white hover:bg-brand-500"}`}>
      <Lock className="h-4 w-4" aria-hidden="true" /> {t("shared.req.ask")}
    </button>
  );
}

/** Banner on a view-only link: what it means and where the visitor's request stands. */
function AccessBanner({ dl }) {
  const { t } = useI18n();
  if (!dl.viewOnly) return null;
  const tone = dl.access === "approved" ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : dl.access === "denied" ? "border-rose-200 bg-rose-50 text-rose-800"
    : dl.access === "pending" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-brand-200 bg-brand-50 text-brand-900";
  const Icon = dl.access === "approved" ? CheckCircle2 : dl.access === "denied" ? XCircle : dl.access === "pending" ? Clock : Eye;
  const text = { approved: "shared.req.approved", denied: "shared.req.denied", pending: "shared.req.pending" }[dl.access] || "shared.req.viewOnly";
  return (
    <div className={`mt-5 flex flex-col gap-3 rounded-2xl border px-4 py-3 text-sm sm:flex-row sm:items-center ${tone}`} role="status">
      <p className="flex flex-1 items-start gap-2"><Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> <span>{t(text)}</span></p>
      {(dl.access === "none" || dl.access === "denied") && <AskButton dl={dl} small />}
    </div>
  );
}

function RequestDialog({ token, onDone, onClose }) {
  const { t } = useI18n();
  const errorText = useErrorText();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const send = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setError(t("shared.req.needName")); return; }
    setBusy(true); setError("");
    try { const r = await sharedRequest(token, { name, email, note }); onDone(r.key); } catch (err) { setError(errorText(err)); setBusy(false); }
  };
  const field = "mt-1 w-full rounded-xl border border-slate-300 bg-surface px-3 py-2.5 text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100";
  return (
    <Modal title={t("shared.req.title")} onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>{t("shared.close")}</Button><Button type="submit" form="share-req" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{t("shared.req.send")}</Button></>}>
      <form id="share-req" onSubmit={send} className="space-y-3">
        <p className="text-sm text-slate-600">{t("shared.req.intro")}</p>
        <label className="block text-sm font-semibold text-slate-700">{t("shared.req.name")}
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus className={field} />
        </label>
        <label className="block text-sm font-semibold text-slate-700">{t("shared.req.email")} <span className="font-normal text-slate-400">{t("shared.req.optional")}</span>
          <input type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} className={field} />
          <span className="mt-1 block text-xs font-normal text-slate-500">{t("shared.req.emailHint")}</span>
        </label>
        <label className="block text-sm font-semibold text-slate-700">{t("shared.req.note")} <span className="font-normal text-slate-400">{t("shared.req.optional")}</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={2} className={field} />
        </label>
        {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
      </form>
    </Modal>
  );
}

function RetryBox({ text, onRetry }) {
  const { t } = useI18n();
  return (
    <div role="alert" className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-6 text-center text-sm text-amber-800">
      <p>{text}</p>
      <button type="button" onClick={onRetry} className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 font-bold text-white hover:bg-amber-500">
        <RefreshCw className="h-4 w-4" aria-hidden="true" /> {t("shared.retry")}
      </button>
    </div>
  );
}

const PREVIEW_MAX = 30 * 1024 * 1024; // show it in the page only when it's small enough to load whole

function Preview({ token, info, dl }) {
  const { t } = useI18n();
  const kind = previewKind(info);
  const [url, setUrl] = useState(null);
  const [bad, setBad] = useState(false);
  // Straight from the server: videos stream and can be skipped through, whatever their size.
  useEffect(() => { if (kind) setUrl(sharedFileUrl(token, true)); }, [token, kind]);
  if (!kind || (kind === "image" && info.size > PREVIEW_MAX) || (bad && kind !== "video")) return null;
  if (bad) return <div className="mt-6 overflow-hidden rounded-2xl bg-black"><Unplayable href={sharedFileUrl(token, false, dl.k)} name={info.name} dl={dl} /></div>;
  return (
    <div className={`mt-6 grid min-h-40 place-items-center overflow-hidden rounded-2xl ${kind === "video" ? "bg-black" : "bg-slate-100"}`}>
      {!url ? <Loader2 className={`h-6 w-6 animate-spin ${kind === "video" ? "text-white/60" : "text-slate-400"}`} />
        : kind === "video" ? <video src={url} controls playsInline preload="metadata" onError={() => setBad(true)} className="max-h-[60vh] w-full bg-black" aria-label={info.name} {...noSave(dl)} />
        : kind === "audio" ? (
          <div className="flex w-full flex-col items-center gap-3 p-6">
            <FileAudio className="h-8 w-8 text-sky-600" aria-hidden="true" />
            <audio src={url} controls onError={() => setBad(true)} className="w-full" aria-label={info.name} {...noSave(dl)} />
          </div>
        ) : <img src={url} alt={info.name} onError={() => setBad(true)} className="max-h-[60vh] w-auto object-contain" {...noSave(dl)} />}
      {kind !== "image" && url && <span className="sr-only">{t("shared.preview")}</span>}
    </div>
  );
}

// A shared folder: browse it and its sub-folders, preview pictures and videos, download files.
function SharedFolder({ token, info, dl }) {
  const { t, locale } = useI18n();
  const errorText = useErrorText();
  const [sub, setSub] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setData(null); setError("");
    withRetry(() => sharedList(token, sub)).then((d) => alive && setData(d)).catch((e) => alive && setError(errorText(e)));
    return () => { alive = false; };
  }, [token, sub, errorText, attempt]);
  const crumbs = [{ id: null, name: info.name }, ...(data?.path || [])];
  const date = new Date(info.sharedAt).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });
  return (
    <div className="rounded-3xl border border-slate-200 bg-surface p-6 shadow-sm sm:p-8">
      <p className="text-sm font-semibold text-brand-700">{t("shared.folderEyebrow")}</p>
      <div className="mt-4 flex items-center gap-4">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-amber-50 text-amber-600"><FolderOpen className="h-7 w-7" aria-hidden="true" /></span>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-extrabold text-slate-900 sm:text-2xl"><bdi>{info.name}</bdi></h1>
          <p className="mt-0.5 text-sm text-slate-500">{t("shared.folderCount", { n: info.count })} · {t("shared.sharedOn", { date })}</p>
        </div>
      </div>
      <AccessBanner dl={dl} />

      {crumbs.length > 1 && (
        <nav aria-label="breadcrumb" className="mt-5 flex flex-wrap items-center gap-1 text-sm">
          {crumbs.map((c, i) => (
            <span key={c.id ?? "root"} className="flex items-center gap-1">
              {i > 0 && <ChevronLeft className="h-4 w-4 text-slate-400 ltr:rotate-180" aria-hidden="true" />}
              {i === crumbs.length - 1
                ? <span className="font-semibold text-slate-900"><bdi>{c.name}</bdi></span>
                : <button type="button" onClick={() => setSub(c.id)} className="rounded-md px-1 font-semibold text-brand-700 hover:underline"><bdi>{c.name}</bdi></button>}
            </span>
          ))}
        </nav>
      )}

      {error ? <RetryBox text={error} onRetry={() => setAttempt((n) => n + 1)} />
        : !data ? <div className="grid place-items-center py-16 text-slate-400"><Loader2 className="h-7 w-7 animate-spin" /></div>
        : data.items.length === 0 ? <p className="mt-6 rounded-2xl bg-slate-50 py-12 text-center text-slate-500">{t("shared.folderEmpty")}</p>
        : (
          <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {data.items.map((item) => <FolderTile key={item.id} token={token} item={item} dl={dl} onOpen={() => item.folder ? setSub(item.id) : setOpen(item)} />)}
          </ul>
        )}

      <p className="mt-6 flex items-start gap-2 text-xs leading-relaxed text-slate-500">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" /> {t("shared.safety")}
      </p>
      <p className="mt-2 flex items-start gap-2 text-xs leading-relaxed text-slate-500">
        <Eye className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" /> {t("shared.visitsNote")}
      </p>
      {open && <ItemViewer token={token} item={open} dl={dl} onClose={() => setOpen(null)} />}
    </div>
  );
}

function FolderTile({ token, item, onOpen, dl }) {
  const { t } = useI18n();
  const kind = item.folder ? null : previewKind(item);
  const [broken, setBroken] = useState(false);
  const type = typeOf(item);
  const [box, vt] = useVideoThumb(kind === "video" ? `${token}:${item.id}:${item.updatedAt}` : null, kind === "video" ? sharedItemUrl(token, item.id, true, true) : null);
  const media = !broken && (kind === "image" || kind === "video");
  return (
    <li className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-surface transition hover:border-brand-300 hover:shadow-md">
      <button ref={box} type="button" onClick={onOpen} aria-label={item.folder ? t("shared.openFolder", { name: item.name }) : item.name}
        className={`relative grid aspect-square w-full place-items-center overflow-hidden ${kind === "video" ? "bg-[#1c1c1e]" : "bg-slate-50"}`}>
        {item.folder ? <Folder className="h-14 w-14 fill-amber-300 text-amber-500" aria-hidden="true" />
          : media && kind === "image" ? <img src={sharedItemUrl(token, item.id, true, true)} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} className="h-full w-full object-cover" {...noSave(dl)} />
          : media && kind === "video" ? (
            <>
              {vt.poster ? <img src={vt.poster} alt="" className="absolute inset-0 h-full w-full object-cover" />
                : !vt.ready ? <Loader2 className="absolute h-6 w-6 animate-spin text-white/40" aria-hidden="true" /> : null}
              <span className="absolute grid h-11 w-11 place-items-center rounded-full bg-black/55 text-white backdrop-blur"><Play className="h-5 w-5 fill-white" aria-hidden="true" /></span>
              {Number.isFinite(vt.duration) && <span dir="ltr" className="absolute bottom-2 end-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white">{mmss(vt.duration)}</span>}
            </>
          ) : <span className={`grid h-14 w-14 place-items-center rounded-2xl ${type.tone}`}><type.Icon className="h-7 w-7" aria-hidden="true" /></span>}
      </button>
      <div className="flex items-center gap-1 px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-start text-sm font-semibold text-slate-800"><bdi>{item.name}</bdi></p>
          {!item.folder && <p className="text-xs text-slate-500"><bdi dir="ltr">{formatBytes(item.size)}</bdi></p>}
        </div>
        {!item.folder && !dl.can && <Lock className="h-4 w-4 shrink-0 text-slate-400" aria-label={t("shared.req.locked")} />}
        {!item.folder && dl.can && (
          <a href={sharedItemUrl(token, item.id, false, false, dl.k)} download={item.name} aria-label={`${t("shared.download")} ${item.name}`} title={t("shared.download")}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-brand-700">
            <Download className="h-4 w-4" aria-hidden="true" />
          </a>
        )}
      </div>
    </li>
  );
}

function ItemViewer({ token, item, onClose, dl }) {
  const { t } = useI18n();
  const kind = previewKind(item);
  const [bad, setBad] = useState(false);
  const [loading, setLoading] = useState(kind === "video" || kind === "image");
  const url = sharedItemUrl(token, item.id, true);
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const type = typeOf(item);
  return (
    <div role="dialog" aria-modal="true" aria-label={item.name} className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-surface" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
          <p className="min-w-0 flex-1 truncate font-bold text-slate-900"><bdi>{item.name}</bdi> <span className="text-sm font-normal text-slate-500">· <bdi dir="ltr">{formatBytes(item.size)}</bdi></span></p>
          {dl.can ? (
            <a href={sharedItemUrl(token, item.id, false, false, dl.k)} download={item.name} className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-2 text-sm font-bold text-white hover:bg-brand-500">
              <Download className="h-4 w-4" aria-hidden="true" /> {t("shared.download")}
            </a>
          ) : <AskButton dl={dl} small />}
          <button type="button" onClick={onClose} aria-label={t("shared.close")} className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className={`grid min-h-48 flex-1 place-items-center overflow-auto ${kind === "video" || kind === "image" ? "bg-black" : "bg-slate-50"}`}>
          {bad ? <Unplayable href={sharedItemUrl(token, item.id, false, false, dl.k)} name={item.name} dl={dl} />
            : kind === "video" ? (
              <div className="relative grid w-full place-items-center">
                <video src={url} controls autoPlay playsInline preload="auto" {...noSave(dl)} onLoadedData={() => setLoading(false)} onCanPlay={() => setLoading(false)} onError={() => setBad(true)} className="max-h-[75vh] w-full" />
                {loading && <Loader2 className="pointer-events-none absolute h-8 w-8 animate-spin text-white/60" aria-hidden="true" />}
              </div>
            )
            : kind === "image" ? <img src={url} alt={item.name} onError={() => setBad(true)} className="max-h-[75vh] w-auto object-contain" {...noSave(dl)} />
            : kind === "audio" ? <div className="flex w-full flex-col items-center gap-3 p-8"><FileAudio className="h-8 w-8 text-sky-600" aria-hidden="true" /><audio src={url} controls autoPlay onError={() => setBad(true)} className="w-full" {...noSave(dl)} /></div>
            : (
              <div className="flex flex-col items-center gap-3 p-10 text-center">
                <span className={`grid h-20 w-20 place-items-center rounded-3xl ${type.tone}`}><type.Icon className="h-10 w-10" aria-hidden="true" /></span>
                {!dl.can && <p className="max-w-xs text-sm text-slate-600">{t("shared.req.onlyDownload")}</p>}
              </div>
            )}
        </div>
      </div>
    </div>
  );
}

export default function SharedFile() {
  const { t, locale } = useI18n();
  const errorText = useErrorText();
  const [params] = useSearchParams();
  const token = (params.get("f") || "").toLowerCase();
  const valid = /^[a-f0-9]{32}$/.test(token);
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(valid ? "" : "gone");
  const [attempt, setAttempt] = useState(0);
  const keyName = `ranilix.sharereq.${token}`;
  // The visitor's request key: from the approval email link, or saved on this device when they asked.
  const [reqKey, setReqKey] = useState(() => {
    const fromLink = (params.get("k") || "").toLowerCase();
    try {
      if (/^[a-f0-9]{32}$/.test(fromLink)) { localStorage.setItem(keyName, fromLink); return fromLink; }
      return localStorage.getItem(keyName) || "";
    } catch { return /^[a-f0-9]{32}$/.test(fromLink) ? fromLink : ""; }
  });
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (!valid) return;
    setError("");
    withRetry(() => sharedInfo(token, reqKey)).then(setInfo).catch((e) => setError(e?.code === "drive_link_gone" || e?.code === "drive_not_found" ? "gone" : errorText(e)));
  }, [token, valid, errorText, attempt, reqKey]);

  // While a request waits, check now and then whether the owner answered.
  const pending = info?.viewOnly && info?.access === "pending";
  useEffect(() => {
    if (!pending) return undefined;
    const id = setInterval(() => { sharedInfo(token, reqKey).then(setInfo).catch(() => {}); }, 15000);
    return () => clearInterval(id);
  }, [pending, token, reqKey]);

  const onAsked = useCallback((key) => {
    try { localStorage.setItem(keyName, key); } catch { /* still works this visit */ }
    setAsking(false);
    setReqKey(key);
  }, [keyName]);
  const dl = info ? { viewOnly: !!info.viewOnly, access: info.access || "approved", can: !info.viewOnly || info.access === "approved", k: info.viewOnly ? reqKey : "", ask: () => setAsking(true) } : null;

  useEffect(() => {
    const original = document.title;
    document.title = info ? `${info.name} · ${BRAND.short}` : `${t("shared.title")} · ${BRAND.short}`;
    return () => { document.title = original; };
  }, [info, t]);

  const type = info && !info.folder ? typeOf({ ...info, folder: false }) : null;

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-surface">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 sm:px-6">
          <Link to="/" dir="ltr" className="flex items-center gap-2 rounded-xl" aria-label={t("nav.home", { name: BRAND.name })}>
            <LogoMark size={32} />
            <span className="font-display text-lg font-extrabold tracking-[-0.03em] text-slate-900">{BRAND.short}</span>
          </Link>
          <Preferences compact />
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6">
        {error === "gone" ? (
          <div className="rounded-3xl border border-slate-200 bg-surface p-10 text-center">
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-slate-100 text-slate-500"><Link2Off className="h-8 w-8" aria-hidden="true" /></span>
            <h1 className="mt-5 text-2xl font-extrabold text-slate-900">{t("shared.goneTitle")}</h1>
            <p className="mt-2 text-slate-600">{t("shared.goneText")}</p>
          </div>
        ) : error ? (
          <RetryBox text={error} onRetry={() => setAttempt((n) => n + 1)} />
        ) : !info ? (
          <div className="grid place-items-center py-24 text-slate-400"><Loader2 className="h-8 w-8 animate-spin" /></div>
        ) : info.folder ? (
          <SharedFolder token={token} info={info} dl={dl} />
        ) : (
          <div className="rounded-3xl border border-slate-200 bg-surface p-6 shadow-sm sm:p-8">
            <p className="text-sm font-semibold text-brand-700">{t("shared.eyebrow")}</p>
            <div className="mt-4 flex items-center gap-4">
              <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl ${type.tone}`}><type.Icon className="h-7 w-7" aria-hidden="true" /></span>
              <div className="min-w-0">
                <h1 className="truncate text-xl font-extrabold text-slate-900 sm:text-2xl"><bdi>{info.name}</bdi></h1>
                <p className="mt-0.5 text-sm text-slate-500">
                  <bdi dir="ltr">{formatBytes(info.size)}</bdi> · {t("shared.sharedOn", { date: new Date(info.sharedAt).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" }) })}
                </p>
              </div>
            </div>

            <AccessBanner dl={dl} />
            {dl.can || info.viewable ? <Preview token={token} info={info} dl={dl} />
              : <p className="mt-6 rounded-2xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-600"><Lock className="mx-auto mb-2 h-6 w-6 text-slate-400" aria-hidden="true" />{t("shared.req.onlyDownload")}</p>}

            {dl.can ? (
              <a href={sharedFileUrl(token, false, dl.k)} download={info.name}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 px-5 py-4 text-lg font-bold text-white shadow-lg shadow-brand-600/20 transition hover:bg-brand-500">
                <Download className="h-5 w-5" aria-hidden="true" /> {t("shared.download")}
              </a>
            ) : dl.access !== "pending" && (
              <button type="button" onClick={dl.ask}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-brand-600 px-5 py-4 text-lg font-bold text-brand-700 transition hover:bg-brand-50">
                <Lock className="h-5 w-5" aria-hidden="true" /> {t("shared.req.ask")}
              </button>
            )}
            <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-slate-500">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" /> {t("shared.safety")}
            </p>
            <p className="mt-2 flex items-start gap-2 text-xs leading-relaxed text-slate-500">
              <Eye className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" /> {t("shared.visitsNote")}
            </p>
          </div>
        )}

        {asking && <RequestDialog token={token} onDone={onAsked} onClose={() => setAsking(false)} />}

        <div className="mt-8 rounded-3xl bg-ink p-6 text-center text-white sm:p-8">
          <p className="text-xl font-extrabold">{t("shared.ctaTitle")}</p>
          <p className="mt-1 text-sm text-white/70">{t("shared.ctaText")}</p>
          <Link to="/signup" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-[#0B1220] hover:bg-white/90">{t("shared.ctaButton")}</Link>
        </div>
      </main>
    </div>
  );
}
