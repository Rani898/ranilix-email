import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Inbox as InboxIcon,
  Loader2,
  LogOut,
  Mail,
  Menu,
  PenSquare,
  RefreshCw,
  Search,
  Send,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { BRAND, DEMO_MODE } from "../config.js";
import { endSession, getSession } from "../lib/session.js";
import { AuthError, deleteMessage as apiDelete, listMessages, logOut, sendMessage, updateMessage } from "../lib/api.js";

const REFRESH_MS = 30_000;

const FOLDERS = [
  { id: "inbox", label: "Inbox", icon: InboxIcon },
  { id: "starred", label: "Starred", icon: Star },
  { id: "sent", label: "Sent", icon: Send },
  { id: "trash", label: "Trash", icon: Trash2 },
];

const AVATAR_COLORS = ["bg-brand-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500", "bg-violet-500", "bg-sky-500"];
const colorFor = (s) => AVATAR_COLORS[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length];

function formatDate(ts, long = false) {
  const d = new Date(ts);
  const now = new Date();
  if (long) return d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function Avatar({ name, size = "h-10 w-10 text-sm" }) {
  return (
    <span className={`grid shrink-0 place-items-center rounded-full font-bold text-white ${size} ${colorFor(name)}`}>
      {name.trim()[0]?.toUpperCase() || "?"}
    </span>
  );
}

/* ---------- Compose ---------- */

function Compose({ from, onClose, onSend }) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const recipients = to.toLowerCase().split(/[,\s]+/).filter(Boolean);
    if (!recipients.length) return setError("Add at least one recipient.");
    const bad = recipients.find((r) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r));
    if (bad) return setError(`"${bad}" doesn't look like an email address.`);
    setSending(true);
    setError("");
    try {
      await onSend({ to: recipients.join(", "), subject: subject.trim() || "(no subject)", body });
    } catch (err) {
      setError(err.message);
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="flex h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:h-auto sm:max-h-[90vh] sm:rounded-2xl"
      >
        <div className="flex items-center justify-between bg-slate-900 px-5 py-3 text-white">
          <h2 className="font-semibold">New message</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-white/10" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="border-b border-slate-200 px-5 py-2.5 text-sm text-slate-500">
          From <span className="font-medium text-slate-800">{from}</span>
        </div>
        <label className="flex items-center gap-3 border-b border-slate-200 px-5">
          <span className="text-sm text-slate-500">To</span>
          <input
            id="compose-to"
            value={to}
            onChange={(e) => { setTo(e.target.value); setError(""); }}
            autoFocus
            placeholder="name@example.com"
            className="w-full py-3 text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
        </label>
        <input
          id="compose-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject"
          className="border-b border-slate-200 px-5 py-3 font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none"
        />
        <textarea
          id="compose-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write your message…"
          className="min-h-[14rem] flex-1 resize-none px-5 py-4 leading-relaxed text-slate-800 placeholder:text-slate-400 focus:outline-none"
        />
        {error && <p role="alert" className="px-5 pb-2 text-sm text-rose-600">{error}</p>}
        <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3">
          <button type="submit" disabled={sending} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 font-semibold text-white hover:bg-brand-700 disabled:opacity-70">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {sending ? "Sending…" : "Send"}
          </button>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Discard">
            <Trash2 className="h-5 w-5" />
          </button>
        </div>
      </form>
    </div>
  );
}

/* ---------- Page ---------- */

