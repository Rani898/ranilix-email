import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import Logo from "./Logo.jsx";
import Preferences from "./Preferences.jsx";
import { getSession } from "../lib/session.js";
import { useI18n } from "../lib/i18n.jsx";

export default function Navbar() {
  const { t } = useI18n();
  // Section links (#features…) live on the home page; from other pages they go there first.
  const onHome = useLocation().pathname === "/";
  const sec = (h) => (onHome ? h : `${import.meta.env.BASE_URL}${h}`);
  const [open, setOpen] = useState(false);
  const signedIn = !!getSession();
  const links = [
    { href: "#features", label: t("nav.features") },
    { href: "#security", label: t("nav.privacy") },
    { href: "#how", label: t("nav.how") },
    { href: "#faq", label: t("nav.faq") },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-surface/80 backdrop-blur-lg">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />

        <ul className="hidden items-center gap-7 lg:flex">
          {links.map((l) => (
            <li key={l.href}>
              <a href={sec(l.href)} className="text-sm font-medium text-slate-600 transition hover:text-slate-900">
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="hidden items-center gap-2 md:flex">
          <Preferences />
          <Link to={signedIn ? "/inbox" : "/login"} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100">
            {signedIn ? t("nav.openInbox") : t("nav.login")}
          </Link>
          <Link
            to="/signup"
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            {t("nav.getFree")}
          </Link>
        </div>

        <div className="flex items-center gap-1 md:hidden">
          <Preferences compact />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded-lg p-2 text-slate-700 hover:bg-slate-100"
            aria-label={open ? t("nav.closeMenu") : t("nav.openMenu")}
            aria-expanded={open}
          >
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </nav>

      {open && (
        <div className="border-t border-slate-200 bg-surface px-4 pb-6 pt-2 md:hidden">
          <ul className="flex flex-col">
            {links.map((l) => (
              <li key={l.href}>
                <a href={sec(l.href)} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-3 text-base font-medium text-slate-700 hover:bg-slate-50">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-4 grid gap-2">
            <Link to={signedIn ? "/inbox" : "/login"} className="rounded-lg border border-slate-300 px-4 py-3 text-center font-semibold text-slate-700">
              {signedIn ? t("nav.openInbox") : t("nav.login")}
            </Link>
            <Link to="/signup" className="rounded-lg bg-brand-600 px-4 py-3 text-center font-semibold text-white">
              {t("nav.getFree")}
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
