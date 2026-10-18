import { Link } from "react-router-dom";
import { BRAND } from "../config.js";
import LogoMark from "./LogoMark.jsx";

export default function Logo({ className = "", dark = false }) {
  return (
    <Link to="/" className={`inline-flex items-center gap-2.5 ${className}`} aria-label={`${BRAND.name} home`}>
      <LogoMark size={36} />
      <span className={`font-display text-xl font-extrabold tracking-[-0.03em] ${dark ? "text-white" : "text-slate-900"}`}>
        {BRAND.short}
      </span>
      <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
        Free
      </span>
    </Link>
  );
}
