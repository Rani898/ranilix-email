// Public download page for a file someone shared from their drive: /share?f=<token>.
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronLeft, Download, FileAudio, Folder, FolderOpen, Link2Off, Loader2, Play, ShieldCheck, X } from "lucide-react";
import { BRAND } from "../config.js";
import LogoMark from "../components/LogoMark.jsx";
import Preferences from "../components/Preferences.jsx";
import { useErrorText, useI18n } from "../lib/i18n.jsx";
import { formatBytes } from "../lib/validation.js";
import { previewKind, typeOf } from "../lib/fileTypes.js";
import { sharedFileUrl, sharedInfo, sharedItemUrl, sharedList } from "../lib/api.js";

const PREVIEW_MAX = 30 * 1024 * 1024; // show it in the page only when it's small enough to load whole

function Preview({ token, info }) {
  const { t } = useI18n();
  const kind = previewKind(info);
  const [url, setUrl] = useState(null);
  const [bad, setBad] = useState(false);
  // Straight from the server: videos stream and can be skipped through, whatever their size.
  useEffect(() => { if (kind) setUrl(sharedFileUrl(token, true)); }, [token, kind]);
  if (!kind || (kind === "image" && info.size > PREVIEW_MAX) || bad) return null;
  return (
    <div className={`mt-6 grid min-h-40 place-items-center overflow-hidden rounded-2xl ${kind === "video" ? "bg-black" : "bg-slate-100"}`}>
      {!url ? <Loader2 className={`h-6 w-6 animate-spin ${kind === "video" ? "text-white/60" : "text-slate-400"}`} />
        : kind === "video" ? <video src={url} controls playsInline preload="metadata" onError={() => setBad(true)} className="max-h-[60vh] w-full bg-black" aria-label={info.name} />
        : kind === "audio" ? (
          <div className="flex w-full flex-col items-center gap-3 p-6">
            <FileAudio className="h-8 w-8 text-sky-600" aria-hidden="true" />
            <audio src={url} controls onError={() => setBad(true)} className="w-full" aria-label={info.name} />
          </div>
        ) : <img src={url} alt={info.name} onError={() => setBad(true)} className="max-h-[60vh] w-auto object-contain" />}
      {kind !== "image" && url && <span className="sr-only">{t("shared.preview")}</span>}
    </div>
  );
}

