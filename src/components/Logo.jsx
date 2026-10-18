import { Link } from "react-router-dom";
import { BRAND } from "../config.js";
import { useI18n } from "../lib/i18n.jsx";
import LogoMark from "./LogoMark.jsx";

export default function Logo({ className = "" }) {
  const { t } = useI18n();
  return (
    <Link to="/" dir="ltr" className={`inline-flex items-center gap-2.5 ${className}`} aria-label={t("nav.home", { name: BRAND.name })}>
      <LogoMark size={36} />
      <span className="font-display text-xl font-extrabold tracking-[-0.03em] text-slate-900">{BRAND.short}</span>
      <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
        Free
      </span>
    </Link>
  );
}
