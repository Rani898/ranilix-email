// Designed cards shown inside a message: the monthly spending summary, and a calendar invitation.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarPlus, Check, Loader2, MapPin, X } from "lucide-react";
import { useErrorText, useI18n } from "../lib/i18n.jsx";
import { CAT_STYLE, formatMoney, parseIcs } from "../lib/money.js";
import StoreLogo from "./StoreLogo.jsx";
import { downloadAttachment, eventCreate, sendMessage } from "../lib/api.js";

export function SummaryCard({ data }) {
  const { t, locale } = useI18n();
  const fmt = (v, c = "ILS") => formatMoney(v, c, locale);
  const total = data.totals?.ILS || 0;
  const others = Object.entries(data.totals || {}).filter(([c]) => c !== "ILS");
  const diff = total - (data.prevTotal || 0);
  const max = Math.max(1, ...(data.byCategory || []).map((c) => c.amount));
  const more = Math.max(0, (data.count || 0) - (data.receipts || []).length);
  return (
    <div className="mt-6 max-w-[600px] overflow-hidden rounded-3xl border border-slate-200 bg-surface shadow-sm">
      <div className="bg-brand-600 px-7 pb-6 pt-7 text-white">
        <p className="text-sm text-white/85">{t("summaryCard.yours")}</p>
        <p className="mt-1 text-3xl font-black">{data.title}</p>
        <p className="mt-5 text-5xl font-black tracking-tight"><bdi dir="ltr">{fmt(total)}</bdi></p>
        {others.map(([c, v]) => <p key={c} className="text-sm text-white/85">+ <bdi dir="ltr">{fmt(v, c)}</bdi></p>)}
        <p className="mt-1 text-sm text-white/90">
          {t("summaryCard.count", { n: data.count })}
          {data.prevTotal > 0 && <> · {t(diff > 0 ? "receipts.more" : "receipts.less", { amount: fmt(Math.abs(diff)) })}</>}
        </p>
      </div>
      <div className="px-7 pt-6">
        <p className="text-lg font-extrabold text-slate-900">{t("receipts.byCategory")}</p>
        <ul className="mt-2 space-y-3">
          {(data.byCategory || []).map((c) => (
            <li key={c.category}>
              <div className="flex justify-between text-sm"><span className="font-semibold text-slate-700">{t(`receipts.cat.${c.category}`)}</span><span className="font-extrabold text-slate-900"><bdi dir="ltr">{fmt(c.amount)}</bdi></span></div>
              <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${Math.max(4, (c.amount / max) * 100)}%`, background: CAT_STYLE[c.category]?.bar }} /></div>
            </li>
          ))}
        </ul>
      </div>
      <div className="px-7 pt-6">
        <p className="text-lg font-extrabold text-slate-900">{t("summaryCard.receipts")}</p>
        <ul className="mt-1">
          {(data.receipts || []).map((r, i) => (
            <li key={i} className="flex items-center gap-3 border-b border-slate-100 py-2.5">
              <StoreLogo store={r.store} domain={r.domain} size={32} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold text-slate-900"><bdi>{r.store}</bdi></span>
                <span className="block text-xs text-slate-500">{new Date(r.date).toLocaleDateString(locale, { day: "numeric", month: "short" })} · {r.source === "gmail" ? "Gmail" : "Ranilix"}</span>
              </span>
              <span className="font-extrabold text-slate-900"><bdi dir="ltr">{fmt(r.amount, r.currency)}</bdi></span>
            </li>
          ))}
        </ul>
        {more > 0 && <p className="mt-2 text-sm text-slate-500">{t("summaryCard.more", { n: more })}</p>}
      </div>
      <div className="px-7 pb-7 pt-6 text-center">
        <Link to={`/receipts?month=${data.month}`} className="inline-block rounded-xl bg-brand-600 px-6 py-3 font-extrabold text-white hover:bg-brand-500">{t("summaryCard.open")}</Link>
        <p className="mt-4 text-xs leading-relaxed text-slate-500">{t("summaryCard.why")}</p>
      </div>
    </div>
  );
}

/** An invitation (.ics) attached to a message: add it to the calendar, say yes or no. */
export function InviteCard({ message, onToast }) {
  const { t, locale } = useI18n();
  const errorText = useErrorText();
  const ics = (message.attachments || []).find((a) => /\.ics$/i.test(a.filename) || /text\/calendar/i.test(a.mime));
  const [ev, setEv] = useState(null);
  const [state, setState] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    let alive = true;
    setEv(null); setState("");
    if (!ics) return undefined;
    downloadAttachment(ics).then((b) => b.text()).then((text) => { if (alive) setEv(parseIcs(text)); }).catch(() => {});
    return () => { alive = false; };
  }, [ics?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ics || !ev || ev.method === "CANCEL") return null;
  const d = new Date(ev.start);
  const time = (ts) => new Date(ts).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  const add = async (rsvp) => {
    setBusy(rsvp || "add");
    try {
      if (rsvp !== "no") await eventCreate({ title: ev.title || message.subject, start: ev.start, end: ev.end, allDay: ev.allDay, location: ev.location, uid: ev.uid, messageId: message.id, color: "pink", rsvp });
      if (rsvp) {
        const to = ev.organizer || message.from.email;
        const word = t(rsvp === "yes" ? "invite.yesSubject" : "invite.noSubject");
        await sendMessage({ to, subject: `${word}: ${ev.title || message.subject}`, body: t(rsvp === "yes" ? "invite.yesBody" : "invite.noBody", { title: ev.title || message.subject }) });
      }
      setState(rsvp || "added");
      onToast?.(t(rsvp ? "invite.answered" : "invite.added"));
    } catch (e) { onToast?.(errorText(e)); }
    setBusy("");
  };
  return (
    <div className="mt-6 max-w-[560px] overflow-hidden rounded-2xl border border-slate-200 bg-surface shadow-sm">
      <div className="flex items-start gap-4 p-5">
        <div className="w-16 shrink-0 overflow-hidden rounded-xl border border-slate-200 text-center">
          <div className="bg-pink-500 py-0.5 text-xs font-bold text-white">{d.toLocaleDateString(locale, { month: "short" })}</div>
          <div className="py-1 text-2xl font-extrabold text-slate-900">{d.getDate()}</div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-extrabold text-slate-900"><bdi>{ev.title || message.subject}</bdi></p>
          <p className="text-sm text-slate-500">
            {d.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" })}
            {!ev.allDay && ` · ${time(ev.start)}${ev.end > ev.start ? `–${time(ev.end)}` : ""}`}
          </p>
          {ev.location && <p className="mt-0.5 flex items-center gap-1 text-sm text-slate-500"><MapPin className="h-3.5 w-3.5" /><bdi>{ev.location}</bdi></p>}
          {state ? (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700">
              <Check className="h-4 w-4" />{t(state === "yes" ? "invite.saidYes" : state === "no" ? "invite.saidNo" : "invite.inCalendar")}
              <Link to="/calendar" className="ms-1 underline">{t("invite.openCalendar")}</Link>
            </p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => add(null)} disabled={!!busy} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-brand-600 px-3.5 text-sm font-bold text-white hover:bg-brand-500 disabled:opacity-60">
                {busy === "add" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}{t("invite.add")}
              </button>
              <button type="button" onClick={() => add("yes")} disabled={!!busy} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-300 px-3.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                {busy === "yes" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{t("invite.yes")}
              </button>
              <button type="button" onClick={() => add("no")} disabled={!!busy} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-300 px-3.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                {busy === "no" ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}{t("invite.no")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
