import { useState } from "react";
import { useLocation } from "react-router-dom";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button, Modal } from "./ui.jsx";
import { sendReport } from "../lib/api.js";
import { useErrorText, useI18n } from "../lib/i18n.jsx";

const CATEGORIES = ["bug", "idea", "spam", "account", "other"];

/** "Report a problem": the message goes to the admin panel. */
export default function ReportDialog({ onClose }) {
  const { t } = useI18n();
  const errorText = useErrorText();
  const { pathname } = useLocation();
  const [category, setCategory] = useState("bug");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await sendReport({ category, message, page: pathname });
      setSent(true);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <Modal title={t("report.thanksTitle")} onClose={onClose} footer={<Button onClick={onClose}>{t("report.close")}</Button>}>
        <p className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /> {t("report.thanksText")}</p>
      </Modal>
    );
  }

  return (
    <Modal
      title={t("report.title")}
      onClose={onClose}
      footer={<>
        <Button variant="ghost" onClick={onClose}>{t("report.cancel")}</Button>
        <Button onClick={submit} disabled={busy || message.trim().length < 5}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{t("report.send")}</Button>
      </>}
    >
      <p>{t("report.intro")}</p>
      <fieldset className="mt-4">
        <legend className="text-sm font-semibold text-slate-800">{t("report.category")}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${category === c ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-300 text-slate-700 hover:bg-slate-100"}`}
            >
              {t(`report.categories.${c}`)}
            </button>
          ))}
        </div>
      </fieldset>
      <label htmlFor="report-message" className="mt-4 block text-sm font-semibold text-slate-800">{t("report.message")}</label>
      <textarea
        id="report-message"
        dir="auto"
        rows={5}
        maxLength={3000}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={t("report.placeholder")}
        className="mt-1.5 w-full resize-y rounded-xl border border-slate-300 bg-surface px-3 py-2.5 text-sm leading-relaxed text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100"
      />
      {error && <p role="alert" className="mt-2 text-rose-600">{error}</p>}
    </Modal>
  );
}
