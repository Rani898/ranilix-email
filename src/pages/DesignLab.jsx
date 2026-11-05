// Design lab: a private preview of four possible looks for the site, side by side.
// Nothing here changes the real site. Open it at /lab.
import { useState } from "react";
import { Check, Inbox, Send, Star, Trash2, HardDrive, CalendarDays, Receipt, Lock, Zap, Gift, PenLine, Search } from "lucide-react";
import RainGlassBackground from "../components/kokonutui/rain-glass-background.tsx";
import TopoBackground from "../components/kokonutui/topo-background.tsx";
import CausticsBackground from "../components/kokonutui/caustics-background.tsx";
import BackgroundPaths from "../components/kokonutui/background-paths.tsx";

const MAILS = [
  { from: "צוות Ranilix", subject: "התיבה החדשה שלך מוכנה", time: "עכשיו", unread: true },
  { from: "דנה לוי", subject: "מה התוכניות לסופ״ש?", time: "9:41", unread: true },
  { from: "Netflix", subject: "קוד האימות שלך: 482913", time: "אתמול" },
  { from: "ElDorado", subject: "הקבלה על ההזמנה · 249.90 ₪", time: "ב׳" },
];
const FEATURES = [
  { icon: Gift, title: "חינם לתמיד", text: "בלי כרטיס אשראי ובלי תקופת ניסיון." },
  { icon: Lock, title: "פרטי באמת", text: "אף אחד לא קורא את המיילים שלכם." },
  { icon: Zap, title: "מוכן בדקה", text: "בוחרים שם, וזהו. יש כתובת." },
];
const TOOLS = [
  { icon: HardDrive, name: "כונן" },
  { icon: CalendarDays, name: "לוח שנה" },
  { icon: Receipt, name: "קבלות" },
];

/* ---------- shared pieces, styled per look ---------- */

function Claim({ s }) {
  return (
    <form className="flex w-full max-w-lg flex-wrap gap-2" onSubmit={(e) => e.preventDefault()}>
      <label className={`flex h-13 flex-1 basis-64 items-center gap-1 px-4 ${s.input}`} dir="ltr">
        <span className="sr-only">השם לכתובת</span>
        <input className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:opacity-60" placeholder="yourname" />
        <span className="opacity-70">@ranilix.com</span>
      </label>
      <button type="submit" className={`h-13 px-6 font-bold ${s.button}`}>לתפוס את השם</button>
    </form>
  );
}

