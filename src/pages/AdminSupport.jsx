// Admin "Support" tab: the conversations people start in the help window, and the replies.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Bot, Check, Globe, Loader2, MessagesSquare, RotateCcw, SendHorizonal, ThumbsDown, ThumbsUp, Trash2, UserRound } from "lucide-react";
import LogoMark from "../components/LogoMark.jsx";
import { Button, Modal, Toggle } from "../components/ui.jsx";
import { adminApi } from "../lib/adminApi.js";
import { useErrorText, useI18n } from "../lib/i18n.jsx";

function useWhen() {
  const { locale, t } = useI18n();
  return useCallback((ts) => {
    const d = new Date(ts);
    if (Date.now() - ts < 60_000) return t("admin.support.now");
    if (d.toDateString() === new Date().toDateString()) return d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString(locale, { day: "numeric", month: "short" });
  }, [locale, t]);
}

const who = (th, t) => th.name || th.email || t("admin.support.guest");

function Avatar({ th }) {
  const letter = (th.name || th.email || "?")[0].toUpperCase();
  return (
    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold ${th.member ? "bg-brand-100 text-brand-700" : "bg-slate-200 text-slate-600"}`} aria-hidden="true">
      {th.name || th.email ? letter : <UserRound className="h-5 w-5" />}
    </span>
  );
}

function Message({ m }) {
  const { t } = useI18n();
  const when = useWhen();
  if (m.sender === "admin") {
    return (
      <div className="flex flex-col items-end">
        <div dir="auto" className="max-w-[80%] whitespace-pre-wrap break-words rounded-2xl rounded-ee-md bg-brand-600 px-3.5 py-2.5 text-sm text-white [unicode-bidi:plaintext]">{m.body}</div>
        <span className="mt-1 text-[11px] text-slate-400">{m.author} · {when(m.createdAt)}</span>
      </div>
    );
  }
  const bot = m.sender === "bot";
  return (
    <div className="flex flex-col items-start">
      <div dir="auto" className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl rounded-es-md px-3.5 py-2.5 text-sm [unicode-bidi:plaintext] ${bot ? "border border-dashed border-slate-300 bg-slate-50 text-slate-500" : "bg-slate-100 text-slate-900"}`}>
        {bot && <span className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-slate-500"><Bot className="h-3.5 w-3.5" /> {t("admin.support.bot")}</span>}
        {m.body}
      </div>
      <span className="mt-1 text-[11px] text-slate-400">{when(m.createdAt)}</span>
    </div>
  );
}

