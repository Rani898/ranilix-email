import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  EyeOff,
  Inbox,
  Languages,
  Lock,
  Paperclip,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Timer,
  Zap,
} from "lucide-react";
import Navbar from "../components/Navbar.jsx";
import Footer from "../components/Footer.jsx";
import { BRAND } from "../config.js";
import { useI18n } from "../lib/i18n.jsx";
import { sanitizeUsername } from "../lib/validation.js";

const Arrow = () => <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />;

/* ---------- Hero ---------- */

function ClaimAddress() {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const navigate = useNavigate();

  const submit = (e) => {
    e.preventDefault();
    navigate(name ? `/signup?u=${encodeURIComponent(name)}` : "/signup");
  };

  return (
    <form onSubmit={submit} className="mt-8 w-full max-w-lg">
      <label htmlFor="claim" className="sr-only">{t("hero.claimLabel")}</label>
      <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-surface p-2 shadow-lg shadow-slate-900/5 sm:flex-row sm:items-center">
        <div dir="ltr" className="flex flex-1 items-center rounded-xl px-3">
          <input
            id="claim"
            value={name}
            onChange={(e) => setName(sanitizeUsername(e.target.value))}
            placeholder="yourname"
            autoComplete="off"
            className="w-full min-w-0 bg-transparent py-3 text-base font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
          <span className="shrink-0 text-base font-medium text-slate-500">@{BRAND.domain}</span>
        </div>
        <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-3 font-semibold text-white transition hover:bg-brand-500">
          {t("hero.claim")} <Arrow />
        </button>
      </div>
      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
        {["checkFree", "checkCard", "checkMinute"].map((k) => (
          <li key={k} className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" /> {t(`hero.${k}`)}
          </li>
        ))}
      </ul>
    </form>
  );
}

