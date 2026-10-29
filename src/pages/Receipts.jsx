// Receipts and spending: every receipt that came by mail (Ranilix and connected Gmail), per month.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ChevronLeft, ChevronRight, EyeOff, Info, Loader2, Mail, Paperclip, RefreshCw, Send, X } from "lucide-react";
import Preferences from "../components/Preferences.jsx";
import { Button, Toggle } from "../components/ui.jsx";
import { getSession } from "../lib/session.js";
import { useErrorText, useI18n } from "../lib/i18n.jsx";
import { receipts as loadReceipts, receiptUpdate, receiptsScan, receiptsSendSummary, receiptsSettings } from "../lib/api.js";
import { CATS, CAT_STYLE, formatMoney, monthKeyOf, monthTitle, shiftMonthKey } from "../lib/money.js";
import StoreLogo from "../components/StoreLogo.jsx";

const SOURCE_DOT = { ranilix: "#2547ea", gmail: "#ea4335" };

export default function Receipts() {
  const session = getSession();
  const { t, locale } = useI18n();
  const errorText = useErrorText();
  const [params, setParams] = useSearchParams();
  const month = /^\d{4}-\d{2}$/.test(params.get("month") || "") ? params.get("month") : monthKeyOf();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [source, setSource] = useState("all");
  const [picked, setPicked] = useState(null);
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState("");

  const load = useCallback(() => {
    setError("");
    return loadReceipts(month).then(setData).catch((e) => setError(errorText(e)));
  }, [month, errorText]);

  useEffect(() => { setData(null); setPicked(null); load(); }, [load]);

  // First visit: look through the last months of mail once, so the page isn't empty.
  useEffect(() => {
    if (!data || data.lastScan || busy) return;
    scan(true);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(id);
  }, [toast]);

  const rows = useMemo(() => (data?.receipts || []).filter((r) => !r.hidden && (source === "all" || r.source === source)), [data, source]);
  const counts = useMemo(() => {
    const shown = (data?.receipts || []).filter((r) => !r.hidden);
    return { all: shown.length, ranilix: shown.filter((r) => r.source === "ranilix").length, gmail: shown.filter((r) => r.source === "gmail").length };
  }, [data]);

  if (!session) return <Navigate to="/login" replace />;

  const go = (by) => setParams({ month: shiftMonthKey(month, by) });
  const fmt = (v, c) => formatMoney(v, c, locale);
  const date = (ts) => new Date(ts).toLocaleDateString(locale, { day: "numeric", month: "short" });

  async function scan(quiet = false) {
    setBusy("scan");
    try {
      const r = await receiptsScan();
      await load();
      if (!quiet) setToast(t("receipts.scanned", { n: r.ranilix + r.gmail }));
      if (r.gmailError === "google_reconnect") setToast(t("receipts.gmailReconnect"));
    } catch (e) { if (!quiet) setToast(errorText(e)); }
    setBusy("");
  }

  const sendSummary = async () => {
    setBusy("summary");
    try { await receiptsSendSummary(month); setToast(t("receipts.summarySent")); } catch (e) { setToast(errorText(e)); }
    setBusy("");
  };

  const setSummary = async (on) => {
    try { await receiptsSettings(on); setData((d) => ({ ...d, summaryOn: on })); } catch (e) { setToast(errorText(e)); }
  };

  const change = async (r, patch) => {
    try {
      await receiptUpdate(r.id, patch);
      if (patch.hidden) { setPicked(null); setToast(t("receipts.hiddenToast")); }
      if (patch.category) setToast(t("receipts.catAll", { store: r.store }));
      await load();
      if (!patch.hidden) setPicked((p) => (p ? { ...p, ...patch } : p));
    } catch (e) { setToast(errorText(e)); }
  };

  const ils = data?.totals?.ILS || 0;
  const others = Object.entries(data?.totals || {}).filter(([c]) => c !== "ILS");
  const diff = ils - (data?.prevTotal || 0);
  const maxCat = Math.max(1, ...(data?.byCategory || []).map((c) => c.amount));
  const sel = picked && rows.find((r) => r.id === picked.id);

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

      <main className="mx-auto max-w-6xl space-y-5 px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[16rem] flex-1">
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">{t("receipts.title")}</h1>
            <p className="mt-1 text-slate-600">{t("receipts.subtitle")}</p>
          </div>
          <Button onClick={sendSummary} disabled={!!busy || !counts.all}>
            {busy === "summary" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 rtl:-scale-x-100" />}{t("receipts.sendSummary")}
          </Button>
          <Button variant="ghost" onClick={() => scan(false)} disabled={!!busy}>
            <RefreshCw className={`h-4 w-4 ${busy === "scan" ? "animate-spin" : ""}`} />{t("receipts.scan")}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-full bg-surface p-1 shadow-sm ring-1 ring-slate-200">
            <button type="button" onClick={() => go(-1)} aria-label={t("receipts.prevMonth")} className="grid h-8 w-8 place-items-center rounded-full text-slate-600 hover:bg-slate-100"><ChevronRight className="h-4 w-4 ltr:rotate-180" /></button>
            <span className="min-w-[8.5rem] text-center text-sm font-bold text-slate-900">{monthTitle(month, locale)}</span>
            <button type="button" onClick={() => go(1)} disabled={month >= monthKeyOf()} aria-label={t("receipts.nextMonth")} className="grid h-8 w-8 place-items-center rounded-full text-slate-600 hover:bg-slate-100 disabled:opacity-30"><ChevronLeft className="h-4 w-4 ltr:rotate-180" /></button>
          </div>
          <span className="mx-1 h-6 w-px bg-slate-200" />
          {[["all", null], ["ranilix", "Ranilix"], ["gmail", "Gmail"]].map(([id, name]) => (
            <button key={id} type="button" onClick={() => setSource(id)} aria-pressed={source === id}
              className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition ${source === id ? "border-brand-200 bg-brand-50 text-brand-700" : "border-slate-200 bg-surface text-slate-700 hover:bg-slate-50"}`}>
              {id !== "all" && <span className="h-2 w-2 rounded-full" style={{ background: SOURCE_DOT[id] }} />}
              {name || t("receipts.all")} · {counts[id]}
            </button>
          ))}
        </div>

        {error ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
          : !data ? <div className="grid place-items-center py-24 text-slate-400"><Loader2 className="h-8 w-8 animate-spin" /></div>
          : (
            <>
              <section className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                <div className="rounded-2xl bg-ink p-5 text-white">
                  <p className="text-sm text-white/70">{t("receipts.spent")}</p>
                  <p className="mt-1 text-4xl font-black tracking-tight"><bdi dir="ltr">{fmt(ils, "ILS")}</bdi></p>
                  {others.map(([c, v]) => <p key={c} className="text-sm text-white/80">+ <bdi dir="ltr">{fmt(v, c)}</bdi></p>)}
                  {data.prevTotal > 0 && (
                    <p className={`mt-2 text-sm ${diff > 0 ? "text-rose-300" : "text-emerald-300"}`}>
                      {t(diff > 0 ? "receipts.more" : "receipts.less", { amount: fmt(Math.abs(diff), "ILS") })}
                    </p>
                  )}
                </div>
                <div className="rounded-2xl border border-slate-200 bg-surface p-5">
                  <p className="text-sm font-bold text-slate-900">{t("receipts.byCategory")}</p>
                  {data.byCategory.length === 0 ? <p className="mt-3 text-sm text-slate-500">{t("receipts.noData")}</p> : (
                    <ul className="mt-3 space-y-2">
                      {data.byCategory.map((c) => (
                        <li key={c.category} className="grid grid-cols-[7.5rem_minmax(0,1fr)_6.5rem] items-center gap-3 text-sm">
                          <span className="flex items-center gap-2 font-semibold text-slate-700"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: CAT_STYLE[c.category]?.bar }} />{t(`receipts.cat.${c.category}`)}</span>
                          <span className="h-2.5 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full" style={{ width: `${Math.max(4, (c.amount / maxCat) * 100)}%`, background: CAT_STYLE[c.category]?.bar }} /></span>
                          <span className="text-end font-bold text-slate-900"><bdi dir="ltr">{fmt(c.amount, "ILS")}</bdi></span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>

              <div className="flex flex-wrap items-start gap-4">
                <section aria-label={t("receipts.title")} className="min-w-0 flex-[999_1_560px] overflow-hidden rounded-2xl border border-slate-200 bg-surface">
                  {rows.length === 0 ? (
                    <div className="px-6 py-16 text-center">
                      <p className="font-bold text-slate-900">{busy === "scan" ? t("receipts.scanning") : t("receipts.empty")}</p>
                      <p className="mt-1 text-sm text-slate-500">{t("receipts.emptyHint")}</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[620px] border-collapse text-sm">
                        <thead>
                          <tr className="bg-slate-50 text-xs text-slate-500">
                            <th scope="col" className="px-4 py-3 text-start font-bold">{t("receipts.store")}</th>
                            <th scope="col" className="px-2 py-3 text-start font-bold">{t("receipts.category")}</th>
                            <th scope="col" className="px-2 py-3 text-start font-bold">{t("receipts.from")}</th>
                            <th scope="col" className="px-2 py-3 text-start font-bold">{t("receipts.date")}</th>
                            <th scope="col" className="px-4 py-3 text-end font-bold">{t("receipts.amount")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((r) => (
                            <tr key={r.id} className={`border-t border-slate-100 ${sel?.id === r.id ? "bg-brand-50" : "hover:bg-slate-50"}`}>
                              <td className="px-4 py-2.5">
                                <button type="button" onClick={() => setPicked(r)} className="flex w-full items-center gap-3 text-start">
                                  <StoreLogo store={r.store} domain={r.domain} size={36} />
                                  <span className="min-w-0">
                                    <span className="block truncate font-bold text-slate-900"><bdi>{r.store}</bdi></span>
                                    <span className="block max-w-[16rem] truncate text-xs text-slate-500"><bdi>{r.what}</bdi></span>
                                  </span>
                                </button>
                              </td>
                              <td className="px-2 py-2.5"><span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${CAT_STYLE[r.category]?.chip}`}>{t(`receipts.cat.${r.category}`)}</span></td>
                              <td className="px-2 py-2.5 text-slate-600"><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: SOURCE_DOT[r.source] }} />{r.source === "gmail" ? "Gmail" : "Ranilix"}{r.files > 0 && <Paperclip className="h-3.5 w-3.5 text-slate-400" aria-label={t("receipts.hasFile")} />}</span></td>
                              <td className="px-2 py-2.5 text-slate-600">{date(r.date)}</td>
                              <td className="px-4 py-2.5 text-end font-extrabold text-slate-900"><bdi dir="ltr">{fmt(r.amount, r.currency)}</bdi></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-4 md:max-w-sm">
                  {sel && (
                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-surface shadow-lg">
                      <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
                        <StoreLogo store={sel.store} domain={sel.domain} size={36} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-extrabold text-slate-900"><bdi>{sel.store}</bdi></p>
                          <p className="text-xs text-slate-500">{new Date(sel.date).toLocaleString(locale, { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</p>
                        </div>
                        <span className="text-lg font-extrabold"><bdi dir="ltr">{fmt(sel.amount, sel.currency)}</bdi></span>
                        <button type="button" onClick={() => setPicked(null)} aria-label={t("shared.close")} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
                      </div>
                      <div className="space-y-3 px-4 py-4 text-sm">
                        <p className="text-slate-600"><bdi>{sel.what}</bdi></p>
                        <label className="flex items-center justify-between gap-3">
                          <span className="text-slate-500">{t("receipts.category")}</span>
                          <select value={sel.category} onChange={(e) => change(sel, { category: e.target.value })}
                            className="rounded-lg border border-slate-300 bg-surface px-2 py-1.5 font-semibold text-slate-800">
                            {CATS.map((c) => <option key={c} value={c}>{t(`receipts.cat.${c}`)}</option>)}
                          </select>
                        </label>
                        <p className="flex items-center justify-between"><span className="text-slate-500">{t("receipts.from")}</span><span className="font-semibold">{sel.source === "gmail" ? `Gmail${typeof data.gmail === "string" ? ` · ${data.gmail}` : ""}` : "Ranilix"}</span></p>
                        {sel.files > 0 && <p className="flex items-center justify-between"><span className="text-slate-500">{t("receipts.file")}</span><span className="inline-flex items-center gap-1 font-semibold text-brand-700"><Paperclip className="h-3.5 w-3.5" />{t("receipts.files", { n: sel.files })}</span></p>}
                        <div className="flex gap-2 pt-1">
                          {sel.source === "ranilix" && sel.messageId
                            ? <Link to={`/inbox?open=${sel.messageId}`} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-3 py-2.5 font-bold text-white hover:bg-brand-500"><Mail className="h-4 w-4" />{t("receipts.openMail")}</Link>
                            : sel.gmailId && <a href={`https://mail.google.com/mail/u/0/#all/${sel.gmailId}`} target="_blank" rel="noopener noreferrer" className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-3 py-2.5 font-bold text-white hover:bg-brand-500"><Mail className="h-4 w-4" />{t("receipts.openGmail")}</a>}
                          <Button variant="ghost" onClick={() => change(sel, { hidden: true })}><EyeOff className="h-4 w-4" />{t("receipts.hide")}</Button>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="rounded-2xl border border-slate-200 bg-surface p-4">
                    <Toggle id="monthly-summary" checked={!!data.summaryOn} onChange={setSummary} label={t("receipts.monthly")} description={t("receipts.monthlyHint")} />
                  </div>

                  <div className="flex gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900">
                    <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <p>{data.gmail ? t("receipts.how") : t("receipts.howNoGmail")}</p>
                  </div>
                </aside>
              </div>
            </>
          )}
      </main>

      {toast && <div role="status" className="fixed bottom-6 left-1/2 z-50 max-w-[90vw] -translate-x-1/2 rounded-xl bg-ink px-5 py-3 text-sm font-medium text-white shadow-lg">{toast}</div>}
    </div>
  );
}
