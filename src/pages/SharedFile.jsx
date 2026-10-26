// Public download page for a file someone shared from their drive: /share?f=<token>.
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Download, FileAudio, Link2Off, Loader2, ShieldCheck } from "lucide-react";
import { BRAND } from "../config.js";
import LogoMark from "../components/LogoMark.jsx";
import Preferences from "../components/Preferences.jsx";
import { useErrorText, useI18n } from "../lib/i18n.jsx";
import { formatBytes } from "../lib/validation.js";
import { mediaType, previewKind, typeOf } from "../lib/fileTypes.js";
import { sharedFetch, sharedFileUrl, sharedInfo } from "../lib/api.js";

const PREVIEW_MAX = 30 * 1024 * 1024; // show it in the page only when it's small enough to load whole

function Preview({ token, info }) {
  const { t } = useI18n();
  const kind = previewKind(info);
  const [url, setUrl] = useState(null);
  const [bad, setBad] = useState(false);
  useEffect(() => {
    if (!kind || info.size > PREVIEW_MAX) return;
    let u;
    sharedFetch(token)
      .then((b) => { u = URL.createObjectURL(kind === "image" ? b : new Blob([b], { type: mediaType(info) })); setUrl(u); })
      .catch(() => setBad(true));
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [token, info, kind]);
  if (!kind || info.size > PREVIEW_MAX || bad) return null;
  return (
    <div className={`mt-6 grid min-h-40 place-items-center overflow-hidden rounded-2xl ${kind === "video" ? "bg-black" : "bg-slate-100"}`}>
      {!url ? <Loader2 className={`h-6 w-6 animate-spin ${kind === "video" ? "text-white/60" : "text-slate-400"}`} />
        : kind === "video" ? <video src={url} controls playsInline onError={() => setBad(true)} className="max-h-[60vh] w-full bg-black" aria-label={info.name} />
        : kind === "audio" ? (
          <div className="flex w-full flex-col items-center gap-3 p-6">
            <FileAudio className="h-8 w-8 text-sky-600" aria-hidden="true" />
            <audio src={url} controls onError={() => setBad(true)} className="w-full" aria-label={info.name} />
          </div>
        ) : <img src={url} alt={info.name} className="max-h-[60vh] w-auto object-contain" />}
      {kind !== "image" && url && <span className="sr-only">{t("shared.preview")}</span>}
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

  const type = info ? typeOf({ ...info, folder: false }) : null;

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

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
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
