import { Link } from "react-router-dom";
import { Mail } from "lucide-react";
import { BRAND } from "../config.js";

export default function Logo({ className = "" }) {
  return (
    <Link to="/" className={`inline-flex items-center gap-2 ${className}`} aria-label={`${BRAND.name} home`}>
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-md shadow-brand-500/30">
        <Mail className="h-5 w-5" strokeWidth={2.25} />
      </span>
      <span className="text-lg font-extrabold tracking-tight text-slate-900">
        {BRAND.short}
        <span className="ml-1 rounded-md bg-emerald-100 px-1.5 py-0.5 text-xs font-bold uppercase tracking-wide text-emerald-700">
          Free
        </span>
      </span>
    </Link>
  );
}
