import { useState } from "react";
import { ArrowLeft, Check } from "lucide-react";
import { useI18n } from "../lib/i18n.jsx";
import { useTheme } from "../lib/theme.jsx";
import LogoMark from "./LogoMark.jsx";

const KEY = "ranilix.onboarded";

export function needsOnboarding() {
  try { return !localStorage.getItem(KEY); } catch { return false; }
}

/** Mini page sketch used on the theme cards. Colors are literal on purpose: each card shows one theme. */
function ThemeSketch({ dark }) {
  const c = dark
    ? { bg: "#0b1018", card: "#121826", line: "#263042", text: "#eef2f7", muted: "#3a465c" }
    : { bg: "#f8fafc", card: "#ffffff", line: "#e2e8f0", text: "#0f172a", muted: "#cbd5e1" };
  return (
    <div className="w-full overflow-hidden rounded-xl border" style={{ background: c.bg, borderColor: c.line }} aria-hidden="true">
      <div className="flex items-center gap-1.5 border-b px-3 py-2" style={{ background: c.card, borderColor: c.line }}>
        <span className="h-3 w-3 rounded" style={{ background: "#2547ea" }} />
        <span className="h-1.5 w-12 rounded-full" style={{ background: c.text }} />
      </div>
      <div className="space-y-2 p-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-2 rounded-lg p-2" style={{ background: c.card }}>
            <span className="h-5 w-5 shrink-0 rounded-full" style={{ background: ["#3b66f5", "#10b981", "#f59e0b"][i] }} />
            <span className="flex-1 space-y-1">
              <span className="block h-1.5 w-2/3 rounded-full" style={{ background: c.text }} />
              <span className="block h-1.5 w-full rounded-full" style={{ background: c.muted }} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** First-visit setup: pick a language, then light or dark. Shown once per browser. */
export default function Onboarding({ onDone }) {
  const { t, setLang } = useI18n();
  const { setTheme } = useTheme();
  const [step, setStep] = useState(1);

  const pickLang = (lang) => { setLang(lang); setStep(2); };
  const pickTheme = (theme) => {
    setTheme(theme);
    try { localStorage.setItem(KEY, "1"); } catch { /* ignore */ }
    onDone();
  };

  const tile = "group flex flex-col items-center gap-3 rounded-2xl border-2 border-slate-200 bg-surface p-5 text-center transition hover:border-brand-500 hover:shadow-lg focus-visible:border-brand-500 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-50/95 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-surface p-6 shadow-2xl sm:p-8">
        <div className="flex items-center justify-between">
          <div dir="ltr" className="flex items-center gap-2">
            <LogoMark size={32} />
            <span className="font-display text-lg font-extrabold tracking-[-0.03em] text-slate-900">Ranilix</span>
          </div>
          <div className="flex items-center gap-1.5" aria-label={`${step} / 2`}>
            {[1, 2].map((n) => (
              <span key={n} className={`h-1.5 rounded-full transition-all ${n === step ? "w-6 bg-brand-600" : n < step ? "w-3 bg-brand-300" : "w-3 bg-slate-200"}`} />
            ))}
          </div>
        </div>

        {step === 1 ? (
          <>
            <h1 id="onboarding-title" className="mt-8 text-center text-2xl font-extrabold tracking-tight text-slate-900">
              <span className="block" dir="ltr">Choose your language</span>
              <span className="mt-1 block" dir="rtl" lang="he">בחרו את השפה שלכם</span>
            </h1>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <button type="button" onClick={() => pickLang("en")} className={tile} lang="en" dir="ltr">
                <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 font-display text-xl font-extrabold text-brand-700">EN</span>
                <span className="text-lg font-bold text-slate-900">English</span>
              </button>
              <button type="button" onClick={() => pickLang("he")} className={tile} lang="he" dir="rtl">
                <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-xl font-extrabold text-brand-700">עב</span>
                <span className="text-lg font-bold text-slate-900">עברית</span>
              </button>
            </div>
          </>
        ) : (
          <>
            <h1 id="onboarding-title" className="mt-8 text-center text-2xl font-extrabold tracking-tight text-slate-900">{t("onboarding.themeTitle")}</h1>
            <p className="mt-2 text-center text-sm text-slate-500">{t("onboarding.themeHint")}</p>
            <div className="mt-8 grid grid-cols-2 gap-4">
              {[
                { id: "light", dark: false },
                { id: "dark", dark: true },
              ].map((o) => (
                <button key={o.id} type="button" onClick={() => pickTheme(o.id)} className={tile}>
                  <ThemeSketch dark={o.dark} />
                  <span className="inline-flex items-center gap-1.5 text-base font-bold text-slate-900">
                    {t(`onboarding.${o.id}`)}
                    <Check className="h-4 w-4 text-brand-600 opacity-0 transition group-hover:opacity-100" aria-hidden="true" />
                  </span>
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setStep(1)} className="mx-auto mt-6 flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">
              <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" /> {t("onboarding.back")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
