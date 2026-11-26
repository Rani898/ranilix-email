import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, Ban, BookOpen, Check, Hourglass, KeyRound, Languages, Mail, PhoneOff, Repeat, ShieldCheck } from "lucide-react";
import Navbar from "../components/Navbar.jsx";
import Footer from "../components/Footer.jsx";
import { BRAND } from "../config.js";
import { useI18n } from "../lib/i18n.jsx";
import { GUIDES_INDEX, SEO_PAGES, SITE, pageBySlug } from "../seo/pages.js";

// Addresses and domains inside Hebrew text keep their own left-to-right order.
const LTR_RE = /([\w.]*@[\w.]+\.\w+|[\w-]+\.(?:com|org))/g;
const bidi = (text) => String(text).split(LTR_RE).map((part, i) => (i % 2 ? <bdi key={i} dir="ltr">{part}</bdi> : part));

const ICONS = { Mail, PhoneOff, Hourglass, Repeat, ShieldCheck, Languages, BookOpen, Ban, KeyRound };

/** Keep the tab title / description in step with the page (the static copy already has them for Google). */
function useHead(title, description, slug) {
  useEffect(() => {
    const prevTitle = document.title;
    const meta = document.querySelector('meta[name="description"]');
    const prevDesc = meta?.getAttribute("content");
    const canon = document.querySelector('link[rel="canonical"]');
    const prevCanon = canon?.getAttribute("href");
    document.title = title;
    meta?.setAttribute("content", description);
    canon?.setAttribute("href", `${SITE}/${slug}`);
    return () => {
      document.title = prevTitle;
      if (prevDesc != null) meta?.setAttribute("content", prevDesc);
      if (prevCanon != null) canon?.setAttribute("href", prevCanon);
    };
  }, [title, description, slug]);
}

function Cta() {
  const { t } = useI18n();
  return (
    <div className="mt-12 rounded-2xl bg-gradient-to-br from-brand-600 to-[#5b3df5] p-6 text-white sm:p-8">
      <h2 className="text-2xl font-extrabold">{t("seo.ctaTitle")}</h2>
      <p className="mt-2 text-white/85">{t("seo.ctaText", { domain: BRAND.domain })}</p>
      <Link to="/signup" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 font-bold text-brand-700 hover:bg-brand-50">
        {t("seo.ctaButton")} <ArrowLeft className="h-4 w-4 ltr:rotate-180" />
      </Link>
      <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/85">
        {["seo.point1", "seo.point2", "seo.point3"].map((k) => <li key={k} className="flex items-center gap-1.5"><Check className="h-4 w-4" />{t(k)}</li>)}
      </ul>
    </div>
  );
}

function Related({ current, lang }) {
  const { t } = useI18n();
  const others = SEO_PAGES.filter((p) => p.slug !== current);
  return (
    <section className="mt-12">
      <h2 className="text-lg font-bold text-slate-900">{t("seo.related")}</h2>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {others.map((p) => (
          <li key={p.slug}><Link to={`/${p.slug}`} className="block rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 hover:border-brand-300 hover:text-brand-700">{p[lang].h1}</Link></li>
        ))}
      </ul>
    </section>
  );
}

function Faq({ items }) {
  const { t } = useI18n();
  if (!items?.length) return null;
  return (
    <section className="mt-12">
      <h2 className="text-xl font-bold text-slate-900">{t("seo.faq")}</h2>
      <div className="mt-4 divide-y divide-slate-200 rounded-2xl border border-slate-200">
        {items.map((f) => (
          <details key={f.q} className="group p-4">
            <summary className="cursor-pointer list-none font-semibold text-slate-900">{f.q}</summary>
            <p className="mt-2 leading-relaxed text-slate-700">{bidi(f.a)}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function GuidesIndex({ lang }) {
  const c = GUIDES_INDEX[lang];
  useHead(c.title, c.description, "guides");
  const guides = SEO_PAGES.filter((p) => p.kind === "guide");
  return (
    <>
      <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">{c.h1}</h1>
      <p className="mt-4 text-lg leading-relaxed text-slate-600">{bidi(c.lead)}</p>
      <ul className="mt-8 space-y-3">
        {guides.map((g) => {
          const Icon = ICONS[g.icon] || BookOpen;
          return (
            <li key={g.slug}>
              <Link to={`/${g.slug}`} className="flex items-start gap-4 rounded-2xl border border-slate-200 p-5 hover:border-brand-300">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><Icon className="h-5 w-5" /></span>
                <span><span className="block font-bold text-slate-900">{g[lang].h1}</span><span className="mt-1 block text-sm text-slate-600">{g[lang].description}</span></span>
              </Link>
            </li>
          );
        })}
      </ul>
      <Cta />
    </>
  );
}

function Article({ page, lang }) {
  const { t } = useI18n();
  const c = page[lang];
  useHead(c.title, c.description, page.slug);
  const Icon = ICONS[page.icon] || Mail;
  return (
    <article>
      {page.kind === "guide" && (
        <Link to="/guides" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {t("seo.allGuides")}
        </Link>
      )}
      <span className="mt-4 grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-700"><Icon className="h-6 w-6" /></span>
      <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">{c.h1}</h1>
      <p className="mt-4 text-lg leading-relaxed text-slate-600">{bidi(c.lead)}</p>
      {page.kind === "landing" && (
        <Link to="/signup" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-3 font-bold text-white hover:bg-brand-500">
          {t("seo.ctaButton")} <ArrowLeft className="h-4 w-4 ltr:rotate-180" />
        </Link>
      )}
      {c.sections?.map((s) => (
        <section key={s.h} className="mt-10">
          <h2 className="text-xl font-bold text-slate-900">{s.h}</h2>
          {s.p.map((para, i) => <p key={i} className="mt-3 leading-relaxed text-slate-700">{bidi(para)}</p>)}
        </section>
      ))}
      {c.steps && (
        <ol className="mt-10 space-y-6">
          {c.steps.map((s, i) => (
            <li key={s.h} className="flex gap-4">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-600 font-bold text-white">{i + 1}</span>
              <div><h2 className="text-lg font-bold text-slate-900">{s.h}</h2><p className="mt-1.5 leading-relaxed text-slate-700">{bidi(s.p)}</p></div>
            </li>
          ))}
        </ol>
      )}
      <Faq items={c.faq} />
      <Cta />
      {c.note && <p className="mt-6 text-xs text-slate-500">{c.note}</p>}
      <Related current={page.slug} lang={lang} />
    </article>
  );
}

/** Search pages (/free-email, /guides/…): content in src/seo/pages.js. */
export default function SeoPage() {
  const { lang } = useI18n();
  const slug = useLocation().pathname.replace(/^\/+|\/+$/g, "");
  const l = lang === "he" ? "he" : "en";
  const page = pageBySlug(slug);
  return (
    <div className="min-h-screen bg-surface">
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        {slug === "guides" || !page ? <GuidesIndex lang={l} /> : <Article page={page} lang={l} />}
      </main>
      <Footer />
    </div>
  );
}
