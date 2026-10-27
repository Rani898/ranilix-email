// The private room: a cosy chat with Mochi (an AI friend), only for the admin who has it.
import { useEffect, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { ArrowLeft, Loader2, SendHorizontal, Trash2 } from "lucide-react";
import { Button, Modal } from "../components/ui.jsx";
import { Mochi } from "../components/SkinDecor.jsx";
import Preferences from "../components/Preferences.jsx";
import { getSession } from "../lib/session.js";
import { useErrorText, useI18n } from "../lib/i18n.jsx";
import { applySkin, skinImage, useSkin } from "../lib/skin.js";
import { aiChat, aiClear, aiSend, getMe } from "../lib/api.js";

function Avatar({ skin }) {
  return skin.sticker
    ? <img src={skinImage(skin.sticker)} alt="" className="h-9 w-9 shrink-0 object-contain" />
    : <span className="shrink-0"><Mochi size={36} /></span>;
}

export default function Room() {
  const session = getSession();
  const { t, locale } = useI18n();
  const errorText = useErrorText();
  const skin = useSkin();
  const [allowed, setAllowed] = useState(null);
  const [ready, setReady] = useState(true);
  const [messages, setMessages] = useState(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const end = useRef(null);
  const box = useRef(null);
  const name = skin.nickname || t("admin.look.defaultName");

  useEffect(() => {
    if (!session) return;
    getMe().then((me) => {
      if (me.skin) applySkin(me.skin);
      setAllowed(!!me.isAdmin);
      if (me.isAdmin) aiChat().then((d) => { setReady(d.ready); setMessages(d.messages); }).catch((e) => { setError(errorText(e)); setMessages([]); });
    }).catch(() => setAllowed(false));
  }, [session?.email]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, busy]);

  useEffect(() => {
    const original = document.title;
    document.title = `${t("room.title")} · Ranilix`;
    return () => { document.title = original; };
  }, [t]);

  if (!session) return <Navigate to="/login" replace />;
  if (allowed === false) return <Navigate to="/inbox" replace />;

  const send = async (value) => {
    const msg = (value ?? text).trim();
    if (!msg || busy) return;
    setError("");
    setText("");
    const mine = { id: `tmp-${Date.now()}`, role: "user", text: msg, at: Date.now() };
    setMessages((m) => [...(m || []), mine]);
    setBusy(true);
    try {
      const { message } = await aiSend(msg);
      setMessages((m) => [...m, message]);
    } catch (e) {
      setError(errorText(e));
      setText(msg);
      setMessages((m) => m.filter((x) => x.id !== mine.id));
    }
    setBusy(false);
    box.current?.focus();
  };

  const clear = async () => {
    setConfirm(false);
    try { await aiClear(); setMessages([]); } catch (e) { setError(errorText(e)); }
  };

  const time = (ts) => new Date(ts).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  const ideas = t("room.ideas");

  return (
    <div className="flex h-dvh flex-col bg-slate-50">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-surface px-3 sm:px-6">
        <Link to="/admin#look" className="grid h-9 w-9 place-items-center rounded-lg text-slate-600 hover:bg-slate-100" aria-label={t("room.back")} title={t("room.back")}>
          <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
        </Link>
        <Avatar skin={skin} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-extrabold text-slate-900">{t("room.mochi")}</h1>
          <p className="truncate text-xs text-slate-500">{busy ? t("room.typing") : t("room.subtitle", { name })}</p>
        </div>
        {messages?.length > 0 && (
          <button type="button" onClick={() => setConfirm(true)} className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label={t("room.clear")} title={t("room.clear")}>
            <Trash2 className="h-4 w-4" />
          </button>
        )}
        <Preferences compact />
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-2xl flex-col gap-3 px-3 py-6 sm:px-6">
          {messages === null ? (
            <div className="grid place-items-center py-24 text-slate-400"><Loader2 className="h-7 w-7 animate-spin" /></div>
          ) : !ready ? (
            <div className="rounded-3xl border border-slate-200 bg-surface p-8 text-center">
              <span className="mx-auto block w-fit"><Mochi size={96} /></span>
              <h2 className="mt-4 text-xl font-extrabold text-slate-900">{t("room.notReadyTitle")}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{t("room.notReadyText")}</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="rounded-3xl border border-slate-200 bg-surface p-8 text-center">
              <span className="mx-auto block w-fit">{skin.sticker ? <img src={skinImage(skin.sticker)} alt="" className="h-24 w-24 object-contain" /> : <Mochi size={96} />}</span>
              <h2 className="mt-4 text-xl font-extrabold text-slate-900">{t("room.hello", { name })}</h2>
              <p className="mt-1 text-slate-600">{t("room.helloText")}</p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {Array.isArray(ideas) && ideas.map((idea) => (
                  <button key={idea} type="button" onClick={() => send(idea)}
                    className="rounded-full border-2 border-dashed border-brand-200 bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-700 hover:bg-brand-100">{idea}</button>
                ))}
              </div>
            </div>
          ) : messages.map((m) => (
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[85%] rounded-3xl rounded-ee-md bg-brand-600 px-4 py-2.5 text-white shadow-sm">
                  <p className="whitespace-pre-wrap break-words"><bdi>{m.text}</bdi></p>
                  <p className="mt-1 text-end text-[10px] text-white/70">{time(m.at)}</p>
                </div>
              </div>
            ) : (
              <div key={m.id} className="flex items-end gap-2">
                <Avatar skin={skin} />
                <div className="max-w-[85%] rounded-3xl rounded-es-md border-2 border-brand-100 bg-surface px-4 py-2.5 text-slate-800 shadow-sm">
                  <p className="whitespace-pre-wrap break-words"><bdi>{m.text}</bdi></p>
                  <p className="mt-1 text-[10px] text-slate-400">{time(m.at)}</p>
                </div>
              </div>
            )
          ))}
          {busy && (
            <div className="flex items-end gap-2" aria-live="polite">
              <Avatar skin={skin} />
              <div className="flex gap-1 rounded-3xl rounded-es-md border-2 border-brand-100 bg-surface px-4 py-3.5" aria-label={t("room.typing")}>
                {[0, 1, 2].map((i) => <span key={i} className="h-2 w-2 animate-bounce rounded-full bg-brand-400" style={{ animationDelay: `${i * 0.15}s` }} />)}
              </div>
            </div>
          )}
          <div ref={end} />
        </div>
      </main>

      {ready && messages !== null && (
        <footer className="shrink-0 border-t border-slate-200 bg-surface px-3 py-3 sm:px-6">
          <form className="mx-auto flex max-w-2xl items-end gap-2" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <textarea ref={box} value={text} onChange={(e) => setText(e.target.value)} rows={1} maxLength={4000} placeholder={t("room.placeholder", { name })} aria-label={t("room.placeholder", { name })}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
              className="max-h-40 min-h-[44px] flex-1 resize-none rounded-2xl border-2 border-brand-100 bg-slate-50 px-4 py-2.5 text-slate-900 focus:border-brand-400 focus:outline-none" />
            <button type="submit" disabled={busy || !text.trim()} aria-label={t("room.send")}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-600 text-white shadow-md transition hover:bg-brand-500 disabled:opacity-40">
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <SendHorizontal className="h-5 w-5 rtl:rotate-180" />}
            </button>
          </form>
          {error && <p role="alert" className="mx-auto mt-2 max-w-2xl text-sm text-rose-600">{error}</p>}
          <p className="mx-auto mt-1.5 max-w-2xl text-center text-[11px] text-slate-400">{t("room.note")}</p>
        </footer>
      )}

      {confirm && (
        <Modal title={t("room.clearTitle")} onClose={() => setConfirm(false)} tone="danger"
          footer={<><Button variant="ghost" onClick={() => setConfirm(false)}>{t("drive.close")}</Button><Button variant="danger" onClick={clear}>{t("room.clear")}</Button></>}>
          <p className="text-sm text-slate-600">{t("room.clearText")}</p>
        </Modal>
      )}
    </div>
  );
}
