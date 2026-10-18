import { CheckCircle2, ShieldCheck } from "lucide-react";
import Logo from "./Logo.jsx";
import Preferences from "./Preferences.jsx";
import { useI18n } from "../lib/i18n.jsx";

/** Two-column shell for auth pages: form on one side, reassurance panel on the other (desktop). */
export default function AuthLayout({ title, subtitle, children, footer }) {
  const { t } = useI18n();
  return (
    <div className="grid min-h-screen bg-surface lg:grid-cols-2">
      <div className="flex flex-col px-4 py-6 sm:px-8">
        <div className="flex items-center justify-between gap-2">
          <Logo />
          <Preferences />
        </div>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">{title}</h1>
          {subtitle && <p className="mt-2 text-slate-600">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-8 text-center text-sm text-slate-600">{footer}</div>}
        </div>
      </div>

      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-brand-600 to-brand-900 lg:flex lg:items-center lg:justify-center">
        <div className="absolute -end-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-32 -start-16 h-96 w-96 rounded-full bg-sky-400/20 blur-3xl" />
        <div className="relative max-w-md px-10 text-white">
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-white/15">
            <ShieldCheck className="h-6 w-6" />
          </span>
          <h2 className="mt-6 text-3xl font-extrabold leading-tight">{t("auth.asideTitle")}</h2>
          <ul className="mt-8 space-y-4 text-white/90">
            {t("auth.asidePoints").map((p) => (
              <li key={p} className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-300" /> {p}
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