function Conversation({ id, onBack, onChanged, toast }) {
  const { t } = useI18n();
  const errorText = useErrorText();
  const when = useWhen();
  const [data, setData] = useState(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const endRef = useRef(null);
  const boxRef = useRef(null);
  const quick = t("admin.support.quick");

  const load = useCallback(async () => {
    try { setData(await adminApi.supportThread(id)); setError(""); } catch (e) { setError(errorText(e)); }
  }, [id, errorText]);
  useEffect(() => { setData(null); setText(""); load(); }, [load]);
  useEffect(() => {
    const timer = setInterval(() => { if (!document.hidden) load(); }, 5000);
    return () => clearInterval(timer);
  }, [load]);
  const count = data?.messages.length || 0;
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [count]);

  const reply = async (close = false) => {
    const v = text.trim();
    if (!v || busy) return;
    setBusy(true);
    try {
      const res = await adminApi.supportReply(id, v);
      if (close) await adminApi.supportStatus(id, "closed");
      setText("");
      toast(t(res.emailed ? "admin.support.sentEmailed" : close ? "admin.support.sentClosed" : "admin.support.sent"));
      await load();
      onChanged();
    } catch (e) { setError(errorText(e)); }
    setBusy(false);
  };
  const setStatus = async (status) => {
    try { await adminApi.supportStatus(id, status); toast(t(status === "closed" ? "admin.support.closedToast" : "admin.support.reopenedToast")); await load(); onChanged(); } catch (e) { setError(errorText(e)); }
  };
  const remove = async () => {
    try { await adminApi.supportDelete(id); toast(t("admin.support.deletedToast")); onChanged(); onBack(true); } catch (e) { setError(errorText(e)); }
  };

  if (!data) {
    return <div className="grid flex-1 place-items-center p-10 text-slate-400">{error ? <p className="text-rose-600">{error}</p> : <Loader2 className="h-6 w-6 animate-spin" />}</div>;
  }
  const th = data.thread;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4">
        <button type="button" onClick={() => onBack(false)} className="grid h-9 w-9 place-items-center rounded-full text-slate-600 hover:bg-slate-100 lg:hidden" aria-label={t("admin.support.back")}><ArrowLeft className="h-5 w-5 rtl:rotate-180" /></button>
        <Avatar th={th} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 font-bold text-slate-900">
            <span className="truncate">{who(th, t)}</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${th.member ? "bg-brand-50 text-brand-700" : "bg-slate-100 text-slate-600"}`}>{th.member ? t("admin.support.member") : t("admin.support.visitor")}</span>
            {th.topic && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">{t(`support.topics.${th.topic}`)}</span>}
          </p>
          <p className="truncate text-xs text-slate-500">
            {th.email ? <bdi dir="ltr">{th.email}</bdi> : t("admin.support.noEmail")}
            {th.page && <> · <Globe className="inline h-3 w-3" /> <bdi dir="ltr">{th.page}</bdi></>}
            {th.otherThreads > 0 && <> · {t("admin.support.others", { n: th.otherThreads })}</>}
            {" · "}{t("admin.support.started", { when: when(th.createdAt) })}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {th.rating === 1 && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700"><ThumbsUp className="h-3.5 w-3.5" /> {t("admin.support.ratedGood")}</span>}
          {th.rating === -1 && <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700"><ThumbsDown className="h-3.5 w-3.5" /> {t("admin.support.ratedBad")}</span>}
          {th.status === "open"
            ? <Button variant="ghost" onClick={() => setStatus("closed")}><Check className="h-4 w-4" /> {t("admin.support.close")}</Button>
            : <Button variant="ghost" onClick={() => setStatus("open")}><RotateCcw className="h-4 w-4" /> {t("admin.support.reopen")}</Button>}
          <button type="button" onClick={() => setConfirmDelete(true)} className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600" aria-label={t("admin.support.delete")} title={t("admin.support.delete")}><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-slate-50/50 p-4">
        {data.messages.map((m) => <Message key={m.id} m={m} />)}
        {th.status === "closed" && <p className="text-center text-xs font-semibold text-slate-500">{t("admin.support.closedLine")}</p>}
        <div ref={endRef} />
      </div>

      <div className="border-t border-slate-200 p-3">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {quick.map((q) => (
            <button key={q} type="button" onClick={() => { setText((v) => (v ? `${v}\n${q}` : q)); boxRef.current?.focus(); }}
              className="rounded-full border border-slate-300 bg-surface px-2.5 py-1 text-xs text-slate-700 hover:border-brand-400 hover:text-brand-700">{q}</button>
          ))}
        </div>
        <textarea ref={boxRef} rows={3} value={text} dir="auto" onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); reply(false); } }}
          placeholder={t("admin.support.replyPlaceholder")} aria-label={t("admin.support.replyPlaceholder")}
          className="w-full resize-y rounded-xl border border-slate-300 bg-surface px-3 py-2.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100" />
        {!th.member && !th.email && <p className="mt-1 text-xs text-amber-700">{t("admin.support.guestNoEmail")}</p>}
        {!th.member && th.email && <p className="mt-1 text-xs text-slate-500">{t("admin.support.guestEmail")}</p>}
        {th.member && <p className="mt-1 text-xs text-slate-500">{t("admin.support.memberNotify")}</p>}
        {error && <p role="alert" className="mt-2 text-sm text-rose-600">{error}</p>}
        <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
          <span className="me-auto hidden text-xs text-slate-400 sm:inline">{t("admin.support.shortcut")}</span>
          <Button variant="ghost" onClick={() => reply(true)} disabled={!text.trim() || busy}><Check className="h-4 w-4" /> {t("admin.support.sendClose")}</Button>
          <Button onClick={() => reply(false)} disabled={!text.trim() || busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizonal className="h-4 w-4 rtl:rotate-180" />} {t("admin.support.send")}</Button>
        </div>
      </div>

      {confirmDelete && (
        <Modal tone="danger" title={t("admin.support.deleteTitle")} onClose={() => setConfirmDelete(false)}
          footer={<><Button variant="ghost" onClick={() => setConfirmDelete(false)}>{t("admin.users.cancel")}</Button><Button variant="danger" onClick={remove}>{t("admin.support.delete")}</Button></>}>
          <p>{t("admin.support.deleteText")}</p>
        </Modal>
      )}
    </div>
  );
}

export default function SupportTab({ toast, onCount }) {
  const { t } = useI18n();
  const errorText = useErrorText();
  const when = useWhen();
  const [status, setStatus] = useState("open");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await adminApi.support(status);
      setData(res);
      onCount?.(res.unread);
      setError("");
    } catch (e) { setError(errorText(e)); }
  }, [status, errorText, onCount]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const timer = setInterval(() => { if (!document.hidden) load(); }, 15_000);
    return () => clearInterval(timer);
  }, [load]);

  const setOnline = async (online) => {
    try { await adminApi.supportOnline(online); setData((d) => ({ ...d, online })); toast(t(online ? "admin.support.onlineOn" : "admin.support.onlineOff")); } catch (e) { toast(errorText(e)); }
  };
  const filters = useMemo(() => [["open", data?.open], ["closed", data?.closed], ["all", data?.all]], [data]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">{t("admin.support.title")}</h1>
          <p className="mt-1 text-slate-600">{t("admin.support.subtitle")}</p>
        </div>
        {data && (
          <div className="rounded-2xl border border-slate-200 bg-surface px-4 py-3">
            <Toggle id="support-online" checked={!!data.online} onChange={setOnline} label={t("admin.support.onlineLabel")} description={t("admin.support.onlineHint")} />
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {filters.map(([id, n]) => (
          <button key={id} type="button" onClick={() => { setStatus(id); setSelected(null); }} aria-pressed={status === id}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${status === id ? "bg-ink text-white" : "border border-slate-300 bg-surface text-slate-700 hover:bg-slate-100"}`}>
            {t(`admin.support.filters.${id}`)}{n !== undefined && <span className="ms-1.5 tabular-nums opacity-70">{n}</span>}
          </button>
        ))}
      </div>

      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

      {!data ? (
        <div className="grid place-items-center py-24 text-slate-400"><Loader2 className="h-7 w-7 animate-spin" /></div>
      ) : (
        <section className="flex h-[calc(100dvh-17rem)] min-h-[520px] overflow-hidden rounded-2xl border border-slate-200 bg-surface">
          <div className={`w-full shrink-0 overflow-y-auto border-slate-200 lg:block lg:w-80 lg:border-e ${selected ? "hidden" : ""}`}>
            {data.threads.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center p-8 text-center">
                <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-600"><MessagesSquare className="h-7 w-7" /></span>
                <p className="mt-3 font-semibold text-slate-700">{t(status === "open" ? "admin.support.emptyOpen" : "admin.support.empty")}</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.threads.map((th) => (
                  <li key={th.id}>
                    <button type="button" onClick={() => { setSelected(th.id); if (th.unread) { setData((d) => ({ ...d, unread: Math.max(0, d.unread - 1), threads: d.threads.map((x) => (x.id === th.id ? { ...x, unread: 0 } : x)) })); onCount?.(Math.max(0, data.unread - 1)); } }} aria-current={selected === th.id ? "true" : undefined}
                      className={`flex w-full items-start gap-3 px-4 py-3.5 text-start transition ${selected === th.id ? "bg-brand-50" : "hover:bg-slate-50"}`}>
                      <Avatar th={th} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className={`truncate text-sm ${th.unread ? "font-bold text-slate-900" : "font-semibold text-slate-800"}`}>{who(th, t)}</p>
                          <span className="shrink-0 text-xs text-slate-400">{when(th.updatedAt)}</span>
                        </div>
                        <p dir="auto" className={`truncate text-sm ${th.unread ? "font-medium text-slate-900" : "text-slate-500"}`}>
                          {th.lastFrom === "admin" && <span className="text-slate-400">{t("admin.support.youPrefix")} </span>}{th.lastPreview}
                        </p>
                        <div className="mt-1 flex items-center gap-1.5">
                          {!th.member && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">{t("admin.support.visitor")}</span>}
                          {th.status === "closed" && <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">{t("admin.support.solved")}</span>}
                          {th.rating === 1 && <ThumbsUp className="h-3.5 w-3.5 text-emerald-600" aria-label={t("admin.support.ratedGood")} />}
                          {th.rating === -1 && <ThumbsDown className="h-3.5 w-3.5 text-rose-600" aria-label={t("admin.support.ratedBad")} />}
                        </div>
                      </div>
                      {th.unread > 0 && <span className="mt-1 grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white">{th.unread}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className={`min-w-0 flex-1 flex-col ${selected ? "flex" : "hidden lg:flex"}`}>
            {selected
              ? <Conversation key={selected} id={selected} toast={toast} onChanged={load} onBack={(deleted) => { setSelected(null); if (deleted) load(); }} />
              : (
                <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-slate-500">
                  <LogoMark size={44} />
                  <p className="mt-3 text-sm">{t("admin.support.pick")}</p>
                </div>
              )}
          </div>
        </section>
      )}
    </div>
  );
}
