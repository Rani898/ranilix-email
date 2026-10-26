import { useEffect, useState } from "react";
import { Check, Copy, Hourglass, Loader2, Plus, Timer, Trash2 } from "lucide-react";
import { Button, Modal } from "./ui.jsx";
import { useErrorText, useI18n } from "../lib/i18n.jsx";
import { tempCreate, tempDelete, tempExtend, tempList } from "../lib/api.js";

const DURATIONS = [1, 24, 168, 720];

function useLeft() {
  const { t } = useI18n();
  return (ts) => {
    const ms = ts - Date.now();
    if (ms <= 0) return t("temp.expired");
    const h = Math.floor(ms / 3600_000);
    if (h >= 48) return t("temp.leftDays", { n: Math.round(h / 24) });
    if (h >= 1) return t("temp.leftHours", { n: h });
    return t("temp.leftMinutes", { n: Math.max(1, Math.round(ms / 60_000)) });
  };
}

/** Create and manage temporary addresses (tmp-xxxxxxxx@ranilix.com) that forward to this inbox until they expire. */
export default function TempAddressesDialog({ onClose }) {
  const { t } = useI18n();
  const errorText = useErrorText();
  const left = useLeft();
  const [data, setData] = useState(null);
  const [hours, setHours] = useState(24);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [, tick] = useState(0);

  const load = () => tempList().then(setData).catch((e) => setError(errorText(e)));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const timer = setInterval(() => tick((n) => n + 1), 30_000); return () => clearInterval(timer); }, []);

  const copy = async (address) => {
    try { await navigator.clipboard.writeText(address); } catch { /* the address is visible anyway */ }
    setCopied(address);
    setTimeout(() => setCopied(""), 2000);
  };
  const create = async () => {
    setBusy(true); setError("");
    try {
      const a = await tempCreate(hours, label);
      setLabel("");
      await load();
      copy(a.address);
    } catch (e) { setError(errorText(e)); }
    setBusy(false);
  };
  const act = async (fn) => { setError(""); try { await fn(); await load(); } catch (e) { setError(errorText(e)); } };

  const list = data?.addresses || [];
  const full = data && list.length >= data.max;

  return (
    <Modal title={t("temp.title")} onClose={onClose} footer={<Button variant="ghost" onClick={onClose}>{t("temp.close")}</Button>}>
      <p>{t("temp.intro")}</p>
      {!data ? (
        error ? <p role="alert" className="mt-4 text-rose-600">{error}</p> : <div className="grid place-items-center py-10 text-slate-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : !data.allowed ? (
        <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">{t("temp.notAllowed")}</p>
      ) : (
        <>
          <div className="mt-4 rounded-2xl border border-slate-200 p-4">
            <p className="text-sm font-semibold text-slate-800">{t("temp.howLong")}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {DURATIONS.map((h) => (
                <button key={h} type="button" aria-pressed={hours === h} onClick={() => setHours(h)}
                  className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${hours === h ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 bg-surface text-slate-700 hover:border-brand-400"}`}>
                  {t(`temp.durations.${h}`)}
                </button>
              ))}
            </div>
            <label htmlFor="temp-label" className="mt-3 block text-sm font-semibold text-slate-800">{t("temp.label")}</label>
            <input id="temp-label" value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} placeholder={t("temp.labelPlaceholder")}
              className="mt-1.5 w-full rounded-xl border border-slate-300 bg-surface px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100" />
            <Button className="mt-3 w-full" onClick={create} disabled={busy || full}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} {full ? t("temp.full", { max: data.max }) : t("temp.create")}
            </Button>
          </div>

          {error && <p role="alert" className="mt-3 text-sm text-rose-600">{error}</p>}

          <p className="mt-5 text-sm font-semibold text-slate-800">{t("temp.active", { n: list.length, max: data.max })}</p>
          {list.length === 0 ? (
            <p className="mt-2 rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">{t("temp.none")}</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {list.map((a) => {
                const soon = a.expiresAt - Date.now() < 3600_000;
                return (
                  <li key={a.address} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-center gap-2">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-violet-50 text-violet-700"><Hourglass className="h-4 w-4" /></span>
                      <div className="min-w-0 flex-1">
                        <p dir="ltr" className="truncate font-mono text-sm font-semibold text-slate-900 rtl:text-right">{a.address}</p>
                        <p className="truncate text-xs text-slate-500">
                          {a.label && <><bdi>{a.label}</bdi> · </>}
                          <span className={soon ? "font-semibold text-rose-600" : ""}>{left(a.expiresAt)}</span> · {t("temp.received", { n: a.received })}
                        </p>
                      </div>
                      <button type="button" onClick={() => copy(a.address)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label={t("temp.copy")} title={t("temp.copy")}>
                        {copied === a.address ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                      </button>
                      <button type="button" onClick={() => act(() => tempExtend(a.address, 24))} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label={t("temp.extend")} title={t("temp.extend")}>
                        <Timer className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => act(() => tempDelete(a.address))} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600" aria-label={t("temp.delete")} title={t("temp.delete")}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    {copied === a.address && <p role="status" className="mt-1 text-xs font-semibold text-emerald-700">{t("temp.copied")}</p>}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-4 text-xs leading-relaxed text-slate-500">{t("temp.privacy")}</p>
        </>
      )}
    </Modal>
  );
}
