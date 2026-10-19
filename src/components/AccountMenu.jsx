import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Check, LogOut, UserPlus } from "lucide-react";
import SenderAvatar from "./SenderAvatar.jsx";
import { getAccounts, switchAccount } from "../lib/session.js";
import { useI18n } from "../lib/i18n.jsx";

/** Avatar button in the inbox top bar: shows saved accounts, switch between them, add one, sign out. */
export default function AccountMenu({ email, onLogout }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const accounts = getAccounts();
  const others = accounts.filter((a) => a.email !== email);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const item = "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start text-sm font-medium text-slate-700 hover:bg-slate-100";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-full focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("accounts.menu")}
        title={email}
      >
        <SenderAvatar name={email} email={email} size={36} />
        {others.length > 0 && (
          <span className="absolute -bottom-0.5 -end-0.5 grid h-4 min-w-4 place-items-center rounded-full border-2 border-surface bg-slate-700 px-0.5 text-[9px] font-bold text-white">
            {accounts.length}
          </span>
        )}
      </button>

      {open && (
        <div role="menu" className="absolute end-0 top-12 z-50 w-72 max-w-[calc(100vw-1.5rem)] rounded-2xl border border-slate-200 bg-surface p-2 shadow-2xl">
          <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
            <SenderAvatar name={email} email={email} size={40} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-slate-500">{t("accounts.current")}</p>
              <p dir="ltr" className="truncate text-sm font-semibold text-slate-900 rtl:text-right">{email}</p>
            </div>
            <Check className="h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
          </div>

          {others.length > 0 && (
            <div className="mt-2 border-t border-slate-100 pt-2">
              <p className="px-3 pb-1 text-xs font-semibold text-slate-500">{t("accounts.switchTo")}</p>
              {others.map((a) => (
                <button key={a.email} type="button" role="menuitem" className={item} onClick={() => { setOpen(false); switchAccount(a.email); }}>
                  <SenderAvatar name={a.email} email={a.email} size={32} />
                  <span dir="ltr" className="min-w-0 flex-1 truncate rtl:text-right">{a.email}</span>
                </button>
              ))}
            </div>
          )}

          <div className="mt-2 space-y-0.5 border-t border-slate-100 pt-2">
            <Link to="/login?add=1" role="menuitem" className={item} onClick={() => setOpen(false)}>
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700"><UserPlus className="h-4 w-4" /></span>
              {t("accounts.add")}
            </Link>
            <button type="button" role="menuitem" className={item} onClick={() => { setOpen(false); onLogout(); }}>
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600"><LogOut className="h-4 w-4 rtl:rotate-180" /></span>
              <span className="min-w-0">
                {t("inbox.logout")}
                {others.length > 0 && <span dir="ltr" className="block truncate text-xs font-normal text-slate-500 rtl:text-right">{email}</span>}
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
