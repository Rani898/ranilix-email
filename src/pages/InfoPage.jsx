import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, FileText, Info, Mail, ShieldCheck } from "lucide-react";
import Navbar from "../components/Navbar.jsx";
import Footer from "../components/Footer.jsx";
import { BRAND } from "../config.js";
import { useI18n } from "../lib/i18n.jsx";

const CONTACT = `rani@${BRAND.domain}`;
const ICONS = { about: Info, security: ShieldCheck, terms: FileText, contact: Mail };

/** Trust pages: /about, /security, /terms, /contact. Text lives in i18n under info.<page>. */
export default function InfoPage() {
  const { t } = useI18n();
  const page = useLocation().pathname.replace(/^\/+|\/+$/g, "");
  const key = ICONS[page] ? page : "about";
  const Icon = ICONS[key];
  const c = t(`info.${key}`);

  useEffect(() => {
    const original = document.title;
    document.title = `${c.title} · ${BRAND.short}`;
    return () => { document.title = original; };
  }, [c.title]);

  const mail = <a href={`mailto:${CONTACT}`} dir="ltr" className="font-semibold text-brand-600 hover:text-brand-700">{CONTACT}</a>;
  const para = (text) => (text.includes("{email}") ? text.split("{email}").flatMap((part, j) => (j ? [<span key={j}>{mail}</span>, part] : [part])) : text);

  return (
    <div className="min-h-screen bg-surface">
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {t("info.back")}
        </Link>
        <div className="mt-6 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-700"><Icon className="h-6 w-6" /></span>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">{c.title}</h1>
        </div>
        {key === "terms" && <p className="mt-3 text-sm text-slate-500">{t("info.updated")}</p>}
        <p className="mt-6 text-lg leading-relaxed text-slate-700">{c.intro}</p>
        {c.sections.map((s) => (
          <section key={s.h} className="mt-10">
            <h2 className="text-xl font-bold text-slate-900">{s.h}</h2>
            {s.p.map((text, i) => <p key={i} className="mt-3 leading-relaxed text-slate-700">{para(text)}</p>)}
          </section>
        ))}
      </main>
      <Footer />
    </div>
  );
}
