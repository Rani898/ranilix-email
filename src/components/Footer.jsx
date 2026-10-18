import { Link } from "react-router-dom";
import Logo from "./Logo.jsx";
import { BRAND } from "../config.js";
import { useI18n } from "../lib/i18n.jsx";

export default function Footer() {
  const { t } = useI18n();
  return (
    <footer className="border-t border-slate-200 bg-slate-50">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-2">
          <Logo />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-600">{t("footer.blurb")}</p>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{t("footer.product")}</h3>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            <li><a href="#features" className="hover:text-slate-900">{t("nav.features")}</a></li>
            <li><a href="#security" className="hover:text-slate-900">{t("footer.privacy")}</a></li>
            <li><a href="#faq" className="hover:text-slate-900">{t("nav.faq")}</a></li>
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{t("footer.account")}</h3>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            <li><Link to="/signup" className="hover:text-slate-900">{t("footer.create")}</Link></li>
            <li><Link to="/login" className="hover:text-slate-900">{t("nav.login")}</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-slate-200">
        <p className="mx-auto max-w-6xl px-4 py-6 text-xs text-slate-500 sm:px-6">
          {t("footer.rights", { year: new Date().getFullYear(), name: BRAND.name })}
        </p>
      </div>
    </footer>
  );
}
