// A small calendar: a month at a time, today's plans on the side, events added by hand or from invitations.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, MapPin, Plus, Trash2 } from "lucide-react";
import Preferences from "../components/Preferences.jsx";
import { Button, Modal } from "../components/ui.jsx";
import { getSession } from "../lib/session.js";
import { useErrorText, useI18n } from "../lib/i18n.jsx";
import { eventCreate, eventDelete, eventUpdate, events as loadEvents } from "../lib/api.js";
import { EVENT_COLORS } from "../lib/money.js";

const DAY = 24 * 3600 * 1000;
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const pad = (n) => String(n).padStart(2, "0");
const dateInput = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const timeInput = (ts) => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const join = (date, time) => { const [y, m, d] = date.split("-").map(Number); const [hh, mm] = (time || "00:00").split(":").map(Number); return new Date(y, m - 1, d, hh, mm).getTime(); };

/** Does the event fall on this day? */
const onDay = (e, day) => e.start < day.getTime() + DAY && e.end >= day.getTime();

function EventDialog({ initial, onSaved, onDeleted, onClose }) {
  const { t } = useI18n();
  const errorText = useErrorText();
  const editing = !!initial.id;
  const [f, setF] = useState(() => ({
    title: initial.title || "", date: dateInput(initial.start), start: timeInput(initial.start), end: timeInput(initial.end || initial.start + 3600 * 1000),
    allDay: !!initial.allDay, color: initial.color || "blue", location: initial.location || "", notes: initial.notes || "",
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const save = async (e) => {
    e.preventDefault();
    if (!f.title.trim()) { setError(t("calendar.needTitle")); return; }
    const start = f.allDay ? join(f.date, "00:00") : join(f.date, f.start);
    let end = f.allDay ? join(f.date, "23:59") : join(f.date, f.end);
    if (end < start) end = start;
    const body = { title: f.title, start, end, allDay: f.allDay, color: f.color, location: f.location, notes: f.notes };
    setBusy(true); setError("");
    try { onSaved(editing ? await eventUpdate(initial.id, body) : await eventCreate(body)); } catch (err) { setError(errorText(err)); setBusy(false); }
  };
  const remove = async () => {
    setBusy(true);
    try { await eventDelete(initial.id); onDeleted(initial.id); } catch (err) { setError(errorText(err)); setBusy(false); }
  };
  const field = "mt-1 w-full rounded-xl border border-slate-300 bg-surface px-3 py-2.5 text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100";
  return (
    <Modal title={t(editing ? "calendar.editTitle" : "calendar.newTitle")} onClose={onClose}
      footer={<>
        {editing && <Button variant="ghost" onClick={remove} disabled={busy} className="me-auto"><Trash2 className="h-4 w-4" />{t("calendar.delete")}</Button>}
        <Button variant="ghost" onClick={onClose}>{t("drive.close")}</Button>
        <Button type="submit" form="event-form" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{t("calendar.save")}</Button>
      </>}>
      <form id="event-form" onSubmit={save} className="space-y-3">
        <label className="block text-sm font-semibold text-slate-700">{t("calendar.name")}
          <input value={f.title} onChange={set("title")} maxLength={120} autoFocus className={field} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2 block text-sm font-semibold text-slate-700 sm:col-span-1">{t("calendar.date")}
            <input type="date" value={f.date} onChange={set("date")} required className={field} />
          </label>
          <label className="col-span-2 flex items-center gap-2 self-end pb-3 text-sm font-semibold text-slate-700 sm:col-span-1">
            <input type="checkbox" checked={f.allDay} onChange={set("allDay")} className="h-4 w-4 accent-brand-600" /> {t("calendar.allDay")}
          </label>
          {!f.allDay && <>
            <label className="block text-sm font-semibold text-slate-700">{t("calendar.from")}<input type="time" value={f.start} onChange={set("start")} className={field} /></label>
            <label className="block text-sm font-semibold text-slate-700">{t("calendar.to")}<input type="time" value={f.end} onChange={set("end")} className={field} /></label>
          </>}
        </div>
        <fieldset>
          <legend className="text-sm font-semibold text-slate-700">{t("calendar.color")}</legend>
          <div className="mt-2 flex gap-2">
            {Object.entries(EVENT_COLORS).map(([c, s]) => (
              <button key={c} type="button" onClick={() => setF((x) => ({ ...x, color: c }))} aria-pressed={f.color === c} aria-label={t(`calendar.colors.${c}`)}
                className={`h-8 w-8 rounded-full ring-offset-2 ring-offset-surface ${f.color === c ? "ring-2 ring-slate-900" : ""}`} style={{ background: s.bar }} />
            ))}
          </div>
        </fieldset>
        <label className="block text-sm font-semibold text-slate-700">{t("calendar.location")} <span className="font-normal text-slate-400">{t("shared.req.optional")}</span>
          <input value={f.location} onChange={set("location")} maxLength={200} className={field} />
        </label>
        <label className="block text-sm font-semibold text-slate-700">{t("calendar.notes")} <span className="font-normal text-slate-400">{t("shared.req.optional")}</span>
          <textarea value={f.notes} onChange={set("notes")} maxLength={2000} rows={2} className={field} />
        </label>
        {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
      </form>
    </Modal>
  );
}

export default function Calendar() {
  const session = getSession();
  const { t, locale } = useI18n();
  const errorText = useErrorText();
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [list, setList] = useState(null);
  const [upcoming, setUpcoming] = useState([]);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null);

  // The grid: from the Sunday before the 1st, 6 weeks.
  const days = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = new Date(first); start.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  }, [cursor]);

  const load = useCallback(() => {
    const from = days[0].getTime();
    const to = days[41].getTime() + DAY;
    loadEvents(from, to).then((r) => setList(r.events)).catch((e) => setError(errorText(e)));
    const now = startOfDay(new Date()).getTime();
    loadEvents(now, now + 45 * DAY).then((r) => setUpcoming(r.events)).catch(() => {});
  }, [days, errorText]);
  useEffect(() => { load(); }, [load]);

  if (!session) return <Navigate to="/login" replace />;

  const today = startOfDay(new Date());
  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(2026, 1, 1 + i).toLocaleDateString(locale, { weekday: "short" })); // Feb 1 2026 is a Sunday
  const time = (ts) => new Date(ts).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  const when = (e) => (e.allDay ? t("calendar.allDay") : `${time(e.start)}${e.end > e.start ? `–${time(e.end)}` : ""}`);
  const todays = upcoming.filter((e) => onDay(e, today));
  const later = upcoming.filter((e) => e.start >= today.getTime() + DAY).slice(0, 6);
  const newAt = (d) => { const s = new Date(d); s.setHours(sameDay(d, new Date()) ? Math.min(new Date().getHours() + 1, 23) : 10, 0, 0, 0); setEditing({ start: s.getTime(), end: s.getTime() + 3600 * 1000 }); };
  const saved = () => { setEditing(null); load(); };

  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/inbox" className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100">
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {t("drive.back")}
          </Link>
          <Preferences compact />
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-wrap items-start gap-5 px-4 py-8 sm:px-6">
        <section aria-label={t("calendar.title")} className="min-w-0 flex-[999_1_560px] rounded-3xl border border-slate-200 bg-surface p-4 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="flex-1 text-2xl font-extrabold text-slate-900">{cursor.toLocaleDateString(locale, { month: "long", year: "numeric" })}</h1>
            <button type="button" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} aria-label={t("calendar.prev")} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"><ChevronRight className="h-4 w-4 ltr:rotate-180" /></button>
            <button type="button" onClick={() => { const d = new Date(); setCursor(new Date(d.getFullYear(), d.getMonth(), 1)); }} className="h-10 rounded-xl border border-slate-200 px-3.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t("calendar.today")}</button>
            <button type="button" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} aria-label={t("calendar.next")} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"><ChevronLeft className="h-4 w-4 ltr:rotate-180" /></button>
            <Button onClick={() => newAt(new Date())}><Plus className="h-4 w-4" />{t("calendar.new")}</Button>
          </div>

          {error && <p role="alert" className="mt-3 text-sm text-rose-600">{error}</p>}

          <div className="mt-4 grid grid-cols-7 gap-1.5 text-center text-xs font-bold text-slate-500">
            {weekdays.map((w) => <div key={w}>{w}</div>)}
          </div>
          <div className="relative mt-1.5 grid grid-cols-7 gap-1.5">
            {list === null && <div className="absolute inset-0 z-10 grid place-items-center bg-surface/60"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>}
            {days.map((d) => {
              const inMonth = d.getMonth() === cursor.getMonth();
              const isToday = sameDay(d, today);
              const here = (list || []).filter((e) => onDay(e, d));
              return (
                <div key={d.getTime()} className={`group relative min-h-[5.5rem] rounded-xl p-1.5 text-start ${isToday ? "bg-brand-600 text-white" : inMonth ? "bg-slate-50" : "bg-slate-50/40 text-slate-400"}`}>
                  <button type="button" onClick={() => newAt(d)} aria-label={t("calendar.addOn", { date: d.toLocaleDateString(locale, { day: "numeric", month: "long" }) })}
                    className={`block w-full text-start text-[13px] font-bold ${isToday ? "" : "text-inherit"}`}>{d.getDate()}</button>
                  <div className="mt-1 space-y-1">
                    {here.slice(0, 2).map((e) => (
                      <button key={e.id} type="button" onClick={() => setEditing(e)} title={e.title}
                        className={`block w-full truncate rounded-md px-1.5 py-0.5 text-start text-[11px] font-bold ${isToday ? "bg-white/25 text-white" : EVENT_COLORS[e.color]?.chip}`}>
                        <bdi>{e.title}</bdi>
                      </button>
                    ))}
                    {here.length > 2 && <span className={`block px-1 text-[11px] font-semibold ${isToday ? "text-white/80" : "text-slate-500"}`}>{t("calendar.more", { n: here.length - 2 })}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-4 md:max-w-sm">
          <div className="rounded-3xl border border-slate-200 bg-surface p-5">
            <h2 className="text-lg font-extrabold text-slate-900">{t("calendar.todayIs", { day: today.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" }) })}</h2>
            {todays.length === 0 ? <p className="mt-2 text-sm text-slate-500">{t("calendar.nothingToday")}</p> : todays.map((e) => (
              <button key={e.id} type="button" onClick={() => setEditing(e)} className="mt-3 flex w-full gap-3 text-start">
                <span className="w-1 shrink-0 rounded-full" style={{ background: EVENT_COLORS[e.color]?.bar }} />
                <span><span className="block font-bold text-slate-900"><bdi>{e.title}</bdi></span><span className="block text-sm text-slate-500">{when(e)}{e.source === "email" ? ` · ${t("calendar.fromMail")}` : ""}</span></span>
              </button>
            ))}
            <h3 className="mt-5 text-sm font-bold text-slate-500">{t("calendar.soon")}</h3>
            {later.length === 0 ? <p className="mt-2 text-sm text-slate-500">{t("calendar.nothingSoon")}</p> : later.map((e) => (
              <button key={e.id} type="button" onClick={() => setEditing(e)} className="mt-3 flex w-full gap-3 text-start">
                <span className="w-1 shrink-0 rounded-full" style={{ background: EVENT_COLORS[e.color]?.bar }} />
                <span className="min-w-0">
                  <span className="block font-bold text-slate-900"><bdi>{e.title}</bdi></span>
                  <span className="block text-sm text-slate-500">{new Date(e.start).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" })} · {when(e)}</span>
                  {e.location && <span className="flex items-center gap-1 text-xs text-slate-500"><MapPin className="h-3 w-3" /><bdi>{e.location}</bdi></span>}
                </span>
              </button>
            ))}
          </div>
          <p className="rounded-2xl border border-slate-200 bg-surface p-4 text-sm leading-relaxed text-slate-600">{t("calendar.inviteHint")}</p>
        </aside>
      </main>

      {editing && <EventDialog initial={editing} onClose={() => setEditing(null)} onSaved={saved} onDeleted={saved} />}
    </div>
  );
}
