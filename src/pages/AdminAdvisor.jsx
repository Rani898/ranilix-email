// Admin "Advisor" tab: Rani's private room with an AI business advisor that sees the live numbers
// and answers like an honest outside critic.
import { Fragment, useEffect, useRef, useState } from "react";
import { ArrowUp, Compass, Loader2, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import { Button, Modal } from "../components/ui.jsx";
import { adminApi } from "../lib/adminApi.js";
import { useErrorText, useI18n } from "../lib/i18n.jsx";

/** Light formatting for the advisor's answers: paragraphs, numbered/bullet lists, **bold**, ### headings. */
function Rich({ text }) {
  const inline = (s, k) => s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={`${k}-${i}`} className="font-bold text-slate-900">{part.slice(2, -2)}</strong> : <Fragment key={`${k}-${i}`}>{part}</Fragment>);
  const blocks = [];
  let list = null;
  text.split("\n").forEach((raw, i) => {
    const line = raw.trimEnd();
    const li = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line);
    if (li) {
      const ordered = /^\s*\d/.test(line);
      if (!list || list.ordered !== ordered) { list = { ordered, items: [] }; blocks.push(list); }
      list.items.push(li[1]);
      return;
    }
    list = null;
    if (!line.trim()) return;
    const hd = /^#{1,4}\s+(.*)$/.exec(line);
    blocks.push(hd ? { h: hd[1], i } : { p: line, i });
  });
  return (
    <div dir="auto" className="space-y-2.5 text-[15px] leading-relaxed text-slate-700 [unicode-bidi:plaintext]">
      {blocks.map((b, i) => b.items ? (
        b.ordered
          ? <ol key={i} className="list-decimal space-y-1.5 ps-5 marker:font-bold marker:text-[var(--color-chart)]">{b.items.map((it, j) => <li key={j}>{inline(it, `${i}-${j}`)}</li>)}</ol>
          : <ul key={i} className="list-disc space-y-1.5 ps-5 marker:text-[var(--color-chart)]">{b.items.map((it, j) => <li key={j}>{inline(it, `${i}-${j}`)}</li>)}</ul>
      ) : b.h ? <p key={i} className="pt-1 font-bold text-slate-900">{inline(b.h, i)}</p> : <p key={i}>{inline(b.p, i)}</p>)}
    </div>
  );
}

