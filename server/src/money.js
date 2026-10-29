// Receipts and the monthly spending summary.
// Receipts are found in mail that arrives at Ranilix and (when connected) in the person's Gmail.
// The monthly summary arrives in the inbox on the 1st as a designed card, with the receipt files attached.

import { gmailCall, gmailMessage } from "./google.js";

export const CATEGORIES = ["food", "ride", "home", "shop", "subs", "other"];

// What the shop is. Brand names (in the sender's name or address) decide first, so every receipt
// from the same shop gets the same category; words in the subject only help for unknown shops.
const BRANDS = [
  ["subs", /netflix|spotify|apple\.com|itunes|icloud|google ?(one|play)|youtube|disney|hbo|primevideo|prime video|deezer|openai|chatgpt|xbox|playstation|nintendo|steampowered|steam|patreon|canva|adobe|microsoft|dropbox|crunchyroll|duolingo/i],
  ["food", /wolt|10bis|tenbis|תן ביס|cibus|סיבוס|pluxee|שופרסל|shufersal|רמי לוי|rami-?levy|יוחננוף|yochananof|victory|ויקטורי|אושר עד|osherad|טיב טעם|tivtaam|carrefour|קרפור|מקדונלד|mcdonald|דומינו|domino|pizza ?hut|aroma|ארומה|starbucks|burger ?king|kfc|japanika|ג'פניקה/i],
  ["ride", /רב[- ]?קו|rav[- ]?kav|ravkav|moovit|gett|yango|uber|bolt\.eu|\bpaz\b|פז\b|דלק|delek|sonol|סונול|דור אלון|doralon|rail\.co\.il|רכבת ישראל|אגד|egged|pango|פנגו|cellopark|סלופארק|כביש 6|kvish6|elal|אל על|wizzair|ryanair|easyjet/i],
  ["home", /חברת החשמל|iec\.co\.il|electric|מקורות|מי |water|בזק|bezeq|פרטנר|partner|סלקום|cellcom|\bhot\b|hot\.net|yes\.co\.il|גולן טלקום|golan|wecom|ארנונה|עיריית|municipal|אמישראגז|supergas|סופרגז|ביטוח|insurance|migdal|harel|הראל|מגדל|clal|כלל/i],
  ["shop", /aliexpress|alibaba|amazon|ebay|shein|temu|ikea|איקאה|\bksp\b|ivory|איבורי|\bbug\b|באג|zara|h&m|hm\.com|next\.co|terminalx|terminal x|טרמינל|asos|walla ?shops|וואלה שופס|super-?pharm|סופר-?פארם|be ?pharm|nike|adidas|castro|קסטרו|fox|פוקס|max ?stock|מקס סטוק|ace\.co|home ?center|הום סנטר|kravitz|קרביץ|apple store|samsung|xiaomi|etsy|wish\.com/i],
];
const SUBJECT_HINTS = [
  ["subs", /מנוי|subscription|renew|membership/i],
  ["food", /מסעד|restaurant|ארוחה|meal|משלוח אוכל|food|סופרמרקט|supermarket/i],
  ["ride", /דלק|fuel|תדלוק|חניה|parking|נסיעה|ride|trip|טיסה|flight/i],
  ["home", /חשבון (חשמל|מים|גז)|bill|חשבונית תקופתית/i],
  ["shop", /הזמנה|order|shop|store|רכישה|purchase|משלוח|shipping/i],
];

/** Category from the shop alone (null when the shop isn't one we know). */
export function brandCategory(text) {
  for (const [cat, re] of BRANDS) if (re.test(text)) return cat;
  return null;
}
export function categoryOf(text, subject = "") {
  const brand = brandCategory(text);
  if (brand) return brand;
  for (const [cat, re] of SUBJECT_HINTS) if (re.test(subject)) return cat;
  return "other";
}

/** "account.netflix.com" -> "netflix.com", "mail.shufersal.co.il" -> "shufersal.co.il". */
export function baseDomain(addr) {
  const host = String(addr || "").toLowerCase().split("@").pop().replace(/[^a-z0-9.-]/g, "");
  const parts = host.split(".").filter(Boolean);
  if (parts.length < 2) return "";
  const two = parts.slice(-2);
  const keep = two[1].length === 2 && ["co", "org", "net", "gov", "ac", "com", "muni"].includes(two[0]) ? 3 : 2;
  return parts.slice(-keep).join(".");
}

const RECEIPT_WORDS = /(קבלה|חשבונית|אישור (הזמנה|תשלום|רכישה|עסקה)|הזמנה מס|הזמנתך|ההזמנה שלך|תודה על (הרכישה|ההזמנה|הקנייה)|פרטי (הרכישה|ההזמנה)|חיוב|התשלום (התקבל|בוצע)|receipt|invoice|order (confirm|#|number|no\.)|order.{0,25}(confirmed|placed|received)|your .{0,20}order|payment (received|confirm|successful)|thank you for your (order|purchase|payment)|purchase confirm|billing statement|subscription (renew|receipt)|you paid|charged)/i;
const NOT_RECEIPT = /(newsletter|unsubscribe from our|webinar|קוד (אימות|הכניסה)|verification code|password reset|איפוס סיסמה|shipped|נשלחה אליך החבילה|out for delivery)/i;
const TOTAL_WORDS = /(סה"כ|סה״כ|סך הכל|סך הכול|לתשלום|סכום (העסקה|החיוב|לתשלום)?|שולם|total|amount (paid|charged|due)?|grand total|order total|you paid|charged)/i;

const NUM = "(\\d{1,3}(?:[,\\s]\\d{3})*(?:\\.\\d{1,2})?|\\d+(?:\\.\\d{1,2})?)";
const MONEY = [
  [new RegExp(`₪\\s?${NUM}`, "g"), "ILS"],
  [new RegExp(`${NUM}\\s?(?:₪|ש"ח|ש״ח|שח|ILS|NIS)`, "g"), "ILS"],
  [new RegExp(`(?:ILS|NIS)\\s?${NUM}`, "g"), "ILS"],
  [new RegExp(`(?:US)?\\$\\s?${NUM}`, "g"), "USD"],
  [new RegExp(`${NUM}\\s?USD`, "g"), "USD"],
  [new RegExp(`€\\s?${NUM}`, "g"), "EUR"],
  [new RegExp(`${NUM}\\s?(?:€|EUR)`, "g"), "EUR"],
];
const toCents = (s) => Math.round(Number(String(s).replace(/[,\s]/g, "")) * 100);

function amountsIn(line) {
  const out = [];
  for (const [re, currency] of MONEY) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(line))) {
      const cents = toCents(m[1]);
      if (cents > 0 && cents < 10_000_000) out.push({ cents, currency, at: m.index });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

/** The amount a receipt is for: the one on a "total" line, else the biggest one. */
export function findAmount(text) {
  const lines = String(text || "").split(/\r?\n/).slice(0, 400);
  let best = null;
  for (let i = 0; i < lines.length; i++) {
    if (!TOTAL_WORDS.test(lines[i])) continue;
    // The number may sit on the same line or the next one (tables turned into text).
    const found = amountsIn(lines[i]).concat(amountsIn(lines[i + 1] || ""));
    if (found.length) best = found[found.length - 1]; // the last "total" line is usually the final one
  }
  if (best) return best;
  const all = amountsIn(lines.join("\n"));
  if (!all.length) return null;
  return all.reduce((a, b) => (b.cents > a.cents ? b : a));
}

function storeName(fromName, fromAddr) {
  let name = String(fromName || "").replace(/["<>]/g, "").replace(/\s*\(.*?\)\s*/g, " ")
    .replace(/\b(no-?reply|noreply|do-?not-?reply|notifications?|receipts?|billing|orders?|info|team|support)\b/gi, "")
    .replace(/[|·•\-–—:]+\s*$/g, "").replace(/\s{2,}/g, " ").trim();
  if (!name || /@/.test(name) || name.length < 2) {
    const host = String(fromAddr || "").split("@")[1] || "";
    const parts = host.split(".").filter((p) => !["mail", "email", "e", "em", "news", "info", "noreply", "co", "com", "il", "org", "net", "io"].includes(p));
    const core = parts[parts.length - 1] || host;
    name = core ? core.charAt(0).toUpperCase() + core.slice(1) : "?";
  }
  return name.slice(0, 60);
}

/** Is this mail a receipt? Returns the details, or null. */
export function detectReceipt({ fromName = "", fromAddr = "", subject = "", text = "" }) {
  const head = `${subject}\n${String(text).slice(0, 4000)}`;
  if (!RECEIPT_WORDS.test(head) || NOT_RECEIPT.test(subject)) return null;
  const amount = findAmount(`${subject}\n${text}`);
  if (!amount) return null;
  const store = storeName(fromName, fromAddr);
  return {
    store, what: String(subject || "").replace(/\s+/g, " ").trim().slice(0, 120), domain: baseDomain(fromAddr),
    category: categoryOf(`${store} ${fromName} ${fromAddr}`, subject), amountCents: amount.cents, currency: amount.currency,
  };
}

// Receipts from the same shop belong together: by its address when known, else its name.
const storeKey = (domain, store) => (domain || String(store || "").trim().toLowerCase()).slice(0, 80);

async function saveReceipt(env, userId, source, extId, date, found, extra = {}) {
  // The person already chose a category for this shop? Use it. Else follow earlier receipts from it.
  const key = storeKey(found.domain, found.store);
  const rule = await env.DB.prepare("SELECT category FROM store_categories WHERE user_id = ? AND store_key = ?").bind(userId, key).first();
  if (rule) found = { ...found, category: rule.category };
  else if (!brandCategory(`${found.store} ${found.domain}`)) {
    const earlier = await env.DB.prepare(`SELECT r.category, COUNT(*) AS n FROM receipts r LEFT JOIN receipt_domains d ON d.receipt_id = r.id
      WHERE r.user_id = ? AND (d.domain = ? OR lower(r.store) = ?) GROUP BY r.category ORDER BY n DESC LIMIT 1`).bind(userId, found.domain || "-", String(found.store).toLowerCase()).first();
    if (earlier) found = { ...found, category: earlier.category };
  }
  const res = await env.DB.prepare(`INSERT OR IGNORE INTO receipts (user_id, source, ext_id, store, what, category, amount_cents, currency, date, message_id, gmail_id, hidden, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`)
    .bind(userId, source, String(extId), found.store, found.what, found.category, found.amountCents, found.currency, date,
      extra.messageId ?? null, extra.gmailId ?? null, Date.now()).run();
  if (res.meta?.changes && found.domain) {
    await env.DB.prepare("INSERT OR REPLACE INTO receipt_domains (receipt_id, domain) VALUES (?, ?)").bind(res.meta.last_row_id, found.domain).run();
  }
}

/**
 * Make every receipt from the same shop share one category (fixes older ones that were guessed
 * from their subject). A category the person chose wins; then the shop's known brand; then the most common.
 */
async function harmonize(env, userId) {
  const { results: rows } = await env.DB.prepare(`SELECT r.id, r.store, r.category, COALESCE(d.domain, (SELECT m.from_addr FROM messages m WHERE m.id = r.message_id)) AS dom
    FROM receipts r LEFT JOIN receipt_domains d ON d.receipt_id = r.id WHERE r.user_id = ? LIMIT 3000`).bind(userId).all();
  const results = rows.map((r) => ({ ...r, domain: baseDomain(r.dom || "") }));
  const { results: rules } = await env.DB.prepare("SELECT store_key, category FROM store_categories WHERE user_id = ?").bind(userId).all();
  const ruleOf = new Map(rules.map((r) => [r.store_key, r.category]));
  const groups = new Map();
  for (const r of results) {
    const k = storeKey(r.domain, r.store);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  for (const [k, list] of groups) {
    let want = ruleOf.get(k) || brandCategory(`${list[0].store} ${list[0].domain || ""}`);
    if (!want) {
      const count = {};
      for (const r of list) count[r.category] = (count[r.category] || 0) + 1;
      want = Object.entries(count).sort((a, b) => b[1] - a[1])[0][0];
    }
    const wrong = list.filter((r) => r.category !== want).map((r) => r.id);
    for (let i = 0; i < wrong.length; i += 90) {
      const part = wrong.slice(i, i + 90);
      await env.DB.prepare(`UPDATE receipts SET category = ? WHERE user_id = ? AND id IN (${part.map(() => "?").join(",")})`).bind(want, userId, ...part).run();
    }
  }
}

/** Called for each new mail that arrives at Ranilix. */
export async function noteReceipt(env, userId, messageId, mail) {
  try {
    const found = detectReceipt(mail);
    if (found) await saveReceipt(env, userId, "ranilix", messageId, mail.date || Date.now(), found, { messageId });
  } catch (e) { console.error("receipt", e?.message); }
}

/* ---------- months ---------- */

const TZ = "Asia/Jerusalem";
function ymdIn(ts) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(ts));
  const get = (t) => Number(p.find((x) => x.type === t).value);
  return { y: get("year"), m: get("month"), d: get("day") };
}
const monthKey = (y, m) => `${y}-${String(m).padStart(2, "0")}`;
export const thisMonth = (ts = Date.now()) => { const { y, m } = ymdIn(ts); return monthKey(y, m); };
export function shiftMonth(key, by) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return monthKey(d.getUTCFullYear(), d.getUTCMonth() + 1);
}
/** [start, end) in ms for a month in Israel time (close enough: Israel is UTC+2/+3). */
export function monthRange(key) {
  const [y, m] = key.split("-").map(Number);
  const offset = (yy, mm) => {
    // Israel's offset on the 1st of that month, in ms.
    const t = Date.UTC(yy, mm - 1, 1, 12);
    const local = new Date(new Date(t).toLocaleString("en-US", { timeZone: TZ }));
    const utc = new Date(new Date(t).toLocaleString("en-US", { timeZone: "UTC" }));
    return local - utc;
  };
  const start = Date.UTC(y, m - 1, 1) - offset(y, m);
  const ny = m === 12 ? y + 1 : y; const nm = m === 12 ? 1 : m + 1;
  const end = Date.UTC(ny, nm - 1, 1) - offset(ny, nm);
  return [start, end];
}

async function monthData(env, userId, key) {
  const [from, to] = monthRange(key);
  const { results } = await env.DB.prepare(`SELECT r.*, (SELECT COUNT(*) FROM attachments a WHERE a.message_id = r.message_id AND a.user_id = r.user_id) AS files,
      COALESCE(d.domain, (SELECT m.from_addr FROM messages m WHERE m.id = r.message_id)) AS dom
    FROM receipts r LEFT JOIN receipt_domains d ON d.receipt_id = r.id WHERE r.user_id = ? AND r.date >= ? AND r.date < ? ORDER BY r.date DESC LIMIT 500`).bind(userId, from, to).all();
  const shown = results.filter((r) => !r.hidden);
  const totals = {};
  const byCat = {};
  for (const r of shown) {
    totals[r.currency] = (totals[r.currency] || 0) + r.amount_cents;
    if (r.currency === "ILS") byCat[r.category] = (byCat[r.category] || 0) + r.amount_cents;
  }
  return {
    month: key,
    receipts: results.map((r) => ({
      id: String(r.id), source: r.source, store: r.store, what: r.what, category: r.category, amount: r.amount_cents / 100,
      currency: r.currency, domain: baseDomain(r.dom || ""), date: r.date, messageId: r.message_id ? String(r.message_id) : null, gmailId: r.gmail_id, hidden: !!r.hidden, files: r.files || 0,
    })),
    totals: Object.fromEntries(Object.entries(totals).map(([c, v]) => [c, v / 100])),
    byCategory: Object.entries(byCat).map(([category, v]) => ({ category, amount: v / 100 })).sort((a, b) => b.amount - a.amount),
    count: shown.length,
  };
}

async function prefs(env, userId) {
  const row = await env.DB.prepare("SELECT * FROM money_prefs WHERE user_id = ?").bind(userId).first();
  return { summary: row ? !!row.monthly_summary : true, lastSummary: row?.last_summary || "", lastScan: row?.last_scan || 0 };
}
async function setPrefs(env, userId, fields) {
  const cur = await prefs(env, userId);
  const next = { ...cur, ...fields };
  await env.DB.prepare("INSERT OR REPLACE INTO money_prefs (user_id, monthly_summary, last_summary, last_scan) VALUES (?, ?, ?, ?)")
    .bind(userId, next.summary ? 1 : 0, next.lastSummary || null, next.lastScan || 0).run();
}

/* ---------- looking for receipts in old mail ---------- */

const GMAIL_QUERY = 'newer_than:180d -in:chats (category:purchases OR subject:(receipt OR invoice OR "order confirmation" OR "your order" OR "payment received" OR קבלה OR חשבונית OR "אישור הזמנה" OR "אישור תשלום" OR "הזמנתך"))';

async function scan(env, userId, h) {
  let ranilix = 0;
  let gmail = 0;
  const since = Date.now() - 180 * 24 * 3600 * 1000;
  const { results } = await env.DB.prepare(`SELECT id, from_name, from_addr, subject, body, date FROM messages m
    WHERE user_id = ? AND folder = 'inbox' AND date > ? AND NOT EXISTS (SELECT 1 FROM receipts r WHERE r.user_id = m.user_id AND r.source = 'ranilix' AND r.ext_id = CAST(m.id AS TEXT))
    ORDER BY date DESC LIMIT 1500`).bind(userId, since).all();
  for (const m of results) {
    const found = detectReceipt({ fromName: m.from_name, fromAddr: m.from_addr, subject: m.subject, text: m.body });
    if (found) { await saveReceipt(env, userId, "ranilix", m.id, m.date, found, { messageId: m.id }); ranilix++; }
  }
  const connected = await env.DB.prepare("SELECT 1 FROM google_accounts WHERE user_id = ?").bind(userId).first();
  let gmailError = null;
  if (connected) {
    const fail = (status, message, code) => { throw new h.HttpError(status, message, code); };
    try {
      const list = await gmailCall(env, userId, `messages?maxResults=60&q=${encodeURIComponent(GMAIL_QUERY)}`, fail);
      const ids = (list.messages || []).map((m) => m.id);
      const { results: have } = ids.length
        ? await env.DB.prepare(`SELECT ext_id FROM receipts WHERE user_id = ? AND source = 'gmail' AND ext_id IN (${ids.map(() => "?").join(",")})`).bind(userId, ...ids).all()
        : { results: [] };
      const known = new Set(have.map((r) => r.ext_id));
      for (const id of ids.filter((x) => !known.has(x)).slice(0, 40)) {
        const full = gmailMessage(await gmailCall(env, userId, `messages/${id}?format=full`, fail));
        const text = full.text || (full.html ? h.htmlToText(full.html) : full.snippet || "");
        const found = detectReceipt({ fromName: full.from.name, fromAddr: full.from.email, subject: full.subject, text });
        if (found) { await saveReceipt(env, userId, "gmail", id, full.date, found, { gmailId: id }); gmail++; }
      }
    } catch (e) {
      gmailError = e?.code || "google_failed";
    }
  }
  await setPrefs(env, userId, { lastScan: Date.now() });
  return { ranilix, gmail, gmailConnected: !!connected, gmailError };
}

/* ---------- the monthly summary card ---------- */

const CAT_HE = { food: "אוכל ומסעדות", ride: "תחבורה", home: "בית וחשבונות", shop: "קניות", subs: "מנויים", other: "אחר" };
const MONTHS_HE = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
const money = (v, c = "ILS") => `${{ ILS: "₪", USD: "$", EUR: "€" }[c] || ""}${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Put the summary for a month in the person's inbox. Returns the message id, or null when there's nothing. */
export async function sendSummary(env, userId, key, h) {
  await harmonize(env, userId);
  const data = await monthData(env, userId, key);
  if (!data.count) return null;
  const prev = await monthData(env, userId, shiftMonth(key, -1));
  const [y, m] = key.split("-").map(Number);
  const title = `${MONTHS_HE[m - 1]} ${y}`;
  const shown = data.receipts.filter((r) => !r.hidden);
  const card = {
    month: key, title, totals: data.totals, prevTotal: prev.totals.ILS || 0, count: data.count,
    fromGmail: shown.filter((r) => r.source === "gmail").length,
    byCategory: data.byCategory,
    receipts: [...shown].sort((a, b) => b.amount - a.amount).slice(0, 12).map((r) => ({ store: r.store, domain: r.domain, amount: r.amount, currency: r.currency, date: r.date, source: r.source })),
  };
  const lines = [
    `הסיכום החודשי שלך: ${title}`,
    "",
    `סה"כ: ${money(data.totals.ILS || 0)} (${data.count} קבלות)`,
    ...Object.entries(data.totals).filter(([c]) => c !== "ILS").map(([c, v]) => `ועוד ${money(v, c)}`),
    "",
    ...data.byCategory.map((c) => `${CAT_HE[c.category] || c.category}: ${money(c.amount)}`),
    "",
    "הקבלות של החודש:",
    ...card.receipts.map((r) => `${r.store} · ${money(r.amount, r.currency)}`),
  ];
  const userRow = await env.DB.prepare("SELECT username FROM users WHERE id = ?").bind(userId).first();
  const messageId = await h.insertMessage(env, userId, {
    folder: "inbox", fromName: "Ranilix", fromAddr: `team@${env.MAIL_DOMAIN}`, to: userRow ? `${userRow.username}@${env.MAIL_DOMAIN}` : "",
    subject: `הסיכום החודשי שלך · ${title}`, body: lines.join("\n"), date: Date.now(),
  });
  await env.DB.prepare("INSERT OR REPLACE INTO message_cards (message_id, user_id, kind, data) VALUES (?, ?, 'monthly_summary', ?)")
    .bind(messageId, userId, JSON.stringify(card)).run();
  // The receipt files that came by mail travel with the summary (the same stored files, no copies).
  const { results: files } = await env.DB.prepare(`SELECT a.filename, a.mime, a.size, a.kv_key FROM attachments a
    JOIN receipts r ON r.message_id = a.message_id AND r.user_id = a.user_id
    WHERE r.user_id = ? AND r.hidden = 0 AND r.date >= ? AND r.date < ? LIMIT 20`).bind(userId, ...monthRange(key)).all();
  for (const f of files) {
    await env.DB.prepare("INSERT INTO attachments (user_id, message_id, filename, mime, size, kv_key) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(userId, messageId, f.filename, f.mime, f.size, f.kv_key).run();
  }
  await h.notifyUser?.(env, userId);
  return messageId;
}

/** Daily: on the 1st (Israel time) send last month's summary to everyone who had receipts. */
export async function monthlySummaries(env, h) {
  const { d } = ymdIn(Date.now());
  if (d !== 1) return;
  const key = shiftMonth(thisMonth(), -1);
  const [from, to] = monthRange(key);
  const { results } = await env.DB.prepare("SELECT DISTINCT user_id FROM receipts WHERE hidden = 0 AND date >= ? AND date < ?").bind(from, to).all();
  for (const { user_id: userId } of results) {
    const p = await prefs(env, userId);
    if (!p.summary || p.lastSummary === key) continue;
    try {
      await sendSummary(env, userId, key, h);
      await setPrefs(env, userId, { lastSummary: key });
    } catch (e) { console.error("summary", userId, e?.message); }
  }
}

/* ---------- routes: /api/receipts* ---------- */

export async function receiptsRoute(req, env, path, url, user, h) {
  if (!path.startsWith("/api/receipts")) return null;
  const { HttpError, json, readJson } = h;

  if (path === "/api/receipts" && req.method === "GET") {
    const key = /^\d{4}-\d{2}$/.test(url.searchParams.get("month") || "") ? url.searchParams.get("month") : thisMonth();
    await harmonize(env, user.id);
    const data = await monthData(env, user.id, key);
    const prev = await monthData(env, user.id, shiftMonth(key, -1));
    const p = await prefs(env, user.id);
    const connected = await env.DB.prepare("SELECT google_email FROM google_accounts WHERE user_id = ?").bind(user.id).first();
    return json({ ...data, prevTotal: prev.totals.ILS || 0, summaryOn: p.summary, lastScan: p.lastScan, gmail: connected ? connected.google_email || true : false });
  }

  if (path === "/api/receipts/scan" && req.method === "POST") {
    await h.rateLimit(env, `rscan:${user.id}`, 10, 3600 * 1000);
    return json(await scan(env, user.id, h));
  }

  if (path === "/api/receipts/settings" && req.method === "PUT") {
    const { summary } = await readJson(req);
    await setPrefs(env, user.id, { summary: !!summary });
    return json({ summaryOn: !!summary });
  }

  if (path === "/api/receipts/summary" && req.method === "POST") {
    const { month } = await readJson(req);
    const key = /^\d{4}-\d{2}$/.test(month || "") ? month : thisMonth();
    await h.rateLimit(env, `rsum:${user.id}`, 10, 3600 * 1000);
    const id = await sendSummary(env, user.id, key, h);
    if (!id) throw new HttpError(400, "No receipts in that month.", "receipts_none");
    return json({ ok: true, messageId: String(id) });
  }

  const one = path.match(/^\/api\/receipts\/(\d+)$/);
  if (one && req.method === "PATCH") {
    const body = await readJson(req);
    if (CATEGORIES.includes(body.category)) {
      const r = await env.DB.prepare("SELECT r.store, d.domain, m.from_addr FROM receipts r LEFT JOIN receipt_domains d ON d.receipt_id = r.id LEFT JOIN messages m ON m.id = r.message_id WHERE r.id = ? AND r.user_id = ?").bind(Number(one[1]), user.id).first();
      if (!r) throw new HttpError(404, "Not found.", "not_found");
      const k = storeKey(r.domain || baseDomain(r.from_addr || ""), r.store);
      await env.DB.prepare("INSERT OR REPLACE INTO store_categories (user_id, store_key, category) VALUES (?, ?, ?)").bind(user.id, k, body.category).run();
      await harmonize(env, user.id);
    }
    const sets = []; const vals = [];
    if (CATEGORIES.includes(body.category)) { sets.push("category = ?"); vals.push(body.category); }
    if (typeof body.hidden === "boolean") { sets.push("hidden = ?"); vals.push(body.hidden ? 1 : 0); }
    if (!sets.length) throw new HttpError(400, "Nothing to update.");
    const res = await env.DB.prepare(`UPDATE receipts SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`).bind(...vals, Number(one[1]), user.id).run();
    if (!res.meta.changes) throw new HttpError(404, "Not found.", "not_found");
    return json({ ok: true });
  }

  throw new HttpError(404, "Not found.", "not_found");
}
