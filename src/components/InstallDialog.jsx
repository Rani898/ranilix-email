import { Share, SquarePlus } from "lucide-react";
import { Button, Modal } from "./ui.jsx";
import { useI18n } from "../lib/i18n.jsx";

/** Shown when the browser can't install the app with one click (iPhone/iPad, Firefox…). */
export default function InstallDialog({ ios, onClose }) {
  const { t } = useI18n();
  const steps = ios
    ? [
        [Share, t("install.iosStep1")],
        [SquarePlus, t("install.iosStep2")],
        [null, t("install.iosStep3")],
      ]
    : [[null, t("install.otherStep")]];
  return (
    <Modal title={t("install.title")} onClose={onClose} footer={<Button onClick={onClose}>{t("install.ok")}</Button>}>
      <p>{t("install.intro")}</p>
      <ol className="mt-4 space-y-3">
        {steps.map(([Icon, text], i) => (
          <li key={i} className="flex items-start gap-3">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-50 text-sm font-bold text-brand-700">{i + 1}</span>
            <span className="pt-0.5 text-slate-700">{text} {Icon && <Icon className="mx-1 inline h-4 w-4 align-[-2px] text-brand-600" aria-hidden="true" />}</span>
          </li>
        ))}
      </ol>
    </Modal>
  );
}
