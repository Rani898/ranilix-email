import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, BookOpen, Bot, CheckCircle2, ChevronLeft, Home, Loader2, MessageCircle, MessagesSquare,
  Search, SendHorizonal, ThumbsDown, ThumbsUp, X,
} from "lucide-react";
import LogoMark from "./LogoMark.jsx";
import { useErrorText, useI18n } from "../lib/i18n.jsx";
import { getSession, useSessionVersion } from "../lib/session.js";
import { supportInfo, supportRate, supportSend, supportStart, supportThread, supportThreads } from "../lib/api.js";

/** Other parts of the site open the help window with openSupport() (optionally on a tab). */
export const openSupport = (tab = "home") => window.dispatchEvent(new CustomEvent("ranilix:support", { detail: { tab } }));

const TEASED = "ranilix.support.teased";
const TOPICS = ["account", "mail", "bug", "idea", "other"];

function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } }
const hasSupportKey = () => !!safeGet("ranilix.support.key");

function useTimeFormat() {
  const { lang, t } = useI18n();
  return useCallback((ts) => {
    const d = new Date(ts);
    const now = new Date();
    const locale = lang === "he" ? "he-IL" : "en-US";
    if (Date.now() - ts < 60_000) return t("support.justNow");
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString(locale, { day: "numeric", month: "short" });
  }, [lang, t]);
}

/** Help articles matching a search, best first (title words count more than body words). */
function searchArticles(articles, q, minScore = 1) {
  const words = q.toLowerCase().split(/[\s,.?!]+/).filter((w) => w.length > 1);
  if (!words.length) return articles;
  return articles
    .map((a) => {
      const title = a.title.toLowerCase();
      const rest = `${a.tags} ${a.body}`.toLowerCase();
      const score = words.reduce((s, w) => s + (title.includes(w) ? 3 : 0) + (rest.includes(w) ? 1 : 0), 0);
      return { a, score };
    })
    .filter((x) => x.score >= minScore)
    .sort((x, y) => y.score - x.score)
    .map((x) => x.a);
}

function TeamAvatar({ size = 32, className = "" }) {
  return (
    <span className={`grid shrink-0 place-items-center rounded-full bg-brand-600 ${className}`} style={{ width: size, height: size }} aria-hidden="true">
      <LogoMark size={size * 0.62} color="#2547EA" />
    </span>
  );
}

function StatusDot({ online }) {
  return <span className={`inline-block h-2 w-2 rounded-full ${online ? "bg-emerald-400" : "bg-amber-400"}`} aria-hidden="true" />;
}

function ScreenHeader({ title, subtitle, onBack, onClose, children }) {
  const { t } = useI18n();
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 px-3 py-3">
      {onBack && (
        <button type="button" onClick={onBack} className="grid h-9 w-9 place-items-center rounded-full text-slate-600 hover:bg-slate-100" aria-label={t("support.back")}>
          <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
        </button>
      )}
      {children}
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold text-slate-900">{title}</p>
        {subtitle && <p className="truncate text-xs text-slate-500">{subtitle}</p>}
      </div>
      <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full text-slate-600 hover:bg-slate-100" aria-label={t("support.close")}>
        <X className="h-5 w-5" />
      </button>
    </div>
  );
}

function ArticleRow({ article, onOpen }) {
  return (
    <button type="button" onClick={() => onOpen(article.id)} className="flex w-full items-center justify-between gap-3 px-1 py-3 text-start text-sm text-slate-700 hover:text-brand-700">
      <span className="min-w-0">{article.title}</span>
      <ChevronLeft className="h-4 w-4 shrink-0 text-slate-400 ltr:rotate-180" aria-hidden="true" />
    </button>
  );
}

