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
  KeyRound,
  Lock,
  MailCheck,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Timer,
  Zap,
} from "lucide-react";
import Navbar from "../components/Navbar.jsx";
import Footer from "../components/Footer.jsx";
import { BRAND } from "../config.js";
import { sanitizeUsername } from "../lib/validation.js";

/* ---------- Hero ---------- */

function ClaimAddress() {
  const [name, setName] = useState("");
  const navigate = useNavigate();

  const submit = (e) => {
    e.preventDefault();
    navigate(name ? `/signup?u=${encodeURIComponent(name)}` : "/signup");
  };

  return (
    <form onSubmit={submit} className="mt-8 w-full max-w-lg">
      <label htmlFor="claim" className="sr-only">Choose your email name</label>
      <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg shadow-slate-900/5 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center rounded-xl px-3">
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
        <button
          type="submit"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-3 font-semibold text-white transition hover:bg-brand-700"
        >
          Claim it free <ArrowRight className="h-4 w-4" />
        </button>
      </div>
      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
        <li className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> 100% free forever</li>
        <li className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> No credit card required</li>
        <li className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Ready in 1 minute</li>
      </ul>
    </form>
  );
}

function InboxPreview() {
  const mails = [
    { from: "Welcome team", subject: "Your new inbox is ready 🎉", time: "now", unread: true, color: "bg-brand-500" },
    { from: "Dana Levi", subject: "Weekend plans?", time: "9:41", unread: true, color: "bg-emerald-500" },
    { from: "Security", subject: "New sign-in from Chrome on Windows", time: "Yesterday", color: "bg-amber-500" },
    { from: "Tal Cohen", subject: "Photos from the trip", time: "Mon", color: "bg-rose-500" },
  ];

  return (
    <div className="relative mx-auto w-full max-w-md lg:max-w-none" aria-hidden="true">
      <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-tr from-brand-200/60 via-sky-100 to-emerald-100 blur-2xl" />
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/10">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          <span className="h-3 w-3 rounded-full bg-rose-400" />
          <span className="h-3 w-3 rounded-full bg-amber-400" />
          <span className="h-3 w-3 rounded-full bg-emerald-400" />
          <span className="ml-3 truncate rounded-md bg-slate-100 px-3 py-1 text-xs text-slate-500">
            mail.{BRAND.domain}/inbox
          </span>
        </div>
        <div className="flex items-center justify-between px-5 pt-4">
          <div className="flex items-center gap-2">
            <Inbox className="h-5 w-5 text-brand-600" />
            <span className="font-semibold text-slate-900">Inbox</span>
            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">2 new</span>
          </div>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
            <Lock className="h-3.5 w-3.5" /> Encrypted
          </span>
        </div>
        <ul className="mt-3 divide-y divide-slate-100">
          {mails.map((m) => (
            <li key={m.subject} className={`flex items-center gap-3 px-5 py-3.5 ${m.unread ? "bg-brand-50/40" : ""}`}>
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold text-white ${m.color}`}>
                {m.from[0]}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className={`truncate text-sm ${m.unread ? "font-bold text-slate-900" : "font-medium text-slate-700"}`}>{m.from}</p>
                  <span className="shrink-0 text-xs text-slate-400">{m.time}</span>
                </div>
                <p className="truncate text-sm text-slate-500">{m.subject}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="absolute -bottom-5 -left-3 hidden items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg sm:flex">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-100 text-emerald-700">
          <CreditCard className="h-4 w-4" />
        </span>
        <div>
          <p className="text-xs text-slate-500">Monthly cost</p>
          <p className="text-sm font-bold text-slate-900">$0.00, forever</p>
        </div>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 -z-10 h-[36rem] bg-gradient-to-b from-brand-50 to-white" />
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 pb-20 pt-14 sm:px-6 md:pt-20 lg:grid-cols-2">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">
            <Sparkles className="h-4 w-4" /> 100% Free Forever
          </span>
          <h1 className="mt-5 text-4xl font-extrabold leading-[1.1] tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
            Your own email address.{" "}
            <span className="bg-gradient-to-r from-brand-600 to-sky-500 bg-clip-text text-transparent">Free. Private. Yours.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-600">
            Get a fresh <strong className="font-semibold text-slate-800">you@{BRAND.domain}</strong> address in under a minute.
            No credit card, no trial that runs out, no hidden fees — just a fast, secure inbox that respects your privacy.
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
  const items = [
    { icon: CreditCard, label: "No credit card, ever" },
    { icon: Timer, label: "Sign up in 60 seconds" },
    { icon: EyeOff, label: "We never read your mail" },
    { icon: ShieldCheck, label: "Encrypted connections" },
  ];
  return (
    <section className="border-y border-slate-200 bg-white">
      <ul className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-8 sm:px-6 md:grid-cols-4">
        {items.map(({ icon: Icon, label }) => (
          <li key={label} className="flex items-center gap-3 text-sm font-semibold text-slate-700">
            <Icon className="h-5 w-5 shrink-0 text-brand-600" /> {label}
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------- Features ---------- */

function Features() {
  const features = [
    { icon: BadgeCheck, title: "A name you'll love", text: `Pick any available name and it's yours: hello@${BRAND.domain}, your name, your nickname.` },
    { icon: Zap, title: "Fast by design", text: "A lightweight inbox that opens instantly and searches your mail in a blink." },
    { icon: Lock, title: "Private by default", text: "Your messages are yours. No ads based on your email content, no selling your data." },
    { icon: Smartphone, title: "Works everywhere", text: "Phone, tablet or computer — your inbox looks great and stays in sync." },
    { icon: MailCheck, title: "Smart spam shield", text: "Junk and phishing are filtered out before they ever reach your inbox." },
    { icon: KeyRound, title: "Account protection", text: "Strong passwords and sign-in alerts help keep intruders out of your account." },
  ];

  return (
    <section id="features" className="scroll-mt-20 py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-bold uppercase tracking-wider text-brand-600">Everything included</p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
            All the good stuff. None of the bills.
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            There's no "premium" tier hiding the features you need. Everyone gets the full inbox, free.
          </p>
        </div>
        <ul className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, text }) => (
            <li key={title} className="rounded-2xl border border-slate-200 bg-white p-6 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-900/5">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-600">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 text-lg font-bold text-slate-900">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ---------- Security ---------- */

function Security() {
  const points = [
    "HTTPS/TLS encryption on every connection",
    "Passwords stored only as salted hashes — never in plain text",
    "No ads based on what's in your messages",
    "Delete your account and data any time",
  ];
  return (
    <section id="security" className="scroll-mt-20 bg-slate-900 py-20 text-white sm:py-24">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2">
        <div>
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-white/10">
            <ShieldCheck className="h-6 w-6 text-emerald-400" />
          </span>
          <h2 className="mt-5 text-3xl font-extrabold tracking-tight sm:text-4xl">Free doesn't mean you're the product.</h2>
          <p className="mt-4 text-lg leading-relaxed text-slate-300">
            We built {BRAND.short} around a simple promise: your inbox belongs to you. We don't scan your mail to sell ads,
            and we don't sell your data to anyone.
          </p>
        </div>
        <ul className="grid gap-3">
          {points.map((p) => (
            <li key={p} className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
              <span className="text-slate-200">{p}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ---------- How it works ---------- */

function HowItWorks() {
  const steps = [
    { title: "Pick your name", text: `Choose the address you want — something@${BRAND.domain}.` },
    { title: "Set a password", text: "Create a strong password. That's it — no card, no phone bill, no forms." },
    { title: "Start emailing", text: "Your inbox is ready instantly. Send your first email right away." },
  ];
  return (
    <section id="how" className="scroll-mt-20 py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-brand-600">
            <Timer className="h-4 w-4" /> About 1 minute
          </p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">Three steps to your new inbox</h2>
        </div>
        <ol className="mt-14 grid gap-6 md:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title} className="relative rounded-2xl border border-slate-200 bg-slate-50 p-6">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-600 text-lg font-extrabold text-white">{i + 1}</span>
              <h3 className="mt-4 text-lg font-bold text-slate-900">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{s.text}</p>
            </li>
          ))}
        </ol>
        <div className="mt-10 text-center">
          <Link to="/signup" className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-3.5 font-semibold text-white shadow-lg shadow-brand-600/25 transition hover:bg-brand-700">
            Create my free email <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ---------- Free vs. typical paid ---------- */

function Comparison() {
  const rows = [
    ["Monthly price", "$0", "Often $3–$10"],
    ["Credit card to sign up", "Never", "Usually"],
    ["Custom @address", "Included", "Paid add-on"],
    ["Ads from reading your mail", "No", "Varies"],
  ];
  return (
    <section className="bg-brand-50/50 py-20 sm:py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <h2 className="text-center text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">Free, with nothing held back</h2>
        <div className="mt-10 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold sm:px-6"></th>
                <th scope="col" className="px-4 py-3 font-bold text-brand-700 sm:px-6">{BRAND.short}</th>
                <th scope="col" className="px-4 py-3 font-semibold sm:px-6">Typical paid email</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(([label, us, them]) => (
                <tr key={label}>
                  <th scope="row" className="px-4 py-4 font-medium text-slate-700 sm:px-6">{label}</th>
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
  const faqs = [
    { q: "Is it really free? What's the catch?", a: "Yes, really. Creating and using your account costs nothing, and we never ask for a credit card. There's no trial period that expires." },
    { q: "Do I need a phone number or credit card?", a: "No credit card, ever. You only need to pick a name and a password to get started." },
    { q: "Do you read my emails or show ads based on them?", a: "No. We don't scan your messages to target ads and we don't sell your data." },
    { q: "Can I use it on my phone?", a: "Yes. The inbox works in any modern browser on phone, tablet or desktop." },
    { q: "Can I delete my account?", a: "Any time. Deleting your account removes your mailbox and personal data." },
  ];
  return (
    <section id="faq" className="scroll-mt-20 py-20 sm:py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <h2 className="text-center text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">Questions? We've got answers.</h2>
        <div className="mt-10 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
          {faqs.map((f) => (
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
  return (
    <section className="px-4 pb-20 sm:px-6 sm:pb-24">
      <div className="mx-auto max-w-6xl overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-brand-800 px-6 py-14 text-center text-white sm:px-12">
        <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Your free inbox is one minute away.</h2>
        <p className="mx-auto mt-4 max-w-xl text-lg text-brand-100">No credit card. No hidden fees. Just a great email address that's yours to keep.</p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link to="/signup" className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-6 py-3.5 font-semibold text-brand-700 transition hover:bg-brand-50">
            Get my free address <ArrowRight className="h-4 w-4" />
          </Link>
          <Link to="/login" className="inline-flex items-center justify-center rounded-xl border border-white/30 px-6 py-3.5 font-semibold text-white transition hover:bg-white/10">
            I already have an account
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