function InboxPreview() {
  const { t } = useI18n();
  const colors = ["bg-brand-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500"];
  const mails = t("preview.mails");

  return (
    <div className="relative mx-auto w-full max-w-md lg:max-w-none" aria-hidden="true">
      <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-tr from-brand-200/60 via-sky-100/60 to-emerald-100 blur-2xl dark:from-brand-200/40 dark:via-transparent dark:to-emerald-100/40" />
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-surface shadow-2xl shadow-slate-900/10">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          <span className="h-3 w-3 rounded-full bg-rose-400" />
          <span className="h-3 w-3 rounded-full bg-amber-400" />
          <span className="h-3 w-3 rounded-full bg-emerald-400" />
          <span dir="ltr" className="ms-3 truncate rounded-md bg-slate-100 px-3 py-1 text-xs text-slate-500">mail.{BRAND.domain}/inbox</span>
        </div>
        <div className="flex items-center justify-between px-5 pt-4">
          <div className="flex items-center gap-2">
            <Inbox className="h-5 w-5 text-brand-600" />
            <span className="font-semibold text-slate-900">{t("preview.inbox")}</span>
            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">{t("preview.newCount")}</span>
          </div>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
            <Lock className="h-3.5 w-3.5" /> {t("preview.encrypted")}
          </span>
        </div>
        <ul className="mt-3 divide-y divide-slate-100">
          {mails.map((m, i) => (
            <li key={m.subject} className={`flex items-center gap-3 px-5 py-3.5 ${i < 2 ? "bg-brand-50/40" : ""}`}>
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold text-white ${colors[i]}`}>{m.from[0]}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className={`truncate text-sm ${i < 2 ? "font-bold text-slate-900" : "font-medium text-slate-700"}`}>{m.from}</p>
                  <span className="shrink-0 text-xs text-slate-400">{m.time}</span>
                </div>
                <p className="truncate text-sm text-slate-500">{m.subject}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="absolute -bottom-5 -start-3 hidden items-center gap-2 rounded-xl border border-slate-200 bg-surface px-4 py-3 shadow-lg sm:flex">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-100 text-emerald-700">
          <CreditCard className="h-4 w-4" />
        </span>
        <div>
          <p className="text-xs text-slate-500">{t("preview.monthlyCost")}</p>
          <p className="text-sm font-bold text-slate-900">{t("preview.free")}</p>
        </div>
      </div>
    </div>
  );
}

function Hero() {
  const { t } = useI18n();
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 -z-10 h-[36rem] bg-gradient-to-b from-brand-50 to-surface" />
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 pb-20 pt-14 sm:px-6 md:pt-20 lg:grid-cols-2">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">
            <Sparkles className="h-4 w-4" /> {t("hero.badge")}
          </span>
          <h1 className="mt-5 text-4xl font-extrabold leading-[1.1] tracking-tight text-balance text-slate-900 sm:text-5xl lg:text-6xl">
            {t("hero.title1")}{" "}
            <span className="bg-gradient-to-r from-brand-600 to-sky-500 bg-clip-text text-transparent rtl:bg-gradient-to-l">{t("hero.title2")}</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-600">
            {t("hero.desc", { address: <strong dir="ltr" className="font-semibold text-slate-800">you@{BRAND.domain}</strong> })}
          </p>
          <ClaimAddress />
        </div>
        <InboxPreview />
      </div>
    </section>
  );
}

/* ---------- Trust strip ---------- */

function TrustStrip() {
  const { t } = useI18n();
  const items = [
    { icon: CreditCard, key: "card" },
    { icon: Timer, key: "fast" },
    { icon: EyeOff, key: "read" },
    { icon: ShieldCheck, key: "encrypted" },
  ];
  return (
    <section className="border-y border-slate-200 bg-surface">
      <ul className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-8 sm:px-6 md:grid-cols-4">
        {items.map(({ icon: Icon, key }) => (
          <li key={key} className="flex items-center gap-3 text-sm font-semibold text-slate-700">
            <Icon className="h-5 w-5 shrink-0 text-brand-600" /> {t(`trust.${key}`)}
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------- Features ---------- */

function Features() {
  const { t } = useI18n();
  const icons = [BadgeCheck, Zap, Lock, Smartphone, Paperclip, Languages];
  return (
    <section id="features" className="scroll-mt-20 py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-bold uppercase tracking-wider text-brand-600">{t("features.eyebrow")}</p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-balance text-slate-900 sm:text-4xl">{t("features.title")}</h2>
          <p className="mt-4 text-lg text-slate-600">{t("features.desc")}</p>
        </div>
        <ul className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {t("features.items").map(({ title, text }, i) => {
            const Icon = icons[i];
            return (
              <li key={title} className="rounded-2xl border border-slate-200 bg-surface p-6 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-900/5">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-600">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-lg font-bold text-slate-900">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{text}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/* ---------- Security ---------- */

function Security() {
  const { t } = useI18n();
  return (
    <section id="security" className="scroll-mt-20 bg-ink py-20 text-white sm:py-24">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2">
        <div>
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-white/10">
            <ShieldCheck className="h-6 w-6 text-emerald-400" />
          </span>
          <h2 className="mt-5 text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">{t("security.title")}</h2>
          <p className="mt-4 text-lg leading-relaxed text-white/75">{t("security.desc", { name: BRAND.short })}</p>
        </div>
        <ul className="grid gap-3">
          {t("security.points").map((p) => (
            <li key={p} className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
              <span className="text-white/90">{p}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ---------- How it works ---------- */

function HowItWorks() {
  const { t } = useI18n();
  return (
    <section id="how" className="scroll-mt-20 py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-brand-600">
            <Timer className="h-4 w-4" /> {t("how.eyebrow")}
          </p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-balance text-slate-900 sm:text-4xl">{t("how.title")}</h2>
        </div>
        <ol className="mt-14 grid gap-6 md:grid-cols-3">
          {t("how.steps").map((s, i) => (
            <li key={s.title} className="relative rounded-2xl border border-slate-200 bg-slate-50 p-6">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-600 text-lg font-extrabold text-white">{i + 1}</span>
              <h3 className="mt-4 text-lg font-bold text-slate-900">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{s.text.replace("{domain}", BRAND.domain)}</p>
            </li>
          ))}
        </ol>
        <div className="mt-10 text-center">
          <Link to="/signup" className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-3.5 font-semibold text-white shadow-lg shadow-brand-600/25 transition hover:bg-brand-500">
            {t("how.cta")} <Arrow />
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ---------- Free vs. typical paid ---------- */

function Comparison() {
  const { t } = useI18n();
  return (
    <section className="bg-brand-50/50 py-20 sm:py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <h2 className="text-center text-3xl font-extrabold tracking-tight text-balance text-slate-900 sm:text-4xl">{t("compare.title")}</h2>
        <div className="mt-10 overflow-x-auto rounded-2xl border border-slate-200 bg-surface">
          <table className="w-full text-start text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-3 sm:px-6"><span className="sr-only">—</span></th>
                <th scope="col" className="px-4 py-3 text-start font-bold text-brand-700 sm:px-6">{t("compare.us", { name: BRAND.short })}</th>
                <th scope="col" className="px-4 py-3 text-start font-semibold sm:px-6">{t("compare.them")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {t("compare.rows").map(([label, us, them]) => (
                <tr key={label}>
                  <th scope="row" className="px-4 py-4 text-start font-medium text-slate-700 sm:px-6">{label}</th>
                  <td className="px-4 py-4 font-semibold text-emerald-700 sm:px-6">{us}</td>
                  <td className="px-4 py-4 text-slate-500 sm:px-6">{them}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/* ---------- FAQ ---------- */

function FAQ() {
  const { t } = useI18n();
  return (
    <section id="faq" className="scroll-mt-20 py-20 sm:py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <h2 className="text-center text-3xl font-extrabold tracking-tight text-balance text-slate-900 sm:text-4xl">{t("faq.title")}</h2>
        <div className="mt-10 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-surface">
          {t("faq.items").map((f) => (
            <details key={f.q} className="group px-6 py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
                {f.q}
                <ChevronDown className="h-5 w-5 shrink-0 text-slate-400 transition group-open:rotate-180" />
              </summary>
              <p className="mt-3 leading-relaxed text-slate-600">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Final CTA ---------- */

function FinalCTA() {
  const { t } = useI18n();
  return (
    <section className="px-4 pb-20 sm:px-6 sm:pb-24">
      <div className="mx-auto max-w-6xl overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-brand-900 px-6 py-14 text-center text-white sm:px-12">
        <h2 className="text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">{t("final.title")}</h2>
        <p className="mx-auto mt-4 max-w-xl text-lg text-white/80">{t("final.desc")}</p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link to="/signup" className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-6 py-3.5 font-semibold text-[#1d36d7] transition hover:bg-white/90">
            {t("final.cta")} <Arrow />
          </Link>
          <Link to="/login" className="inline-flex items-center justify-center rounded-xl border border-white/30 px-6 py-3.5 font-semibold text-white transition hover:bg-white/10">
            {t("final.login")}
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function Landing() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <TrustStrip />
        <Features />
        <Security />
        <HowItWorks />
        <Comparison />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}
