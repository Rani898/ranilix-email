import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ExternalLink, Loader2, Lock, LogOut, Paperclip, RefreshCw, Reply } from "lucide-react";
import SenderAvatar from "./SenderAvatar.jsx";
import LinkifiedText from "./LinkifiedText.jsx";
import { Button, Modal } from "./ui.jsx";
import { useErrorText, useI18n } from "../lib/i18n.jsx";
import { formatBytes } from "../lib/validation.js";
import { gmailGet, gmailList, googleDisconnect, googleStart, googleStatus } from "../lib/api.js";

/** Google's own "G" mark, loaded from Google (we don't redraw their logo). */
export function GoogleMark({ size = 20 }) {
  const [broken, setBroken] = useState(false);
  if (broken) return <span className="grid place-items-center rounded-full bg-slate-100 font-bold text-slate-600" style={{ width: size, height: size, fontSize: size * 0.6 }}>G</span>;
  return (
    <img
      src="https://developers.google.com/identity/images/g-logo.png"
      alt=""
      width={size}
      height={size}
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      style={{ width: size, height: size }}
    />
  );
}

/** Big "Google" tile: the connect option. */
function ConnectCard({ status, onConnect, busy, error }) {
  const { t } = useI18n();
  return (
    <div className="grid h-full place-items-center px-6 py-10">
      <div className="w-full max-w-sm text-center">
        <button
          type="button"
          onClick={onConnect}
          disabled={busy || !status.configured}
          className="mx-auto flex w-40 flex-col items-center gap-3 rounded-3xl border border-slate-200 bg-surface px-6 py-6 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
          aria-label={t("gmail.connect")}
        >
          <span className="grid h-16 w-16 place-items-center rounded-full bg-white shadow-sm ring-1 ring-slate-200">
            {busy ? <Loader2 className="h-7 w-7 animate-spin text-slate-500" /> : <GoogleMark size={34} />}
          </span>
          <span className="text-base font-semibold text-slate-900">Google</span>
        </button>
        <h2 className="mt-6 text-xl font-bold text-slate-900">{t("gmail.title")}</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">{status.configured ? t("gmail.intro") : t("gmail.notSetUp")}</p>
        {status.configured && (
          <>
            <button
              type="button"
              onClick={onConnect}
              disabled={busy}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-brand-600/20 hover:bg-brand-500 disabled:opacity-70"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleMark size={18} />} {t("gmail.connect")}
            </button>
            <p className="mt-4 flex items-start justify-center gap-1.5 text-xs leading-relaxed text-slate-500">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {t("gmail.privacy")}
            </p>
          </>
        )}
        {error && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
      </div>
    </div>
  );
}

/**
 * The "Gmail" folder: connect a Google account, then read its inbox (read-only).
 * Replies go out from the Ranilix address through onReply.
 */
export default function GmailView({ query, onReply, onToast }) {
  const { t, locale } = useI18n();
  const errorText = useErrorText();
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [list, setList] = useState([]);
  const [next, setNext] = useState(null);
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [open, setOpen] = useState(null);
  const [opening, setOpening] = useState(false);
  const [askDisconnect, setAskDisconnect] = useState(false);

  const shortDate = (ts) => {
    const d = new Date(ts);
    if (d.toDateString() === new Date().toDateString()) return d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString(locale, { month: "short", day: "numeric" });
  };

  const onFail = useCallback((err) => {
    if (err?.code === "google_reconnect" || err?.code === "google_not_connected") {
      setStatus((s) => ({ ...s, connected: false }));
      setList([]);
      setOpenId(null);
    }
    setError(errorText(err));
  }, [errorText]);

  useEffect(() => {
    googleStatus().then(setStatus).catch((err) => { setStatus({ configured: false, connected: false }); setError(errorText(err)); });
  }, [errorText]);

  const load = useCallback(async (pageToken = "") => {
    setLoading(true);
    setError("");
    try {
      const res = await gmailList({ q: query.trim(), pageToken });
      setList((l) => (pageToken ? [...l, ...res.messages] : res.messages));
      setNext(res.nextPageToken);
    } catch (err) {
      onFail(err);
    } finally {
      setLoading(false);
    }
  }, [query, onFail]);

  useEffect(() => {
    if (!status?.connected) return;
    const timer = setTimeout(() => load(), query ? 400 : 0);
    return () => clearTimeout(timer);
  }, [status?.connected, load, query]);

  const openMessage = async (m) => {
    setOpenId(m.id);
    setOpen(null);
    setOpening(true);
    try {
      setOpen(await gmailGet(m.id));
    } catch (err) {
      onFail(err);
      setOpenId(null);
    } finally {
      setOpening(false);
    }
  };

  const connect = async () => {
    setBusy(true);
    setError("");
    try {
      const { url } = await googleStart(`${window.location.origin}${import.meta.env.BASE_URL}inbox`);
      window.location.assign(url);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setAskDisconnect(false);
    try { await googleDisconnect(); } catch { /* ignore */ }
    setStatus((s) => ({ ...s, connected: false, email: "" }));
    setList([]);
    setOpenId(null);
    onToast(t("gmail.disconnected"));
  };

  if (!status) {
    return <div className="grid flex-1 place-items-center bg-surface"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>;
  }
  if (!status.connected) {
    return <section className="min-w-0 flex-1 overflow-y-auto bg-surface"><ConnectCard status={status} onConnect={connect} busy={busy} error={error} /></section>;
  }

  const gmailLink = (id) => `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(status.email)}#all/${id}`;

  return (
    <>
      {/* List */}
      <section className={`min-w-0 flex-1 overflow-y-auto border-slate-200 bg-surface lg:max-w-md lg:border-e ${openId ? "hidden lg:block" : ""}`}>
        <div className="sticky top-0 z-10 border-b border-slate-100 bg-surface/95 px-5 py-3 backdrop-blur">
          <div className="flex items-center justify-between gap-2">
            <h1 className="flex min-w-0 items-center gap-2 text-lg font-bold text-slate-900">
              <GoogleMark size={18} /> <span className="truncate">{query ? t("inbox.resultsFor", { q: query }) : "Gmail"}</span>
            </h1>
            <div className="flex shrink-0 items-center gap-1">
              <button onClick={() => load()} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label={t("inbox.checkNew")} title={t("inbox.checkNew")}>
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </button>
              <button onClick={() => setAskDisconnect(true)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label={t("gmail.disconnect")} title={t("gmail.disconnect")}>
                <LogOut className="h-4 w-4 rtl:rotate-180" />
              </button>
            </div>
          </div>
          <p dir="ltr" className="mt-0.5 truncate text-xs text-slate-500 rtl:text-right">{status.email}</p>
        </div>
        {error && <p role="alert" className="mx-5 mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
        {loading && !list.length ? (
          <div className="grid place-items-center py-20 text-slate-400"><Loader2 className="h-8 w-8 animate-spin" /></div>
        ) : !list.length ? (
          <p className="px-6 py-20 text-center font-semibold text-slate-700">{query ? t("inbox.emptySearch") : t("gmail.empty")}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {list.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => openMessage(m)}
                  className={`flex w-full gap-3 px-5 py-4 text-start transition hover:bg-slate-50 ${openId === m.id ? "bg-brand-50" : m.unread ? "bg-brand-50/40" : ""}`}
                >
                  <SenderAvatar name={m.from.name || m.from.email} email={m.from.email} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span dir="auto" className={`truncate text-sm ${m.unread ? "font-bold text-slate-900" : "font-medium text-slate-700"}`}>{m.from.name || m.from.email}</span>
                      <span className={`shrink-0 text-xs ${m.unread ? "font-semibold text-brand-700" : "text-slate-500"}`}>{shortDate(m.date)}</span>
                    </span>
                    <span dir="auto" className={`block truncate text-sm ${m.unread ? "font-semibold text-slate-900" : "text-slate-700"}`}>{m.subject}</span>
                    <span dir="auto" className="block truncate text-sm text-slate-500">{m.snippet}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {next && (
          <div className="p-4 text-center">
            <button onClick={() => load(next)} disabled={loading} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
              {loading ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : t("gmail.more")}
            </button>
          </div>
        )}
      </section>

      {/* Reading pane */}
      <section className={`min-w-0 flex-1 overflow-y-auto bg-surface ${openId ? "block" : "hidden lg:block"}`}>
        {opening ? (
          <div className="grid h-full place-items-center text-slate-400"><Loader2 className="h-8 w-8 animate-spin" /></div>
        ) : open ? (
          <article className="mx-auto max-w-3xl px-5 py-6 sm:px-8">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button onClick={() => setOpenId(null)} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 lg:hidden">
                <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {t("inbox.back")}
              </button>
              <a href={gmailLink(open.id)} target="_blank" rel="noreferrer" className="ms-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100">
                <ExternalLink className="h-4 w-4" /> {t("gmail.openInGmail")}
              </a>
            </div>
            <h2 dir="auto" className="mt-4 text-2xl font-bold tracking-tight text-slate-900">{open.subject}</h2>
            <div className="mt-5 flex items-center gap-3">
              <SenderAvatar name={open.from.name || open.from.email} email={open.from.email} size={44} />
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900">
                  <bdi>{open.from.name}</bdi> <bdi dir="ltr" className="font-normal text-slate-500">&lt;{open.from.email}&gt;</bdi>
                </p>
                <p className="truncate text-sm text-slate-500">{new Date(open.date).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })}</p>
              </div>
            </div>
            <div dir="auto" className="mt-6 whitespace-pre-wrap break-words leading-relaxed text-slate-800 [unicode-bidi:plaintext]"><LinkifiedText text={open.body} /></div>
            {open.attachments?.length > 0 && (
              <div className="mt-6 rounded-xl border border-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-700">{t("gmail.attachments", { n: open.attachments.length })}</p>
                <ul className="mt-2 space-y-1">
                  {open.attachments.map((a, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-slate-600">
                      <Paperclip className="h-4 w-4 shrink-0 text-slate-400" /> <bdi className="truncate">{a.filename}</bdi> <bdi dir="ltr" className="shrink-0 text-xs text-slate-400">{formatBytes(a.size)}</bdi>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-slate-500">{t("gmail.attachmentsHint")}</p>
              </div>
            )}
            <div className="mt-8 flex flex-wrap gap-2 border-t border-slate-200 pt-5">
              <button onClick={() => onReply(open)} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                <Reply className="h-4 w-4 rtl:-scale-x-100" /> {t("gmail.replyFromRanilix")}
              </button>
            </div>
          </article>
        ) : (
          <div className="grid h-full place-items-center px-6 text-center">
            <div>
              <GoogleMark size={40} />
              <p className="mt-3 font-semibold text-slate-700">{t("inbox.select")}</p>
            </div>
          </div>
        )}
      </section>

      {askDisconnect && (
        <Modal
          tone="danger"
          title={t("gmail.disconnectTitle")}
          onClose={() => setAskDisconnect(false)}
          footer={<>
            <Button variant="ghost" onClick={() => setAskDisconnect(false)}>{t("gmail.cancel")}</Button>
            <Button variant="danger" onClick={disconnect}>{t("gmail.disconnect")}</Button>
          </>}
        >
          {t("gmail.disconnectText", { email: <bdi dir="ltr">{status.email}</bdi> })}
        </Modal>
      )}
    </>
  );
}