function MiniInbox({ s }) {
  return (
    <div className={`overflow-hidden text-start ${s.frame}`}>
      <div className={`flex items-center gap-3 px-5 py-4 ${s.divider}`}>
        <Inbox className="h-5 w-5" aria-hidden="true" />
        <b className="text-lg">דואר נכנס</b>
        <span className={`ms-auto rounded-full px-2.5 py-0.5 text-xs font-bold ${s.badge}`}>2 חדשים</span>
        <span className={`hidden h-9 items-center gap-1.5 rounded-full px-3 text-sm sm:inline-flex ${s.chip}`}><Search className="h-4 w-4" aria-hidden="true" />חיפוש</span>
      </div>
      <div className="flex">
        <ul className={`hidden w-44 shrink-0 space-y-1 p-3 text-sm md:block ${s.sideDivider}`}>
          {[[Inbox, "דואר נכנס", true], [Star, "מסומנים"], [Send, "נשלח"], [Trash2, "אשפה"]].map(([I, n, on]) => (
            <li key={n} className={`flex items-center gap-2 rounded-xl px-3 py-2 ${on ? s.active : ""}`}><I className="h-4 w-4" aria-hidden="true" />{n}</li>
          ))}
          <li className="pt-3 text-xs opacity-60">כלים</li>
          {TOOLS.map(({ icon: I, name }) => <li key={name} className="flex items-center gap-2 px-3 py-2"><I className="h-4 w-4" aria-hidden="true" />{name}</li>)}
        </ul>
        <ul className="min-w-0 flex-1">
          {MAILS.map((m) => (
            <li key={m.subject} className={`flex items-center gap-3 px-5 py-3.5 ${s.row}`}>
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${m.unread ? s.dot : "bg-transparent"}`} />
              <span className="min-w-0 flex-1">
                <span className={`block ${m.unread ? "font-bold" : "font-medium"}`}>{m.from}</span>
                <span className="block truncate text-sm opacity-75">{m.subject}</span>
              </span>
              <span className="shrink-0 text-xs opacity-60">{m.time}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Features({ s }) {
  return (
    <div className="grid gap-5 sm:grid-cols-3">
      {FEATURES.map(({ icon: I, title, text }) => (
        <div key={title} className={`p-6 text-start ${s.card}`}>
          <span className={`mb-4 grid h-11 w-11 place-items-center ${s.iconBox}`}><I className="h-5 w-5" aria-hidden="true" /></span>
          <p className="text-lg font-extrabold">{title}</p>
          <p className="mt-1 opacity-75">{text}</p>
        </div>
      ))}
    </div>
  );
}

function Nav({ s, logo }) {
  return (
    <div className="relative z-10 mx-auto flex max-w-6xl items-center gap-6 px-6 py-5">
      <span className="flex items-center gap-2 text-xl font-black">{logo}Ranilix</span>
      <span className="hidden gap-6 text-sm opacity-80 md:flex"><span>תכונות</span><span>פרטיות</span><span>שאלות</span></span>
      <span className="ms-auto text-sm font-semibold">התחברות</span>
      <span className={`px-4 py-2 text-sm font-bold ${s.button}`}>לאימייל חינם</span>
    </div>
  );
}

const Logo = ({ className = "" }) => (
  <svg viewBox="0 0 100 100" className={`h-8 w-8 ${className}`} aria-hidden="true"><rect width="100" height="100" rx="24" fill="currentColor" /><rect x="20" y="32" width="60" height="42" rx="6" fill="none" stroke="#fff" strokeWidth="9" /><path d="M20 38 L44 58 L84 20" fill="none" stroke="#fff" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

/* ---------- the four looks ---------- */

function RainLook() {
  const s = {
    input: "rounded-2xl border border-white/20 bg-white/10 text-white backdrop-blur-xl",
    button: "rounded-2xl bg-white text-zinc-900 hover:bg-zinc-200",
    frame: "rounded-[28px] border border-white/15 bg-white/[.06] text-zinc-100 shadow-[0_30px_80px_-30px_rgba(99,132,255,.6)] backdrop-blur-2xl",
    divider: "border-b border-white/10", sideDivider: "border-e border-white/10", row: "border-t border-white/5",
    badge: "bg-indigo-400/20 text-indigo-200", chip: "bg-white/10", active: "bg-white/15", dot: "bg-indigo-300",
    card: "rounded-[24px] border border-white/15 bg-white/[.06] text-zinc-100 backdrop-blur-xl", iconBox: "rounded-2xl bg-gradient-to-br from-indigo-400 to-fuchsia-400 text-white",
  };
  const [city, setCity] = useState("tlv");
  const c = CITIES[city];
  return (
    <div className="dark bg-zinc-950 text-zinc-50">
      <RainGlassBackground key={city} title="מיליון אורות בעיר. כתובת אחת שהיא שלך." className="min-h-[700px]" rain={0.85} src={`${import.meta.env.BASE_URL}lab/${c.file}`}>
        <p className="max-w-lg text-lg text-zinc-100 [text-shadow:0_1px_12px_rgba(0,0,0,.7)]">אימייל חינמי ופרטי בכתובת <bdi dir="ltr">@ranilix.com</bdi>. מקבלים, שולחים ושומרים, בלי פרסומות ובלי לשלם.</p>
        <Claim s={s} />
        <div className="flex items-center gap-1 rounded-full bg-black/40 p-1 text-sm backdrop-blur" role="group" aria-label="איזו עיר מאחורי החלון">
          {Object.entries(CITIES).map(([id, x]) => (
            <button key={id} type="button" onClick={() => setCity(id)} aria-pressed={city === id}
              className={`rounded-full px-3 py-1 font-semibold ${city === id ? "bg-white text-zinc-900" : "text-white/80 hover:text-white"}`}>{x.name}</button>
          ))}
        </div>
        <p className="text-xs text-white/60">גררו עם העכבר כדי לנגב את החלון</p>
      </RainGlassBackground>
      <div className="mx-auto max-w-6xl space-y-10 px-6 py-16">
        <MiniInbox s={s} />
        <Features s={s} />
        <p className="text-center text-xs text-zinc-500">
          צילום רקע: <a className="underline" href={c.page} target="_blank" rel="noreferrer">{c.credit}</a>, <a className="underline" href={c.licenseUrl} target="_blank" rel="noreferrer">{c.license}</a>
        </p>
      </div>
    </div>
  );
}

// Night photos behind the rainy window. The deploy downloads them from Wikimedia Commons (free licenses, credited on the page).
const CITIES = {
  tlv: { name: "תל אביב", file: "tlv.jpg", credit: "shaula haitner, PikiWiki Israel", license: "CC BY 2.5", licenseUrl: "https://creativecommons.org/licenses/by/2.5/", page: "https://commons.wikimedia.org/wiki/File:PikiWiki_Israel_40946_Tel_Aviv_at_Night.JPG" },
  nyc: { name: "ניו יורק", file: "nyc.jpg", credit: "Diliff", license: "CC BY-SA 3.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/", page: "https://commons.wikimedia.org/wiki/File:New_York_Midtown_Skyline_at_night_-_Jan_2006_edit1.jpg" },
};

function TopoLook() {
  const s = {
    input: "rounded-xl border-[3px] border-zinc-900 bg-white text-zinc-900",
    button: "rounded-xl border-[3px] border-zinc-900 bg-[#FFD60A] text-zinc-900 shadow-[4px_4px_0_#18181b] transition-transform hover:-translate-y-0.5 hover:shadow-[6px_6px_0_#18181b]",
    frame: "rounded-2xl border-[3px] border-zinc-900 bg-white text-zinc-900 shadow-[8px_8px_0_#18181b]",
    divider: "border-b-[3px] border-zinc-900 bg-[#FFD60A]", sideDivider: "border-e-[3px] border-zinc-900", row: "border-t-2 border-zinc-900/10",
    badge: "border-2 border-zinc-900 bg-white", chip: "border-2 border-zinc-900 bg-white", active: "border-2 border-zinc-900 bg-[#2547EA] text-white", dot: "bg-[#2547EA]",
    card: "rounded-2xl border-[3px] border-zinc-900 bg-white text-zinc-900 shadow-[6px_6px_0_#18181b]", iconBox: "rounded-xl border-[3px] border-zinc-900 bg-[#2547EA] text-white",
  };
  return (
    <div className="bg-[#F3F4F6] text-zinc-900">
      <TopoBackground className="min-h-[640px] bg-transparent text-zinc-900/40" labels>
        <div className="relative flex max-w-3xl flex-col items-center gap-6 px-6 text-center text-zinc-900">
          <span className="rounded-full border-[3px] border-zinc-900 bg-white px-4 py-1 text-sm font-bold shadow-[3px_3px_0_#18181b]">100% חינם · בלי כרטיס אשראי</span>
          <h1 className="text-5xl font-black leading-[1.05] tracking-tight sm:text-7xl">הכתובת שלכם<br /><span className="bg-[#FFD60A] px-2">על המפה.</span></h1>
          <p className="max-w-md text-lg font-medium">אימייל חינמי ופרטי, עם כונן, לוח שנה וקבלות. הכל במקום אחד.</p>
          <Claim s={s} />
        </div>
      </TopoBackground>
      <div className="mx-auto max-w-6xl space-y-12 px-6 py-16">
        <MiniInbox s={s} />
        <Features s={s} />
      </div>
    </div>
  );
}

function PoolLook() {
  const s = {
    input: "rounded-full bg-white/80 text-teal-950 shadow-lg shadow-teal-900/10 backdrop-blur",
    button: "rounded-full bg-teal-800 text-white shadow-lg shadow-teal-900/20 hover:bg-teal-700",
    frame: "rounded-[36px] bg-white/80 text-teal-950 shadow-[0_30px_70px_-30px_rgba(13,94,90,.45)] ring-1 ring-white backdrop-blur-xl",
    divider: "border-b border-teal-900/10", sideDivider: "border-e border-teal-900/10", row: "border-t border-teal-900/5",
    badge: "bg-teal-100 text-teal-900", chip: "bg-teal-50", active: "bg-teal-800 text-white", dot: "bg-teal-600",
    card: "rounded-[32px] bg-white/80 text-teal-950 shadow-[0_20px_50px_-25px_rgba(13,94,90,.4)] ring-1 ring-white backdrop-blur", iconBox: "rounded-full bg-teal-100 text-teal-800",
  };
  return (
    <div className="bg-[#E3F1F0] text-teal-950">
      <CausticsBackground title="צוללים לתיבה חדשה." className="min-h-[640px] text-teal-950">
        <p className="max-w-md text-lg text-teal-900">אימייל חינמי ופרטי. רגוע כמו בריכה בבוקר. לחצו על המים.</p>
        <Claim s={s} />
      </CausticsBackground>
      <div className="mx-auto max-w-6xl space-y-10 px-6 py-16">
        <MiniInbox s={s} />
        <Features s={s} />
      </div>
    </div>
  );
}

/** Frame with a slowly turning gradient border. */
function GlowFrame({ children, className = "", radius = "rounded-[28px]" }) {
  return (
    <div className={`relative overflow-hidden p-[2px] ${radius} ${className}`}>
      <div aria-hidden="true" className="absolute -inset-[60%] animate-[spin_7s_linear_infinite] bg-[conic-gradient(from_0deg,#2547EA,#7c3aed,#ec4899,#f59e0b,#2547EA)] motion-reduce:animate-none" />
      <div className={`relative h-full bg-white ${radius}`}>{children}</div>
    </div>
  );
}

function RibbonLook() {
  const s = {
    input: "rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-sm",
    button: "rounded-2xl bg-[#2547EA] text-white hover:bg-[#3b66f5]",
    frame: "text-slate-900", divider: "border-b border-slate-100", sideDivider: "border-e border-slate-100", row: "border-t border-slate-100",
    badge: "bg-blue-50 text-[#2547EA]", chip: "bg-slate-100", active: "bg-[#2547EA] text-white", dot: "bg-[#2547EA]",
    card: "text-slate-900", iconBox: "rounded-2xl bg-gradient-to-br from-[#2547EA] to-fuchsia-500 text-white",
  };
  return (
    <div className="bg-white text-slate-900">
      <BackgroundPaths className="min-h-[640px] text-[#2547EA]" count={40}>
        <div className="relative flex max-w-2xl flex-col items-center gap-6 px-6 text-center text-slate-900">
          <h1 className="text-5xl font-black leading-[1.05] tracking-tight sm:text-7xl">אימייל חינם.<br /><span className="bg-gradient-to-l from-[#2547EA] via-violet-600 to-pink-500 bg-clip-text text-transparent">בלי כוכביות.</span></h1>
          <p className="max-w-md text-lg text-slate-600">כתובת @ranilix.com משלכם בתוך דקה. העבירו את העכבר דרך הקווים.</p>
          <Claim s={s} />
        </div>
      </BackgroundPaths>
      <div className="mx-auto max-w-6xl space-y-10 px-6 py-16">
        <GlowFrame><MiniInbox s={s} /></GlowFrame>
        <div className="grid gap-5 sm:grid-cols-3">
          {FEATURES.map(({ icon: I, title, text }) => (
            <GlowFrame key={title} radius="rounded-[24px]">
              <div className="p-6 text-start">
                <span className={`mb-4 grid h-11 w-11 place-items-center ${s.iconBox}`}><I className="h-5 w-5" aria-hidden="true" /></span>
                <p className="text-lg font-extrabold">{title}</p>
                <p className="mt-1 text-slate-600">{text}</p>
              </div>
            </GlowFrame>
          ))}
        </div>
      </div>
    </div>
  );
}

const LOOKS = [
  { id: "rain", name: "1 · חלון גשום", note: "כהה ויוקרתי, זכוכית מטושטשת", C: RainLook, nav: "text-white", logo: "text-indigo-400" },
  { id: "topo", name: "2 · מפה נועזת", note: "מסגרות שחורות עבות, צהוב וכחול", C: TopoLook, nav: "text-zinc-900", logo: "text-[#2547EA]" },
  { id: "pool", name: "3 · בריכה", note: "אור מים, רך ועגול", C: PoolLook, nav: "text-teal-950", logo: "text-teal-700" },
  { id: "ribbon", name: "4 · סרטי אור", note: "נקי, עם מסגרות צבעוניות שמסתובבות", C: RibbonLook, nav: "text-slate-900", logo: "text-[#2547EA]" },
];

export default function DesignLab() {
  const [pick, setPick] = useState("rain");
  const look = LOOKS.find((l) => l.id === pick);
  const navStyle = { rain: { button: "rounded-full bg-white text-zinc-900" }, topo: { button: "rounded-xl border-[3px] border-zinc-900 bg-[#FFD60A] shadow-[3px_3px_0_#18181b]" }, pool: { button: "rounded-full bg-teal-800 text-white" }, ribbon: { button: "rounded-2xl bg-[#2547EA] text-white" } }[pick];
  const { C } = look;
  return (
    <div dir="rtl" className="min-h-screen bg-zinc-900">
      <div className="sticky top-0 z-50 flex flex-wrap items-center gap-2 bg-zinc-900/95 px-4 py-3 text-white backdrop-blur">
        <b className="me-2">תצוגה מקדימה · בחרו עיצוב</b>
        {LOOKS.map((l) => (
          <button key={l.id} type="button" onClick={() => setPick(l.id)} aria-pressed={pick === l.id}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${pick === l.id ? "bg-white text-zinc-900" : "bg-white/10 hover:bg-white/20"}`}>{l.name}</button>
        ))}
        <span className="ms-auto text-xs text-zinc-400">{look.note} · זו רק תצוגה, האתר לא השתנה</span>
      </div>
      <div className="relative">
        <div className={`absolute inset-x-0 top-0 z-20 ${look.nav}`}><Nav s={navStyle} logo={<Logo className={look.logo} />} /></div>
        <C key={pick} />
      </div>
    </div>
  );
}
