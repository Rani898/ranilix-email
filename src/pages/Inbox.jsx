import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Bell,
  BellOff,
  BellRing,
  Forward,
  Inbox as InboxIcon,
  Loader2,
  Mail,
  Menu,
  Paperclip,
  PenSquare,
  RefreshCw,
  Reply,
  ReplyAll,
  Search,
  Send,
  ShieldCheck,
  Star,
  Trash2,
} from "lucide-react";
import { BRAND, DEMO_MODE } from "../config.js";
import LogoMark from "../components/LogoMark.jsx";
import SenderAvatar from "../components/SenderAvatar.jsx";
import AccountMenu from "../components/AccountMenu.jsx";
import Preferences from "../components/Preferences.jsx";
import Compose from "../components/Compose.jsx";
import { AttachmentList } from "../components/Attachments.jsx";
import { AnnouncementBanner } from "../components/ui.jsx";
import LinkifiedText from "../components/LinkifiedText.jsx";
import { endSession, getSession, useSessionVersion } from "../lib/session.js";
import { useErrorText, useI18n } from "../lib/i18n.jsx";
import { AuthError, checkLatest, deleteMessage as apiDelete, getAnnouncement, getMe, listMessages, logOut, sendMessage, updateMessage } from "../lib/api.js";

// New-mail check: every few seconds while the tab is visible, once a minute in the background.
const CHECK_VISIBLE_MS = 5_000;
const CHECK_HIDDEN_MS = 60_000;
const FOLDER_ICONS = { inbox: InboxIcon, starred: Star, sent: Send, trash: Trash2 };
const notificationsSupported = typeof window !== "undefined" && "Notification" in window;


/* ---------- Reply / forward helpers ---------- */

const splitAddresses = (s) => (s || "").toLowerCase().split(/[,;\s]+/).filter(Boolean);
const prefixed = (prefix, subject) => (new RegExp(`^${prefix}:`, "i").test(subject) ? subject : `${prefix}: ${subject}`);

function buildDraft(kind, m, me, t, longDate) {
  const quoteHeader = t("compose.quoteHeader", { date: longDate(m.date), name: m.from.name, email: m.from.email });
  const quoted = `\n\n${quoteHeader}\n${m.body.split("\n").map((l) => `> ${l}`).join("\n")}`;

  if (kind === "forward") {
    const header = [
      t("compose.forwardHeader"),
      `${t("compose.fwdFrom")}: ${m.from.name} <${m.from.email}>`,
      `${t("compose.fwdDate")}: ${longDate(m.date)}`,
      `${t("compose.fwdSubject")}: ${m.subject}`,
      `${t("compose.fwdTo")}: ${m.to}`,
    ].join("\n");
    return { mode: "forward", to: "", subject: prefixed("Fwd", m.subject), body: `\n\n${header}\n\n${m.body}`, forwardAttachments: m.attachments || [] };
  }

  const fromSent = m.folder === "sent" || m.from.email === me;
  let to = fromSent ? splitAddresses(m.to) : [m.from.email.toLowerCase()];
  if (kind === "replyAll") {
    to = [...new Set([...to, ...splitAddresses(m.to), m.from.email.toLowerCase()])].filter((a) => a !== me);
    if (!to.length) to = [m.from.email.toLowerCase()];
  }
  return { mode: "reply", to: to.join(", "), subject: prefixed("Re", m.subject), body: quoted };
}

/* ---------- Page ---------- */

/** Remounts the inbox whenever the user switches to another saved account. */
export default function InboxPage() {
  useSessionVersion();
  const email = getSession()?.email;
  if (!email) return <Navigate to="/login" replace />;
  return <Inbox key={email} />;
}