// A shared folder: browse it and its sub-folders, preview pictures and videos, download files.
function SharedFolder({ token, info }) {
  const { t, locale } = useI18n();
  const errorText = useErrorText();
  const [sub, setSub] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(null);
  useEffect(() => {
    let alive = true;
    setData(null); setError("");
    sharedList(token, sub).then((d) => alive && setData(d)).catch((e) => alive && setError(errorText(e)));
    return () => { alive = false; };
  }, [token, sub, errorText]);
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

      {error ? <p role="alert" className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
        : !data ? <div className="grid place-items-center py-16 text-slate-400"><Loader2 className="h-7 w-7 animate-spin" /></div>
        : data.items.length === 0 ? <p className="mt-6 rounded-2xl bg-slate-50 py-12 text-center text-slate-500">{t("shared.folderEmpty")}</p>
        : (
          <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {data.items.map((item) => <FolderTile key={item.id} token={token} item={item} onOpen={() => item.folder ? setSub(item.id) : setOpen(item)} />)}
          </ul>
        )}

      <p className="mt-6 flex items-start gap-2 text-xs leading-relaxed text-slate-500">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" /> {t("shared.safety")}
      </p>
      {open && <ItemViewer token={token} item={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function FolderTile({ token, item, onOpen }) {
  const { t } = useI18n();
  const kind = item.folder ? null : previewKind(item);
  const [broken, setBroken] = useState(false);
  const type = typeOf(item);
  const media = !broken && (kind === "image" || kind === "video");
  return (
    <li className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-surface transition hover:border-brand-300 hover:shadow-md">
      <button type="button" onClick={onOpen} aria-label={item.folder ? t("shared.openFolder", { name: item.name }) : item.name}
        className="relative grid aspect-square w-full place-items-center overflow-hidden bg-slate-50">
        {item.folder ? <Folder className="h-14 w-14 fill-amber-300 text-amber-500" aria-hidden="true" />
          : media && kind === "image" ? <img src={sharedItemUrl(token, item.id, true)} alt="" loading="lazy" onError={() => setBroken(true)} className="h-full w-full object-cover" />
          : media && kind === "video" ? (
            <>
              <video src={`${sharedItemUrl(token, item.id, true)}#t=0.1`} preload="metadata" muted playsInline onError={() => setBroken(true)} className="h-full w-full bg-black object-cover" />
              <span className="absolute grid h-10 w-10 place-items-center rounded-full bg-black/55 text-white"><Play className="h-5 w-5 fill-white" aria-hidden="true" /></span>
            </>
          ) : <span className={`grid h-14 w-14 place-items-center rounded-2xl ${type.tone}`}><type.Icon className="h-7 w-7" aria-hidden="true" /></span>}
      </button>
      <div className="flex items-center gap-1 px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-start text-sm font-semibold text-slate-800"><bdi>{item.name}</bdi></p>
          {!item.folder && <p className="text-xs text-slate-500"><bdi dir="ltr">{formatBytes(item.size)}</bdi></p>}
        </div>
        {!item.folder && (
          <a href={sharedItemUrl(token, item.id)} download={item.name} aria-label={`${t("shared.download")} ${item.name}`} title={t("shared.download")}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-brand-700">
            <Download className="h-4 w-4" aria-hidden="true" />
          </a>
        )}
      </div>
    </li>
  );
}

function ItemViewer({ token, item, onClose }) {
  const { t } = useI18n();
  const kind = previewKind(item);
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
          <a href={sharedItemUrl(token, item.id)} download={item.name} className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-2 text-sm font-bold text-white hover:bg-brand-500">
            <Download className="h-4 w-4" aria-hidden="true" /> {t("shared.download")}
          </a>
          <button type="button" onClick={onClose} aria-label={t("shared.close")} className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className={`grid min-h-48 flex-1 place-items-center overflow-auto ${kind === "video" || kind === "image" ? "bg-black" : "bg-slate-50"}`}>
          {kind === "video" ? <video src={url} controls autoPlay playsInline className="max-h-[75vh] w-full" />
            : kind === "image" ? <img src={url} alt={item.name} className="max-h-[75vh] w-auto object-contain" />
            : kind === "audio" ? <div className="flex w-full flex-col items-center gap-3 p-8"><FileAudio className="h-8 w-8 text-sky-600" aria-hidden="true" /><audio src={url} controls autoPlay className="w-full" /></div>
            : <span className={`m-10 grid h-20 w-20 place-items-center rounded-3xl ${type.tone}`}><type.Icon className="h-10 w-10" aria-hidden="true" /></span>}
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

  useEffect(() => {
    if (!valid) return;
    sharedInfo(token).then(setInfo).catch((e) => setError(e?.code === "drive_link_gone" || e?.code === "drive_not_found" ? "gone" : errorText(e)));
  }, [token, valid, errorText]);

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
          <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
        ) : !info ? (
          <div className="grid place-items-center py-24 text-slate-400"><Loader2 className="h-8 w-8 animate-spin" /></div>
        ) : info.folder ? (
          <SharedFolder token={token} info={info} />
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

            <Preview token={token} info={info} />

            <a href={sharedFileUrl(token)} download={info.name}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 px-5 py-4 text-lg font-bold text-white shadow-lg shadow-brand-600/20 transition hover:bg-brand-500">
              <Download className="h-5 w-5" aria-hidden="true" /> {t("shared.download")}
            </a>
            <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-slate-500">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" /> {t("shared.safety")}
            </p>
          </div>
        )}

        <div className="mt-8 rounded-3xl bg-ink p-6 text-center text-white sm:p-8">
          <p className="text-xl font-extrabold">{t("shared.ctaTitle")}</p>
          <p className="mt-1 text-sm text-white/70">{t("shared.ctaText")}</p>
          <Link to="/signup" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-[#0B1220] hover:bg-white/90">{t("shared.ctaButton")}</Link>
        </div>
      </main>
    </div>
  );
}
