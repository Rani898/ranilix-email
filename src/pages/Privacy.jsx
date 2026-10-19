import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import Navbar from "../components/Navbar.jsx";
import Footer from "../components/Footer.jsx";
import { BRAND } from "../config.js";
import { useI18n } from "../lib/i18n.jsx";

const CONTACT = `rani@${BRAND.domain}`;

/** Public privacy policy (also the page Google links to from its sign-in screen). */
export default function Privacy() {
  const { t } = useI18n();
  const sections = t("privacy.sections");

  useEffect(() => {
    const original = document.title;
    document.title = `${t("privacy.title")} · ${BRAND.short}`;
    return () => { document.title = original; };
  }, [t]);

  return (
    <div className="min-h-screen bg-surface">
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {t("privacy.back")}
        </Link>
        <div className="mt-6 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-700"><ShieldCheck className="h-6 w-6" /></span>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">{t("privacy.title")}</h1>
        </div>
        <p className="mt-3 text-sm text-slate-500">{t("privacy.updated")}</p>
        <p className="mt-6 leading-relaxed text-slate-700">{t("privacy.intro")}</p>
        {Array.isArray(sections) && sections.map((s) => (
          <section key={s.h} className="mt-10">
            <h2 className="text-xl font-bold text-slate-900">{s.h}</h2>
            {s.p.map((para, i) => (
              <p key={i} className="mt-3 leading-relaxed text-slate-700">
                {para.includes("{email}")
                  ? para.split("{email}").map((part, j) => (j ? [<a key={j} href={`mailto:${CONTACT}`} dir="ltr" className="font-semibold text-brand-600 hover:text-brand-700">{CONTACT}</a>, part] : part))
                  : para}
              </p>
            ))}
          </section>
        ))}
      </main>
      <Footer />
    </div>
  );
}