function Inbox() {
  const { t, locale } = useI18n();
  const errorText = useErrorText();
  const session = getSession();
  const navigate = useNavigate();
  const email = session?.email;

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [folder, setFolder] = useState("inbox");
  const [openId, setOpenId] = useState(null);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState(null); // null = compose closed
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [permission, setPermission] = useState(notificationsSupported ? Notification.permission : "unsupported");

  const [isAdmin, setIsAdmin] = useState(false);
  const [banner, setBanner] = useState(null);
  const seenIds = useRef(null);
  const tRef = useRef(t);
  tRef.current = t;

  const shortDate = useCallback((ts) => {
    const d = new Date(ts);
    if (d.toDateString() === new Date().toDateString()) return d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString(locale, { month: "short", day: "numeric" });
  }, [locale]);
  const longDate = useCallback((ts) => new Date(ts).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }), [locale]);

  const handleError = useCallback((err) => {
    if (err instanceof AuthError) { endSession(email); if (!getSession()) navigate("/login", { replace: true }); return; }
    setToast(errorText(err));
  }, [navigate, errorText, email]);

  // Tell the user about mail that arrived since the last check.
  const announce = useCallback((list) => {
    const seen = seenIds.current;
    seenIds.current = new Set(list.map((m) => m.id));
    if (!seen) return; // first load: nothing is "new"
    const fresh = list.filter((m) => m.folder === "inbox" && !m.read && !seen.has(m.id) && m.from.email !== email);
    if (!fresh.length) return;
    const tt = tRef.current;
    if (document.hidden && notificationsSupported && Notification.permission === "granted") {
      for (const m of fresh.slice(0, 3)) {
        try {
          const n = new Notification(tt("inbox.newFrom", { name: m.from.name || m.from.email }), {
            body: m.subject,
            icon: `${import.meta.env.BASE_URL}favicon.svg`,
            tag: `ranilix-${m.id}`,
          });
          n.onclick = () => { window.focus(); setFolder("inbox"); setOpenId(m.id); n.close(); };
        } catch { /* some browsers only allow notifications from a service worker */ }
      }
    } else {
      setToast(tt("inbox.newFrom", { name: fresh[0].from.name || fresh[0].from.email }));
    }
  }, [email]);

  const refresh = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const list = await listMessages();
      setMessages(list);
      announce(list);
      setLoadError("");
    } catch (err) {
      if (err instanceof AuthError) return handleError(err);
      setLoadError(errorText(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [handleError, errorText, announce]);

  // Poll the cheap check endpoint; load the full list only when something new arrived.
  useEffect(() => {
    if (!email) return;
    let stopped = false;
    let timer;
    let latest;
    const tick = async () => {
      try {
        const now = await checkLatest();
        if (latest !== undefined && now !== latest) await refresh();
        latest = now;
      } catch (err) {
        if (err instanceof AuthError) return handleError(err);
      }
      if (!stopped) timer = setTimeout(tick, document.hidden ? CHECK_HIDDEN_MS : CHECK_VISIBLE_MS);
    };
    refresh().then(tick);
    const onVisible = () => { if (!document.hidden) { clearTimeout(timer); tick(); } };
    document.addEventListener("visibilitychange", onVisible);
    return () => { stopped = true; clearTimeout(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [email, refresh, handleError]);

  // Admin link (only shown to admins; the server still checks every admin request) + site banner.
  useEffect(() => {
    if (!email) return;
    getMe().then((me) => setIsAdmin(!!me.isAdmin)).catch(() => {});
    getAnnouncement().then((a) => {
      let dismissed = "";
      try { dismissed = sessionStorage.getItem("ranilix.banner.dismissed") || ""; } catch { /* ignore */ }
      if (a.enabled && a.text && a.text !== dismissed) setBanner(a);
    }).catch(() => {});
  }, [email]);

  const dismissBanner = () => {
    try { sessionStorage.setItem("ranilix.banner.dismissed", banner.text); } catch { /* ignore */ }
    setBanner(null);
  };

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const unread = useMemo(() => messages.filter((m) => m.folder === "inbox" && !m.read).length, [messages]);

  // Unread count in the browser tab, e.g. "(3) Inbox · Ranilix".
  useEffect(() => {
    const original = document.title;
    document.title = `${unread ? `(${unread}) ` : ""}${t("inbox.title")} · ${BRAND.short}`;
    return () => { document.title = original; };
  }, [unread, t]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return messages
      .filter((m) => (folder === "starred" ? m.starred && m.folder !== "trash" : m.folder === folder))
      .filter((m) => !q || [m.subject, m.body, m.from.name, m.from.email, m.to, ...(m.attachments || []).map((a) => a.filename)].join(" ").toLowerCase().includes(q))
      .sort((a, b) => b.date - a.date);
  }, [messages, folder, query]);

  const open = messages.find((m) => m.id === openId);

  // Optimistic update: change the screen right away, then save on the server.
  const update = (id, patch) => {
    setMessages((ms) => ms.map((m) => (m.id === id ? { ...m, ...patch } : m)));
    updateMessage(id, patch).catch((err) => { handleError(err); refresh(); });
  };

  const openMessage = (m) => { setOpenId(m.id); if (!m.read) update(m.id, { read: true }); };
  const switchFolder = (id) => { setFolder(id); setOpenId(null); setSidebarOpen(false); };

  const deleteMessage = (m) => {
    if (m.folder === "trash") {
      setMessages((ms) => ms.filter((x) => x.id !== m.id));
      apiDelete(m.id).then(() => setToast(t("inbox.deletedForever"))).catch((err) => { handleError(err); refresh(); });
    } else {
      update(m.id, { folder: "trash" });
      setToast(t("inbox.movedToTrash"));
    }
    setOpenId(null);
  };

  const send = async (msg) => {
    try {
      await sendMessage(msg);
    } catch (err) {
      if (err instanceof AuthError) return handleError(err);
      throw err; // shown inside the compose window
    }
    setDraft(null);
    setToast(t("inbox.sent"));
    refresh();
  };

  const enableNotifications = async () => {
    if (!notificationsSupported) return;
    try { setPermission(await Notification.requestPermission()); } catch { /* ignore */ }
  };

  // Signs out only this account; if other accounts are saved, the inbox switches to the next one.
  const logout = async () => {
    await logOut();
    endSession(email);
    if (!getSession()) navigate("/");
  };

  const folderLabel = t(`inbox.folders.${folder}`);

  return (
    <div className="flex h-dvh flex-col bg-slate-50">
      {/* Top bar */}
      <header className="flex h-16 shrink-0 items-center gap-2 border-b border-slate-200 bg-surface px-3 sm:gap-3 sm:px-5">
        <button onClick={() => setSidebarOpen(true)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" aria-label={t("inbox.openFolders")}>
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex lg:w-56">
          <Link to="/" dir="ltr" className="flex items-center gap-2 rounded-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200" aria-label={t("nav.home", { name: BRAND.name })} title={t("nav.home", { name: BRAND.name })}>
            <LogoMark size={36} />
            <span className="hidden font-display text-xl font-extrabold tracking-[-0.03em] text-slate-900 sm:block">{BRAND.short}</span>
          </Link>
        </div>
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-slate-100 px-3 focus-within:bg-surface focus-within:ring-2 focus-within:ring-brand-200">
          <Search className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
          <input
            id="mail-search"
            dir="auto"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpenId(null); }}
            placeholder={t("inbox.search")}
            aria-label={t("inbox.search")}
            className="w-full min-w-0 bg-transparent py-2.5 text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none"
          />
        </label>
        <div className="flex items-center gap-1 sm:gap-2">
          {isAdmin && (
            <Link to="/admin" className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100" title={t("inbox.adminPanel")} aria-label={t("inbox.adminPanel")}>
              <ShieldCheck className="h-4 w-4 text-brand-600" /> <span className="hidden md:inline">{t("inbox.adminPanel")}</span>
            </Link>
          )}
          <Preferences compact className="hidden sm:flex" />
          <span dir="ltr" className="hidden max-w-[14rem] truncate text-sm font-medium text-slate-600 xl:block">{email}</span>
          <AccountMenu email={email} onLogout={logout} />
        </div>
      </header>

      {banner && <AnnouncementBanner text={banner.text} level={banner.level} onDismiss={dismissBanner} dismissLabel={t("inbox.dismiss")} />}

      <div className="flex min-h-0 flex-1">
        {/* Sidebar */}
        {sidebarOpen && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setSidebarOpen(false)} />}
        <aside
          className={`fixed inset-y-0 start-0 z-40 flex w-64 flex-col overflow-y-auto bg-surface p-4 transition-transform lg:static lg:z-auto lg:w-60 lg:bg-transparent ${
            sidebarOpen ? "translate-x-0 shadow-xl" : "max-lg:ltr:-translate-x-full max-lg:rtl:translate-x-full"
          }`}
        >
          <button
            onClick={() => { setDraft({ mode: "new" }); setSidebarOpen(false); }}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 px-4 py-3.5 font-semibold text-white shadow-md shadow-brand-600/20 hover:bg-brand-500"
          >
            <PenSquare className="h-5 w-5" /> {t("inbox.compose")}
          </button>
          <nav className="mt-5 space-y-1">
            {Object.entries(FOLDER_ICONS).map(([id, Icon]) => (
              <button
                key={id}
                onClick={() => switchFolder(id)}
                aria-current={folder === id ? "page" : undefined}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  folder === id ? "bg-brand-100 text-brand-800" : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="flex-1 text-start">{t(`inbox.folders.${id}`)}</span>
                {id === "inbox" && unread > 0 && <span className="text-xs font-bold">{unread}</span>}
              </button>
            ))}
          </nav>

          <div className="mt-6 space-y-3">
            {permission === "default" && (
              <button onClick={enableNotifications} className="flex w-full items-start gap-2.5 rounded-xl border border-slate-200 bg-surface p-3 text-start hover:bg-slate-50">
                <Bell className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                <span>
                  <span className="block text-sm font-semibold text-slate-800">{t("inbox.notifyOn")}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{t("inbox.notifyOnHint")}</span>
                </span>
              </button>
            )}
            {permission === "granted" && (
              <p className="flex items-center gap-2 px-1 text-xs font-medium text-emerald-700">
                <BellRing className="h-4 w-4" /> {t("inbox.notifyEnabled")}
              </p>
            )}
            {permission === "denied" && (
              <p className="flex items-start gap-2 px-1 text-xs leading-relaxed text-slate-500">
                <BellOff className="mt-0.5 h-4 w-4 shrink-0" /> {t("inbox.notifyBlocked")}
              </p>
            )}
            <p className="rounded-xl bg-emerald-50 p-3 text-xs leading-relaxed text-emerald-800">
              {t("inbox.freePlan", { price: <strong>{t("preview.free").split(",")[0]}</strong> })}
            </p>
            {DEMO_MODE && (
              <p className="rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
                <strong>{t("inbox.demoTitle")}</strong> {t("inbox.demoText")}
              </p>
            )}
          </div>
          <Preferences className="mt-auto pt-6 sm:hidden" />
        </aside>

        {/* List */}
        <section className={`min-w-0 flex-1 overflow-y-auto border-slate-200 bg-surface lg:max-w-md lg:border-e ${open ? "hidden lg:block" : ""}`}>
          <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-slate-100 bg-surface/95 px-5 py-3 backdrop-blur">
            <h1 dir="auto" className="truncate text-lg font-bold text-slate-900">{query ? t("inbox.resultsFor", { q: query }) : folderLabel}</h1>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-xs text-slate-500">{visible.length === 1 ? t("inbox.countOne") : t("inbox.countMany", { n: visible.length })}</span>
              <button onClick={() => refresh(true)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label={t("inbox.checkNew")} title={t("inbox.checkNew")}>
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>
          {loadError && (
            <p role="alert" className="mx-5 mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{loadError}</p>
          )}
          {loading ? (
            <div className="grid place-items-center py-20 text-slate-400">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : visible.length === 0 ? (
            <div className="px-6 py-20 text-center">
              <InboxIcon className="mx-auto h-10 w-10 text-slate-300" />
              <p className="mt-3 font-semibold text-slate-700">{query ? t("inbox.emptySearch") : t("inbox.emptyFolder", { folder: folderLabel })}</p>
              {folder === "sent" && !query && <p className="mt-1 text-sm text-slate-500">{t("inbox.sentHint")}</p>}
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {visible.map((m) => {
                const who = m.folder === "sent" ? t("inbox.toPrefix", { to: m.to }) : m.from.name || m.from.email;
                return (
                  <li key={m.id} className="relative">
                    <button
                      type="button"
                      onClick={() => openMessage(m)}
                      className={`flex w-full gap-3 py-4 ps-5 pe-12 text-start transition hover:bg-slate-50 focus:outline-none focus-visible:bg-brand-50 ${
                        openId === m.id ? "bg-brand-50" : !m.read ? "bg-brand-50/40" : ""
                      }`}
                    >
                      {m.folder === "sent"
                        ? <SenderAvatar name={m.to} email={m.to.split(/[,;\s]+/)[0]} />
                        : <SenderAvatar name={m.from.name || m.from.email} email={m.from.email} />}
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span dir="auto" className={`truncate text-sm ${m.read ? "font-medium text-slate-700" : "font-bold text-slate-900"}`}>{who}</span>
                          <span className={`shrink-0 text-xs ${m.read ? "text-slate-500" : "font-semibold text-brand-700"}`}>{shortDate(m.date)}</span>
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span dir="auto" className={`truncate text-sm ${m.read ? "text-slate-700" : "font-semibold text-slate-900"}`}>{m.subject}</span>
                          {m.attachments?.length > 0 && <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-label={t("inbox.hasAttachments")} />}
                        </span>
                        <span dir="auto" className="block truncate text-sm text-slate-500">{m.body.replace(/\n+/g, " ")}</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => update(m.id, { starred: !m.starred })}
                      className="absolute end-4 top-4 rounded p-1 text-slate-300 hover:text-amber-400"
                      aria-label={m.starred ? t("inbox.unstar") : t("inbox.star")}
                      aria-pressed={m.starred}
                    >
                      <Star className={`h-4 w-4 ${m.starred ? "fill-amber-400 text-amber-400" : ""}`} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Reading pane */}
        <section className={`min-w-0 flex-1 overflow-y-auto bg-surface ${open ? "block" : "hidden lg:block"}`}>
          {open ? (
            <article className="mx-auto max-w-3xl px-5 py-6 sm:px-8">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button onClick={() => setOpenId(null)} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 lg:hidden">
                  <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {t("inbox.back")}
                </button>
                <div className="ms-auto flex gap-1">
                  <button onClick={() => update(open.id, { starred: !open.starred })} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label={open.starred ? t("inbox.unstar") : t("inbox.star")} aria-pressed={open.starred}>
                    <Star className={`h-5 w-5 ${open.starred ? "fill-amber-400 text-amber-400" : ""}`} />
                  </button>
                  <button onClick={() => deleteMessage(open)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-rose-600" aria-label={t("inbox.delete")} title={t("inbox.delete")}>
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
              </div>
              <h2 dir="auto" className="mt-4 text-2xl font-bold tracking-tight text-slate-900">{open.subject}</h2>
              <div className="mt-5 flex items-center gap-3">
                <SenderAvatar name={open.from.name || open.from.email} email={open.from.email} size={44} />
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">
                    <bdi>{open.from.name}</bdi> <bdi dir="ltr" className="font-normal text-slate-500">&lt;{open.from.email}&gt;</bdi>
                  </p>
                  <p className="truncate text-sm text-slate-500">
                    {t("inbox.toLine", { to: open.to === email ? t("inbox.me") : <bdi dir="ltr">{open.to}</bdi> })} · {longDate(open.date)}
                  </p>
                </div>
              </div>
              <div dir="auto" className="mt-6 whitespace-pre-wrap break-words leading-relaxed text-slate-800 [unicode-bidi:plaintext]"><LinkifiedText text={open.body} /></div>
              <AttachmentList attachments={open.attachments} onError={setToast} />

              <div className="mt-8 flex flex-wrap gap-2 border-t border-slate-200 pt-5">
                {[
                  { kind: "reply", icon: Reply, label: t("inbox.reply") },
                  { kind: "replyAll", icon: ReplyAll, label: t("inbox.replyAll") },
                  { kind: "forward", icon: Forward, label: t("inbox.forward") },
                ].map(({ kind, icon: Icon, label }) => (
                  <button
                    key={kind}
                    onClick={() => setDraft(buildDraft(kind, open, email, t, longDate))}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Icon className="h-4 w-4 rtl:-scale-x-100" /> {label}
                  </button>
                ))}
              </div>
            </article>
          ) : (
            <div className="grid h-full place-items-center px-6 text-center">
              <div>
                <Mail className="mx-auto h-12 w-12 text-slate-300" />
                <p className="mt-3 font-semibold text-slate-700">{t("inbox.select")}</p>
                <p className="mt-1 text-sm text-slate-500">{t("inbox.signedInAs", { email: <bdi dir="ltr">{email}</bdi> })}</p>
              </div>
            </div>
          )}
        </section>
      </div>

      {draft && <Compose key={JSON.stringify([draft.mode, draft.subject])} from={email} initial={draft} onClose={() => setDraft(null)} onSend={send} />}

      {toast && (
        <div role="status" className="fixed bottom-6 left-1/2 z-50 max-w-[90vw] -translate-x-1/2 rounded-xl bg-ink px-5 py-3 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