export default function AdvisorTab() {
  const { t, locale } = useI18n();
  const errorText = useErrorText();
  const [messages, setMessages] = useState(null);
  const [ready, setReady] = useState(true);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [snapshot, setSnapshot] = useState("");
  const [showSnap, setShowSnap] = useState(false);
  const endRef = useRef(null);
  const boxRef = useRef(null);

  useEffect(() => {
    adminApi.advisor().then((r) => { setMessages(r.messages || []); setReady(r.ready !== false); }).catch((e) => { setMessages([]); setError(errorText(e)); });
  }, [errorText]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" }); }, [messages?.length, busy]);

  const send = async (raw) => {
    const v = (raw ?? text).trim();
    if (!v || busy) return;
    setBusy(true); setError(""); setText("");
    const mine = { id: `tmp-${Date.now()}`, role: "user", text: v, at: Date.now() };
    setMessages((m) => [...(m || []), mine]);
    try {
      const { message } = await adminApi.advisorSend(v);
      setMessages((m) => [...m, message]);
    } catch (e) {
      setError(errorText(e));
      setText(v);
      setMessages((m) => m.filter((x) => x.id !== mine.id));
    }
    setBusy(false);
    boxRef.current?.focus();
  };
  const clear = async () => {
    try { await adminApi.advisorClear(); setMessages([]); setConfirmClear(false); } catch (e) { setError(errorText(e)); }
  };
  const openSnapshot = async () => {
    setShowSnap(true);
    if (!snapshot) adminApi.advisorSnapshot().then((r) => setSnapshot(r.snapshot)).catch((e) => setSnapshot(errorText(e)));
  };

  const starters = t("admin.advisor.starters");
  const when = (ts) => new Date(ts).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  const empty = messages && messages.length === 0;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-[-0.02em] text-slate-900 sm:text-4xl">
            {t("admin.advisor.title1")} <span className="adm-serif">{t("admin.advisor.title2")}</span>
          </h1>
          <p className="mt-1 max-w-xl text-slate-600">{t("admin.advisor.subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={openSnapshot} className="adm-glass inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-slate-700 hover:text-brand-700">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" aria-hidden="true" />{t("admin.advisor.sees")}
          </button>
          {messages?.length > 0 && (
            <button type="button" onClick={() => setConfirmClear(true)} className="adm-glass inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-slate-700 hover:text-rose-600">
              <RotateCcw className="h-4 w-4" aria-hidden="true" />{t("admin.advisor.newChat")}
            </button>
          )}
        </div>
      </div>

      <section className="adm-glass flex min-h-[calc(100dvh-19rem)] flex-col overflow-hidden rounded-3xl">
        <div className="flex-1 space-y-6 overflow-y-auto p-5 sm:p-7" aria-live="polite">
          {!messages ? (
            <div className="grid place-items-center py-24 text-slate-400"><Loader2 className="h-7 w-7 animate-spin" /></div>
          ) : empty ? (
            <div className="mx-auto flex max-w-xl flex-col items-center py-8 text-center">
              <span className="adm-monitor grid h-16 w-16 place-items-center rounded-2xl text-white"><Compass className="h-8 w-8" aria-hidden="true" /></span>
              <h2 className="mt-5 text-xl font-bold text-slate-900">{t("admin.advisor.emptyTitle")}</h2>
              <p className="mt-2 text-slate-600">{t("admin.advisor.emptyText")}</p>
              <div className="mt-6 grid w-full gap-2.5 sm:grid-cols-2">
                {starters.map((s) => (
                  <button key={s} type="button" onClick={() => send(s)} disabled={busy || !ready}
                    className="rounded-2xl border border-slate-200 bg-surface/70 px-4 py-3 text-start text-sm font-medium text-slate-700 transition hover:border-brand-300 hover:text-brand-700 disabled:opacity-50">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) => m.role === "user" ? (
              <div key={m.id} className="flex flex-col items-end">
                <div dir="auto" className="max-w-[85%] whitespace-pre-wrap break-words rounded-3xl rounded-ee-lg bg-[var(--color-chart)] px-4 py-3 text-[15px] text-white [unicode-bidi:plaintext]">{m.text}</div>
                <span className="mt-1 text-[11px] text-slate-400">{when(m.at)}</span>
              </div>
            ) : (
              <div key={m.id} className="flex gap-3">
                <span className="adm-monitor mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white" aria-hidden="true"><Compass className="h-4.5 w-4.5" /></span>
                <div className="min-w-0 flex-1">
                  <p className="mb-1 text-xs font-bold text-slate-500">{t("admin.advisor.name")} · <span className="font-normal">{when(m.at)}</span></p>
                  <Rich text={m.text} />
                </div>
              </div>
            ))
          )}
          {busy && (
            <div className="flex items-center gap-3 text-sm text-slate-500">
              <span className="adm-monitor grid h-9 w-9 place-items-center rounded-xl text-white"><Sparkles className="h-4 w-4 animate-pulse" aria-hidden="true" /></span>
              {t("admin.advisor.thinking")}
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div className="border-t border-slate-200/70 p-3 sm:p-4">
          {error && <p role="alert" className="mb-2 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
          {!ready && <p className="mb-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">{t("admin.advisor.notReady")}</p>}
          <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-surface p-2 focus-within:border-brand-400 focus-within:ring-4 focus-within:ring-brand-100">
            <label htmlFor="advisor-box" className="sr-only">{t("admin.advisor.placeholder")}</label>
            <textarea id="advisor-box" ref={boxRef} rows={1} value={text} dir="auto" disabled={!ready}
              onChange={(e) => { setText(e.target.value); e.target.style.height = "auto"; e.target.style.height = `${Math.min(180, e.target.scrollHeight)}px`; }}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={t("admin.advisor.placeholder")}
              className="max-h-44 min-h-11 flex-1 resize-none bg-transparent px-2 py-2.5 text-[15px] text-slate-900 placeholder:text-slate-400 focus:outline-none" />
            <button type="button" onClick={() => send()} disabled={busy || !text.trim() || !ready} aria-label={t("admin.advisor.send")}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--color-chart)] text-white transition hover:opacity-90 disabled:opacity-40">
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowUp className="h-5 w-5" />}
            </button>
          </div>
          <p className="mt-2 text-center text-[11.5px] text-slate-500">{t("admin.advisor.note")}</p>
        </div>
      </section>

      {confirmClear && (
        <Modal tone="danger" title={t("admin.advisor.clearTitle")} onClose={() => setConfirmClear(false)}
          footer={<><Button variant="ghost" onClick={() => setConfirmClear(false)}>{t("admin.advisor.cancel")}</Button><Button variant="danger" onClick={clear}><Trash2 className="h-4 w-4" />{t("admin.advisor.clear")}</Button></>}>
          <p className="text-sm text-slate-600">{t("admin.advisor.clearText")}</p>
        </Modal>
      )}
      {showSnap && (
        <Modal title={t("admin.advisor.snapTitle")} onClose={() => setShowSnap(false)}>
          <p className="mb-3 text-sm text-slate-600">{t("admin.advisor.snapText")}</p>
          {snapshot ? <pre dir="ltr" className="whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-700">{snapshot}</pre>
            : <div className="grid place-items-center py-6 text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /></div>}
        </Modal>
      )}
    </div>
  );
}
