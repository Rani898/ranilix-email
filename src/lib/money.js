// Shared bits for receipts, the monthly summary and the calendar.

export const CATS = ["food", "ride", "home", "shop", "subs", "other"];
export const CAT_STYLE = {
  food: { bar: "#f59e0b", chip: "bg-amber-100 text-amber-800" },
  ride: { bar: "#ec4899", chip: "bg-pink-100 text-pink-800" },
  home: { bar: "#10b981", chip: "bg-emerald-100 text-emerald-800" },
  shop: { bar: "#3b66f5", chip: "bg-blue-100 text-blue-800" },
  subs: { bar: "#8b5cf6", chip: "bg-violet-100 text-violet-800" },
  other: { bar: "#94a3b8", chip: "bg-slate-100 text-slate-700" },
};

const STORE_COLORS = ["#e11d48", "#f97316", "#eab308", "#16a34a", "#0ea5e9", "#2547ea", "#7c3aed", "#db2777", "#0f766e"];
export function storeColor(name = "") {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return STORE_COLORS[h % STORE_COLORS.length];
}

export function formatMoney(amount, currency = "ILS", locale = "he-IL") {
  try { return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount || 0); }
  catch { return `${(amount || 0).toFixed(2)} ${currency}`; }
}

export function monthKeyOf(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
export function shiftMonthKey(key, by) {
  const [y, m] = key.split("-").map(Number);
  return monthKeyOf(new Date(y, m - 1 + by, 1));
}
export function monthTitle(key, locale) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(locale, { month: "long", year: "numeric" });
}

export const EVENT_COLORS = {
  blue: { chip: "bg-blue-100 text-blue-800", bar: "#2547ea" },
  green: { chip: "bg-emerald-100 text-emerald-800", bar: "#10b981" },
  amber: { chip: "bg-amber-100 text-amber-800", bar: "#f59e0b" },
  pink: { chip: "bg-pink-100 text-pink-800", bar: "#ec4899" },
  violet: { chip: "bg-violet-100 text-violet-800", bar: "#8b5cf6" },
  slate: { chip: "bg-slate-200 text-slate-800", bar: "#64748b" },
};

/** Read the first event of an .ics invitation: { uid, title, start, end, allDay, location, organizer }. */
export function parseIcs(text) {
  const unfolded = String(text || "").replace(/\r?\n[ \t]/g, "");
  const block = /BEGIN:VEVENT([\s\S]*?)END:VEVENT/.exec(unfolded);
  if (!block) return null;
  const get = (name) => {
    const m = new RegExp(`^${name}(;[^:\\n]*)?:(.*)$`, "mi").exec(block[1]);
    return m ? { params: m[1] || "", value: m[2].trim() } : null;
  };
  const unescape = (v) => String(v || "").replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");
  const when = (f) => {
    if (!f) return null;
    const v = f.value;
    const d = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(v);
    if (!d) return null;
    const [, y, mo, da, hh, mi, ss, z] = d;
    if (!hh) return { ts: new Date(+y, +mo - 1, +da).getTime(), allDay: true };
    const ts = z ? Date.UTC(+y, +mo - 1, +da, +hh, +mi, +(ss || 0)) : new Date(+y, +mo - 1, +da, +hh, +mi, +(ss || 0)).getTime();
    return { ts, allDay: false };
  };
  const start = when(get("DTSTART"));
  if (!start) return null;
  const end = when(get("DTEND")) || start;
  const org = get("ORGANIZER");
  return {
    uid: get("UID")?.value || "",
    title: unescape(get("SUMMARY")?.value) || "",
    location: unescape(get("LOCATION")?.value) || "",
    start: start.ts,
    end: start.allDay && end.ts > start.ts ? end.ts - 1 : end.ts,
    allDay: start.allDay,
    organizer: org ? org.value.replace(/^mailto:/i, "") : "",
    method: (/^METHOD:(.*)$/mi.exec(unfolded)?.[1] || "").trim().toUpperCase(),
  };
}