export default function Inbox() {
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
  const [composing, setComposing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast] = useState("");

  const handleError = useCallback((err) => {
    if (err instanceof AuthError) { endSession(); navigate("/login", { replace: true }); return; }
    setToast(err.message);
  }, [navigate]);

  const refresh = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      setMessages(await listMessages());
      setLoadError("");
    } catch (err) {
      if (err instanceof AuthError) return handleError(err);
      setLoadError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [handleError]);

  useEffect(() => {
    if (!email) return;
    refresh();
    const t = setInterval(() => { if (document.visibilityState === "visible") refresh(); }, REFRESH_MS);
    return () => clearInterval(t);
  }, [email, refresh]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const counts = useMemo(() => ({
    inbox: messages.filter((m) => m.folder === "inbox" && !m.read).length,
  }), [messages]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return messages
      .filter((m) => (folder === "starred" ? m.starred && m.folder !== "trash" : m.folder === folder))
      .filter((m) => !q || [m.subject, m.body, m.from.name, m.from.email, m.to].join(" ").toLowerCase().includes(q))
      .sort((a, b) => b.date - a.date);
  }, [messages, folder, query]);

  if (!email) return <Navigate to="/login" replace />;

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
      apiDelete(m.id).then(() => setToast("Message deleted forever")).catch((err) => { handleError(err); refresh(); });
    } else {
      update(m.id, { folder: "trash" });
      setToast("Moved to Trash");
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
    setComposing(false);
    setToast("Message sent");
    refresh();
  };

  const logout = async () => { await logOut(); endSession(); navigate("/"); };

  const folderLabel = FOLDERS.find((f) => f.id === folder)?.label;

  return (
    <div className="flex h-dvh flex-col bg-slate-50">
      {/* Top bar */}
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-3 sm:px-5">
        <button onClick={() => setSidebarOpen(true)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" aria-label="Open folders">
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2 lg:w-56">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white">
            <Mail className="h-5 w-5" />
          </span>
          <span className="hidden text-lg font-extrabold tracking-tight text-slate-900 sm:block">{BRAND.short}</span>
        </div>
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-slate-100 px-3 focus-within:bg-white focus-within:ring-2 focus-within:ring-brand-200">
          <Search className="h-4 w-4 shrink-0 text-slate-500" />
          <input
            id="mail-search"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpenId(null); }}
            placeholder="Search mail"
            className="w-full min-w-0 bg-transparent py-2.5 text-sm focus:outline-none"
          />
        </label>
        <div className="flex items-center gap-2">
          <span className="hidden max-w-[14rem] truncate text-sm font-medium text-slate-600 md:block">{email}</span>
          <Avatar name={email} size="h-9 w-9 text-sm" />
          <button onClick={logout} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label="Log out" title="Log out">
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Sidebar */}
        {sidebarOpen && <div className="fixed inset-0 z-30 bg-slate-900/30 lg:hidden" onClick={() => setSidebarOpen(false)} />}
        <aside
          className={`fixed inset-y-0 left-0 z-40 w-64 bg-white p-4 transition-transform lg:static lg:z-auto lg:w-60 lg:translate-x-0 lg:bg-transparent lg:shadow-none ${
            sidebarOpen ? "translate-x-0 shadow-xl" : "-translate-x-full"
          }`}
        >
          <button
            onClick={() => { setComposing(true); setSidebarOpen(false); }}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 px-4 py-3.5 font-semibold text-white shadow-md shadow-brand-600/20 hover:bg-brand-700"
          >
            <PenSquare className="h-5 w-5" /> Compose
          </button>
          <nav className="mt-5 space-y-1">
            {FOLDERS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => switchFolder(id)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  folder === id ? "bg-brand-100 text-brand-800" : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="flex-1 text-left">{label}</span>
                {id === "inbox" && counts.inbox > 0 && <span className="text-xs font-bold">{counts.inbox}</span>}
              </button>
            ))}
          </nav>
          <p className="mt-8 rounded-xl bg-emerald-50 p-3 text-xs leading-relaxed text-emerald-800">
            Free forever. Your plan costs <strong>$0</strong>.
          </p>
          {DEMO_MODE && (
            <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
              <strong>Preview mode.</strong> Real email isn't connected yet, so messages stay in this browser.
            </p>
          )}
        </aside>

        {/* List */}
        <section className={`min-w-0 flex-1 overflow-y-auto border-slate-200 bg-white lg:max-w-md lg:border-r ${open ? "hidden lg:block" : ""}`}>
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/95 px-5 py-3 backdrop-blur">
            <h1 className="truncate text-lg font-bold text-slate-900">{query ? `Results for "${query}"` : folderLabel}</h1>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-xs text-slate-500">{visible.length} {visible.length === 1 ? "message" : "messages"}</span>
              <button onClick={() => refresh(true)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Check for new mail" title="Check for new mail">
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
              <p className="mt-3 font-semibold text-slate-700">{query ? "No messages match your search" : `Nothing in ${folderLabel} yet`}</p>
              {folder === "sent" && !query && <p className="mt-1 text-sm text-slate-500">Messages you send will show up here.</p>}
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {visible.map((m) => {
                const who = m.folder === "sent" ? `To: ${m.to}` : m.from.name;
                return (
                  <li key={m.id}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => openMessage(m)}
                      onKeyDown={(e) => e.key === "Enter" && openMessage(m)}
                      className={`flex cursor-pointer gap-3 px-5 py-4 transition hover:bg-slate-50 focus:outline-none focus-visible:bg-brand-50 ${
                        openId === m.id ? "bg-brand-50" : !m.read ? "bg-brand-50/40" : ""
                      }`}
                    >
                      <Avatar name={m.folder === "sent" ? m.to : m.from.name} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className={`truncate text-sm ${m.read ? "font-medium text-slate-700" : "font-bold text-slate-900"}`}>{who}</p>
                          <span className={`shrink-0 text-xs ${m.read ? "text-slate-400" : "font-semibold text-brand-700"}`}>{formatDate(m.date)}</span>
                        </div>
                        <p className={`truncate text-sm ${m.read ? "text-slate-700" : "font-semibold text-slate-900"}`}>{m.subject}</p>
                        <p className="truncate text-sm text-slate-500">{m.body.replace(/\n+/g, " ")}</p>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); update(m.id, { starred: !m.starred }); }}
                        className="self-start rounded p-1 text-slate-300 hover:text-amber-400"
                        aria-label={m.starred ? "Unstar" : "Star"}
                      >
                        <Star className={`h-4 w-4 ${m.starred ? "fill-amber-400 text-amber-400" : ""}`} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Reading pane */}
        <section className={`min-w-0 flex-1 overflow-y-auto bg-white ${open ? "block" : "hidden lg:block"}`}>
          {open ? (
            <article className="mx-auto max-w-3xl px-5 py-6 sm:px-8">
              <div className="flex items-center justify-between gap-2">
                <button onClick={() => setOpenId(null)} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 lg:hidden">
                  <ArrowLeft className="h-4 w-4" /> Back
                </button>
                <div className="ml-auto flex gap-1">
                  <button onClick={() => update(open.id, { starred: !open.starred })} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Star">
                    <Star className={`h-5 w-5 ${open.starred ? "fill-amber-400 text-amber-400" : ""}`} />
                  </button>
                  <button onClick={() => deleteMessage(open)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-rose-600" aria-label="Delete">
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
              </div>
              <h2 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">{open.subject}</h2>
              <div className="mt-5 flex items-center gap-3">
                <Avatar name={open.from.name} size="h-11 w-11 text-base" />
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">
                    {open.from.name} <span className="font-normal text-slate-500">&lt;{open.from.email}&gt;</span>
                  </p>
                  <p className="truncate text-sm text-slate-500">to {open.to === email ? "me" : open.to} · {formatDate(open.date, true)}</p>
                </div>
              </div>
              <div className="mt-6 whitespace-pre-wrap break-words leading-relaxed text-slate-800">{open.body}</div>
            </article>
          ) : (
            <div className="grid h-full place-items-center px-6 text-center">
              <div>
                <Mail className="mx-auto h-12 w-12 text-slate-300" />
                <p className="mt-3 font-semibold text-slate-700">Select a message to read it</p>
                <p className="mt-1 text-sm text-slate-500">Signed in as {email}</p>
              </div>
            </div>
          )}
        </section>
      </div>

      {composing && <Compose from={email} onClose={() => setComposing(false)} onSend={send} />}

      {toast && (
        <div role="status" className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