/* ---------------- Home ---------------- */
function HomeTab({ name, online, serverOk, threads, articles, onClose, onNew, onOpenThread, onSeeAll, onOpenArticle, onSearch }) {
  const { t } = useI18n();
  const fmt = useTimeFormat();
  const [q, setQ] = useState("");
  const latest = threads[0];
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="relative bg-ink px-6 pb-20 pt-5 text-white">
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          <div className="absolute -top-24 end-[-60px] h-64 w-64 rounded-full bg-brand-600/50 blur-3xl" />
          <div className="absolute -bottom-24 start-[-40px] h-48 w-48 rounded-full bg-sky-500/25 blur-3xl" />
        </div>
        <div className="relative flex items-center justify-between">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white shadow-sm"><LogoMark size={30} /></span>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/90">
              <StatusDot online={online} /> {online ? t("support.online") : t("support.away")}
            </span>
            <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full text-white/80 hover:bg-white/10" aria-label={t("support.close")}>
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        <p className="relative mt-8 text-2xl font-bold text-white/60">{name ? t("support.hello", { name }) : t("support.helloGuest")}</p>
        <p className="relative text-2xl font-extrabold leading-tight">{t("support.howHelp")}</p>
      </div>

      <div className="relative -mt-14 space-y-3 px-4 pb-4">
        <button type="button" onClick={onNew} className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-surface p-4 text-start shadow-sm transition hover:border-brand-300">
          <div className="min-w-0 flex-1">
            <p className="font-bold text-slate-900">{t("support.askTitle")}</p>
            <p className="text-sm text-slate-500">{online ? t("support.askOnline") : t("support.askAway")}</p>
          </div>
          <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-600 text-white"><SendHorizonal className="h-4.5 w-4.5 rtl:rotate-180" /></span>
        </button>

        {latest && (
          <div className="rounded-2xl border border-slate-200 bg-surface p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-slate-900">{t("support.recent")}</p>
              <button type="button" onClick={onSeeAll} className="text-xs font-semibold text-brand-700 hover:underline">{t("support.seeAll")}</button>
            </div>
            <button type="button" onClick={() => onOpenThread(latest.id)} className="mt-3 flex w-full items-center gap-3 text-start">
              <TeamAvatar size={40} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-slate-900">{t("support.team")}</p>
                  <span className="shrink-0 text-xs text-slate-400">{fmt(latest.updatedAt)}</span>
                </div>
                <p dir="auto" className={`truncate text-sm ${latest.unread ? "font-semibold text-slate-900" : "text-slate-500"}`}>{latest.lastPreview}</p>
              </div>
              {latest.unread > 0 && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-rose-500" aria-label={t("support.unreadLabel", { n: latest.unread })} />}
            </button>
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 bg-surface p-4 shadow-sm">
          <form onSubmit={(e) => { e.preventDefault(); onSearch(q); }}>
            <label className="flex items-center gap-2 rounded-xl bg-slate-100 px-3">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("support.searchTitle")} aria-label={t("support.searchTitle")}
                className="w-full bg-transparent py-2.5 text-sm font-semibold text-slate-900 placeholder:text-slate-600 focus:outline-none" />
              <button type="submit" aria-label={t("support.searchTitle")}><Search className="h-4.5 w-4.5 text-slate-600" /></button>
            </label>
          </form>
          <div className="mt-1 divide-y divide-slate-100">
            {articles.slice(0, 4).map((a) => <ArticleRow key={a.id} article={a} onOpen={onOpenArticle} />)}
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-surface px-4 py-3 shadow-sm">
          {serverOk === false
            ? <span className="h-2.5 w-2.5 rounded-full bg-amber-400" aria-hidden="true" />
            : <CheckCircle2 className="h-5 w-5 text-emerald-500" aria-hidden="true" />}
          <p className="text-sm font-medium text-slate-700">{serverOk === false ? t("support.statusBad") : t("support.statusOk")}</p>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Messages list ---------------- */
function MessagesTab({ threads, loading, onClose, onNew, onOpenThread }) {
  const { t } = useI18n();
  const fmt = useTimeFormat();
  return (
    <>
      <ScreenHeader title={t("support.messagesTitle")} onClose={onClose} />
      <div className="flex-1 overflow-y-auto">
        {loading && !threads.length ? (
          <div className="grid h-40 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
        ) : threads.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-8 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-600"><MessagesSquare className="h-7 w-7" /></span>
            <p className="mt-4 font-bold text-slate-900">{t("support.noMessages")}</p>
            <p className="mt-1 text-sm text-slate-500">{t("support.noMessagesText")}</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {threads.map((th) => (
              <li key={th.id}>
                <button type="button" onClick={() => onOpenThread(th.id)} className="flex w-full items-center gap-3 px-4 py-3.5 text-start hover:bg-slate-50">
                  <TeamAvatar size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-900">
                        <span className="truncate">{th.topic ? t(`support.topics.${th.topic}`) : t("support.team")}</span>
                        {th.status === "closed" && <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{t("support.closedChip")}</span>}
                      </p>
                      <span className="shrink-0 text-xs text-slate-400">{fmt(th.updatedAt)}</span>
                    </div>
                    <p dir="auto" className={`truncate text-sm ${th.unread ? "font-semibold text-slate-900" : "text-slate-500"}`}>
                      {th.lastFrom === "user" && <span className="text-slate-400">{t("support.you")}: </span>}{th.lastPreview}
                    </p>
                  </div>
                  {th.unread > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white">{th.unread}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="shrink-0 p-4">
        <button type="button" onClick={onNew} className="mx-auto flex items-center gap-2 rounded-full bg-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-600/25 hover:bg-brand-500">
          {t("support.newMessage")} <SendHorizonal className="h-4 w-4 rtl:rotate-180" />
        </button>
      </div>
    </>
  );
}

/* ---------------- Chat bits ---------------- */
function Bubble({ m }) {
  const { t } = useI18n();
  const fmt = useTimeFormat();
  const mine = m.sender === "user";
  if (mine) {
    return (
      <div className="flex flex-col items-end">
        <div dir="auto" className="max-w-[82%] whitespace-pre-wrap break-words rounded-2xl rounded-ee-md bg-brand-600 px-3.5 py-2.5 text-sm text-white [unicode-bidi:plaintext]">{m.body}</div>
        <span className="mt-1 text-[11px] text-slate-400">{fmt(m.createdAt)}</span>
      </div>
    );
  }
  const isBot = m.sender === "bot";
  return (
    <div className="flex items-end gap-2">
      {isBot
        ? <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-200 text-slate-600" aria-hidden="true"><Bot className="h-4 w-4" /></span>
        : <TeamAvatar size={28} />}
      <div className="flex max-w-[82%] flex-col items-start">
        <div dir="auto" className={`whitespace-pre-wrap break-words rounded-2xl rounded-es-md px-3.5 py-2.5 text-sm [unicode-bidi:plaintext] ${isBot ? "bg-slate-100 text-slate-700" : "bg-slate-100 text-slate-900"}`}>{m.body}</div>
        <span className="mt-1 text-[11px] text-slate-400">{isBot ? t("support.auto") : t("support.team")} · {fmt(m.createdAt)}</span>
      </div>
    </div>
  );
}

function Composer({ onSend, autoFocus, disabled, onTextChange }) {
  const { t } = useI18n();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [text]);
  const submit = async () => {
    const v = text.trim();
    if (!v || busy || disabled) return;
    setBusy(true);
    const ok = await onSend(v);
    setBusy(false);
    if (ok) { setText(""); onTextChange?.(""); }
    ref.current?.focus();
  };
  return (
    <div className="shrink-0 border-t border-slate-200 p-3">
      <div className="flex items-end gap-2 rounded-2xl border border-slate-300 bg-surface px-3 py-1.5 focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-100">
        <textarea ref={ref} rows={1} value={text} autoFocus={autoFocus} maxLength={2000} dir="auto"
          onChange={(e) => { setText(e.target.value); onTextChange?.(e.target.value); }}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } }}
          placeholder={t("support.messagePlaceholder")} aria-label={t("support.messagePlaceholder")}
          className="max-h-36 flex-1 resize-none bg-transparent py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none" />
        <button type="button" onClick={submit} disabled={!text.trim() || busy || disabled} aria-label={t("support.send")}
          className="mb-1 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-600 text-white transition hover:bg-brand-500 disabled:opacity-40">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizonal className="h-4 w-4 rtl:rotate-180" />}
        </button>
      </div>
      <p className="mt-1.5 hidden text-center text-[11px] text-slate-400 sm:block">{t("support.typingHint")}</p>
    </div>
  );
}

/* ---------------- One conversation ---------------- */
function ThreadScreen({ id, online, onBack, onClose, onChanged }) {
  const { t } = useI18n();
  const errorText = useErrorText();
  const [thread, setThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState("");
  const endRef = useRef(null);
  const lastId = useRef(0);

  const load = useCallback(async () => {
    try {
      const res = await supportThread(id);
      setThread(res.thread);
      setMessages(res.messages);
      lastId.current = Number(res.messages.at(-1)?.id || 0);
      setError("");
    } catch (e) { setError(errorText(e)); }
  }, [id, errorText]);

  useEffect(() => { load(); }, [load]);
  // Check for answers every few seconds while the conversation is open.
  useEffect(() => {
    const timer = setInterval(async () => {
      if (document.hidden) return;
      try {
        const res = await supportThread(id, lastId.current);
        setThread(res.thread);
        const fresh = res.messages.filter((m) => Number(m.id) > lastId.current);
        if (fresh.length) {
          setMessages((prev) => [...prev, ...fresh.filter((m) => !prev.some((p) => p.id === m.id))]);
          lastId.current = Number(fresh.at(-1).id);
          onChanged();
        }
      } catch { /* try again next time */ }
    }, 4000);
    return () => clearInterval(timer);
  }, [id, onChanged]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages.length, thread?.status]);

  const send = async (text) => {
    try {
      const res = await supportSend(id, text);
      setMessages((prev) => [...prev, ...res.messages.filter((m) => !prev.some((p) => p.id === m.id))]);
      lastId.current = Math.max(lastId.current, ...res.messages.map((m) => Number(m.id)));
      setThread((th) => (th ? { ...th, status: "open" } : th));
      setError("");
      onChanged();
      return true;
    } catch (e) { setError(errorText(e)); return false; }
  };
  const rate = async (r) => {
    try { await supportRate(id, r); setThread((th) => ({ ...th, rating: r })); } catch (e) { setError(errorText(e)); }
  };

  return (
    <>
      <ScreenHeader title={t("support.team")} subtitle={online ? t("support.online") : t("support.away")} onBack={onBack} onClose={onClose}>
        <TeamAvatar size={36} />
      </ScreenHeader>
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {!thread && !error && <div className="grid h-32 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>}
        {messages.map((m) => <Bubble key={m.id} m={m} />)}
        {thread?.status === "closed" && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center">
            <p className="text-sm text-slate-600">{t("support.closedNote")}</p>
            {thread.rating == null ? (
              <>
                <p className="mt-3 text-sm font-semibold text-slate-900">{t("support.rateQ")}</p>
                <div className="mt-2 flex justify-center gap-2">
                  <button type="button" onClick={() => rate(1)} className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-surface px-4 py-2 text-sm font-semibold text-slate-700 hover:border-emerald-400 hover:text-emerald-700"><ThumbsUp className="h-4 w-4" /> {t("support.rateGood")}</button>
                  <button type="button" onClick={() => rate(-1)} className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-surface px-4 py-2 text-sm font-semibold text-slate-700 hover:border-rose-400 hover:text-rose-700"><ThumbsDown className="h-4 w-4" /> {t("support.rateBad")}</button>
                </div>
              </>
            ) : <p className="mt-2 text-sm font-semibold text-slate-900">{t("support.rateThanks")}</p>}
          </div>
        )}
        {error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        <div ref={endRef} />
      </div>
      <Composer onSend={send} disabled={!thread} />
    </>
  );
}

/* ---------------- New conversation ---------------- */
function NewScreen({ articles, onBack, onClose, onCreated, onOpenArticle }) {
  const { t, lang } = useI18n();
  const errorText = useErrorText();
  const loggedIn = !!getSession();
  const [topic, setTopic] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const suggestions = useMemo(() => (draft.trim().length >= 4 ? searchArticles(articles, draft, 3).slice(0, 2) : []), [draft, articles]);

  const send = async (text) => {
    try {
      const res = await supportStart({ message: text, topic, name, email, page: window.location.pathname, lang });
      onCreated(res.thread.id);
      return true;
    } catch (e) { setError(errorText(e)); return false; }
  };

  return (
    <>
      <ScreenHeader title={t("support.newTitle")} onBack={onBack} onClose={onClose} />
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <div className="flex items-end gap-2">
          <TeamAvatar size={28} />
          <div className="max-w-[82%] rounded-2xl rounded-es-md bg-slate-100 px-3.5 py-2.5 text-sm text-slate-900">{t("support.newIntro")}</div>
        </div>
        <div className="flex flex-wrap gap-2 ps-9">
          {TOPICS.map((k) => (
            <button key={k} type="button" aria-pressed={topic === k} onClick={() => setTopic(topic === k ? "" : k)}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${topic === k ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 bg-surface text-slate-700 hover:border-brand-400"}`}>
              {t(`support.topics.${k}`)}
            </button>
          ))}
        </div>
        {!loggedIn && (
          <div className="space-y-3 rounded-2xl border border-slate-200 p-3">
            <div>
              <label htmlFor="sup-name" className="text-xs font-semibold text-slate-700">{t("support.nameLabel")}</label>
              <input id="sup-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} autoComplete="name"
                className="mt-1 w-full rounded-xl border border-slate-300 bg-surface px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100" />
            </div>
            <div>
              <label htmlFor="sup-email" className="text-xs font-semibold text-slate-700">{t("support.emailLabel")}</label>
              <input id="sup-email" type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email"
                className="mt-1 w-full rounded-xl border border-slate-300 bg-surface px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100 rtl:text-right" />
              <p className="mt-1 text-xs text-slate-500">{t("support.emailHint")}</p>
            </div>
          </div>
        )}
        {suggestions.length > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-bold text-amber-900">{t("support.maybeHelps")}</p>
            {suggestions.map((a) => (
              <button key={a.id} type="button" onClick={() => onOpenArticle(a.id)} className="mt-1.5 flex w-full items-center gap-2 text-start text-sm font-medium text-amber-900 hover:underline">
                <BookOpen className="h-4 w-4 shrink-0" /> {a.title}
              </button>
            ))}
          </div>
        )}
        {error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      </div>
      <Composer onSend={send} autoFocus onTextChange={setDraft} />
    </>
  );
}

/* ---------------- Help center ---------------- */
function HelpTab({ articles, initialQuery, onClose, onOpenArticle }) {
  const { t } = useI18n();
  const [q, setQ] = useState(initialQuery || "");
  const list = useMemo(() => searchArticles(articles, q), [articles, q]);
  return (
    <>
      <ScreenHeader title={t("support.helpTitle")} onClose={onClose} />
      <div className="shrink-0 px-4 pt-3">
        <label className="flex items-center gap-2 rounded-xl bg-slate-100 px-3">
          <Search className="h-4.5 w-4.5 text-slate-500" aria-hidden="true" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("support.helpSearch")} aria-label={t("support.helpSearch")} autoFocus
            className="w-full bg-transparent py-2.5 text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none" />
        </label>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {list.length === 0
          ? <p className="py-10 text-center text-sm text-slate-500">{t("support.noResults")}</p>
          : <div className="divide-y divide-slate-100">{list.map((a) => <ArticleRow key={a.id} article={a} onOpen={onOpenArticle} />)}</div>}
      </div>
    </>
  );
}

function ArticleScreen({ article, onBack, onClose, onContact }) {
  const { t } = useI18n();
  const [vote, setVote] = useState(null);
  return (
    <>
      <ScreenHeader title={t("support.helpTitle")} onBack={onBack} onClose={onClose} />
      <div className="flex-1 overflow-y-auto px-5 py-5">
        <h3 className="text-xl font-extrabold text-slate-900">{article.title}</h3>
        <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-slate-700">
          {article.body.split("\n\n").map((p, i) => <p key={i} className="whitespace-pre-line">{p}</p>)}
        </div>
        <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-center">
          {vote == null ? (
            <>
              <p className="text-sm font-semibold text-slate-900">{t("support.articleHelpful")}</p>
              <div className="mt-2 flex justify-center gap-2">
                <button type="button" onClick={() => setVote(1)} className="grid h-10 w-10 place-items-center rounded-full border border-slate-300 bg-surface text-slate-600 hover:text-emerald-600" aria-label={t("support.rateGood")}><ThumbsUp className="h-4.5 w-4.5" /></button>
                <button type="button" onClick={() => setVote(-1)} className="grid h-10 w-10 place-items-center rounded-full border border-slate-300 bg-surface text-slate-600 hover:text-rose-600" aria-label={t("support.rateBad")}><ThumbsDown className="h-4.5 w-4.5" /></button>
              </div>
            </>
          ) : <p className="text-sm font-semibold text-slate-900">{t("support.articleThanks")}</p>}
        </div>
        <div className="mt-4 rounded-2xl border border-slate-200 p-4 text-center">
          <p className="text-sm text-slate-600">{t("support.stillNeed")}</p>
          <button type="button" onClick={onContact} className="mt-2 inline-flex items-center gap-2 rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500">
            <MessageCircle className="h-4 w-4" /> {t("support.contactUs")}
          </button>
        </div>
      </div>
    </>
  );
}

/* ---------------- The widget ---------------- */
export default function SupportWidget() {
  const { t } = useI18n();
  useSessionVersion();
  const session = getSession();
  const name = session?.email ? session.email.split("@")[0] : "";
  const articles = t("support.articles");
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("home");
  const [screen, setScreen] = useState(null); // { type: "thread" | "new" | "article", id }
  const [helpQuery, setHelpQuery] = useState("");
  const [threads, setThreads] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [online, setOnline] = useState(false);
  const [serverOk, setServerOk] = useState(null);
  const [teaser, setTeaser] = useState(false);
  const panelRef = useRef(null);

  const refresh = useCallback(async () => {
    if (!getSession() && !hasSupportKey()) { setThreads([]); setUnread(0); return; }
    setLoading(true);
    try {
      const res = await supportThreads();
      setThreads(res.threads);
      setUnread(res.unread);
    } catch { /* keep what we have */ }
    setLoading(false);
  }, []);

  // Unread badge: check now, then every minute (only when there's something to check).
  useEffect(() => {
    refresh();
    const timer = setInterval(() => { if (!document.hidden) refresh(); }, open ? 10_000 : 60_000);
    return () => clearInterval(timer);
  }, [refresh, open, session?.email]);

  useEffect(() => {
    if (!open) return;
    supportInfo().then((r) => { setOnline(!!r.online); setServerOk(true); }).catch(() => setServerOk(false));
  }, [open]);

  // Let the rest of the site open the window (menu item, footer link…).
  useEffect(() => {
    const onOpen = (e) => { setOpen(true); setTeaser(false); setScreen(null); setTab(e.detail?.tab || "home"); };
    window.addEventListener("ranilix:support", onOpen);
    return () => window.removeEventListener("ranilix:support", onOpen);
  }, []);

  // A small hello bubble, once per browser, for visitors on the home page.
  useEffect(() => {
    if (safeGet(TEASED) || window.location.pathname.replace(import.meta.env.BASE_URL || "/", "/") !== "/") return;
    const timer = setTimeout(() => { setTeaser(true); safeSet(TEASED, "1"); }, 9000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const close = () => setOpen(false);
  const goTab = (id) => { setScreen(null); setTab(id); if (id === "messages") refresh(); };
  const openThread = (id) => setScreen({ type: "thread", id });
  const openArticle = (id) => setScreen({ type: "article", id, from: screen });
  const article = screen?.type === "article" ? articles.find((a) => a.id === screen.id) : null;

  let body;
  if (screen?.type === "thread") {
    body = <ThreadScreen key={screen.id} id={screen.id} online={online} onBack={() => { setScreen(null); refresh(); }} onClose={close} onChanged={refresh} />;
  } else if (screen?.type === "new") {
    body = <NewScreen articles={articles} onBack={() => setScreen(null)} onClose={close} onOpenArticle={openArticle}
      onCreated={(id) => { setTab("messages"); setScreen({ type: "thread", id }); refresh(); }} />;
  } else if (article) {
    body = <ArticleScreen article={article} onBack={() => setScreen(screen.from || null)} onClose={close} onContact={() => setScreen({ type: "new" })} />;
  } else if (tab === "messages") {
    body = <MessagesTab threads={threads} loading={loading} onClose={close} onNew={() => setScreen({ type: "new" })} onOpenThread={openThread} />;
  } else if (tab === "help") {
    body = <HelpTab key={helpQuery} articles={articles} initialQuery={helpQuery} onClose={close} onOpenArticle={openArticle} />;
  } else {
    body = <HomeTab name={name} online={online} serverOk={serverOk} threads={threads} articles={articles} onClose={close}
      onNew={() => setScreen({ type: "new" })} onOpenThread={openThread} onSeeAll={() => goTab("messages")} onOpenArticle={openArticle}
      onSearch={(q) => { setHelpQuery(q); goTab("help"); }} />;
  }
  const showNav = !screen || screen.type === "article";

  return (
    <>
      {open && (
        <div ref={panelRef} role="dialog" aria-modal="false" aria-label={t("support.launcher")}
          className="fixed inset-0 z-[47] flex flex-col overflow-hidden bg-surface shadow-2xl sm:inset-auto sm:bottom-24 sm:right-5 sm:h-[min(680px,calc(100dvh-8rem))] sm:w-[390px] sm:rounded-3xl sm:border sm:border-slate-200 animate-[supportIn_.18s_ease-out]">
          <div className="flex min-h-0 flex-1 flex-col">{body}</div>
          {showNav && (
            <nav className="grid shrink-0 grid-cols-3 border-t border-slate-200 bg-surface" aria-label={t("support.launcher")}>
              {[["home", Home], ["messages", MessageCircle], ["help", BookOpen]].map(([id, Icon]) => {
                const active = tab === id && !screen;
                return (
                  <button key={id} type="button" onClick={() => goTab(id)} aria-current={active ? "page" : undefined}
                    className={`relative flex flex-col items-center gap-1 py-2.5 text-xs font-semibold ${active ? "text-slate-900" : "text-slate-500 hover:text-slate-800"}`}>
                    <span className={`grid h-8 w-8 place-items-center rounded-xl ${active ? "bg-ink text-white" : ""}`}><Icon className="h-4.5 w-4.5" /></span>
                    {t(`support.tabs.${id}`)}
                    {id === "messages" && unread > 0 && <span className="absolute top-1.5 start-1/2 ms-2 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">{unread}</span>}
                  </button>
                );
              })}
            </nav>
          )}
        </div>
      )}

      {teaser && !open && (
        <div className="fixed bottom-24 right-5 z-[45] flex max-w-[260px] items-start gap-2 rounded-2xl border border-slate-200 bg-surface p-3 shadow-xl animate-[supportIn_.2s_ease-out]">
          <TeamAvatar size={28} />
          <button type="button" onClick={() => { setTeaser(false); setOpen(true); }} className="text-start text-sm text-slate-800">{t("support.teaser")}</button>
          <button type="button" onClick={() => setTeaser(false)} className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-slate-100" aria-label={t("support.teaserClose")}><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      <button type="button" onClick={() => { setOpen((o) => !o); setTeaser(false); }}
        aria-label={open ? t("support.close") : t("support.launcher")} aria-expanded={open}
        className={`fixed bottom-5 right-5 z-[46] grid h-14 w-14 place-items-center rounded-full bg-brand-600 text-white shadow-lg shadow-brand-600/30 transition hover:scale-105 hover:bg-brand-500 ${open ? "max-sm:hidden" : ""}`}>
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
        {!open && unread > 0 && <span className="absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[11px] font-bold text-white ring-2 ring-white">{unread}</span>}
      </button>
    </>
  );
}
