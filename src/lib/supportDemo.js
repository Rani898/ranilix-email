// Demo backend for the help window chat (used when the site runs without a server).
// Everything lives in this browser, so the "support team" here is a friendly robot.

import { ApiError } from "./api.js";

const KEY = "ranilix.demo.support";
const MAX = 2000;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function load() {
  try { return { online: true, seq: 1, threads: [], ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return { online: true, seq: 1, threads: [] }; }
}
function save(db) {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* ignore */ }
}
const lang = () => (document.documentElement.lang === "he" ? "he" : "en");
const owner = (email) => email || "guest";

const TEXT = {
  he: {
    welcome: "תודה שכתבת לנו! 🙌\nההודעה הגיעה לצוות התמיכה. אנחנו מחוברים עכשיו ונענה כאן בקרוב.",
    reply: "היי! 👋 זו גרסת ההדגמה של האתר, אז עונה לך רובוט. באתר האמיתי, מישהו מהצוות יענה כאן בעצמו.",
    closed: "השיחה סומנה כפתורה. אם יש עוד משהו, פשוט כתבו כאן והיא תיפתח מחדש.",
  },
  en: {
    welcome: "Thanks for writing to us! 🙌\nYour message reached our support team. We're online now and will answer here soon.",
    reply: "Hi! 👋 This is the demo version of the site, so a robot is answering. On the real site, someone from the team answers here personally.",
    closed: "This conversation was marked as solved. If there's anything else, just write here and it opens again.",
  },
};

const pub = (t, admin = false) => ({
  id: t.id, topic: t.topic, status: t.status, rating: t.rating ?? null, createdAt: t.createdAt, updatedAt: t.updatedAt,
  lastFrom: t.lastFrom, lastPreview: t.lastPreview, unread: admin ? t.adminUnread : t.userUnread,
  ...(admin ? { name: t.name, email: t.email, member: t.owner !== "guest", lang: t.lang, page: t.page, userAgent: "" } : {}),
});

function push(db, t, sender, author, body) {
  const m = { id: String(db.seq++), sender, author, body, createdAt: Date.now() };
  t.messages.push(m);
  t.updatedAt = m.createdAt;
  t.lastFrom = sender;
  t.lastPreview = body.slice(0, 140);
  return m;
}

function check(text) {
  const s = String(text || "").trim();
  if (s.length < 2) throw new ApiError("", "support_short");
  if (s.length > MAX) throw new ApiError("", "support_long", { max: MAX });
  return s;
}

function find(db, email, id) {
  const t = db.threads.find((x) => x.id === String(id) && x.owner === owner(email));
  if (!t) throw new ApiError("", "support_not_found");
  return t;
}

export const info = async () => ({ online: load().online });

export async function userThreads(email) {
  const list = load().threads.filter((t) => t.owner === owner(email)).sort((a, b) => b.updatedAt - a.updatedAt);
  return { threads: list.map((t) => pub(t)), unread: list.reduce((s, t) => s + t.userUnread, 0) };
}

export async function userThread(email, id) {
  const db = load();
  const t = find(db, email, id);
  t.userUnread = 0;
  save(db);
  return { thread: pub(t), messages: t.messages };
}

export async function start(email, { message, name, email: contact, topic, page }) {
  await delay(300);
  const text = check(message);
  const db = load();
  const now = Date.now();
  const t = {
    id: String(db.seq++), owner: owner(email), name: String(name || "").slice(0, 60), email: email || String(contact || ""),
    topic: String(topic || ""), status: "open", rating: null, lang: lang(), page: String(page || ""),
    createdAt: now, updatedAt: now, userUnread: 0, adminUnread: 1, messages: [],
  };
  push(db, t, "user", t.name, text);
  push(db, t, "bot", "Ranilix", TEXT[t.lang].welcome);
  db.threads.push(t);
  save(db);
  // The demo "team" answers by itself after a few seconds.
  setTimeout(() => {
    const d = load();
    const x = d.threads.find((y) => y.id === t.id);
    if (!x || x.messages.some((m) => m.sender === "admin")) return;
    push(d, x, "admin", "Ranilix", TEXT[x.lang].reply);
    x.userUnread += 1;
    save(d);
  }, 3500);
  return { thread: pub(t), messages: t.messages };
}

export async function send(email, id, message) {
  await delay(200);
  const text = check(message);
  const db = load();
  const t = find(db, email, id);
  const m = push(db, t, "user", t.name, text);
  t.status = "open";
  t.adminUnread += 1;
  save(db);
  return { ok: true, messages: [m] };
}

export async function rate(email, id, rating) {
  const db = load();
  const t = find(db, email, id);
  t.rating = rating === 1 ? 1 : -1;
  save(db);
  return { ok: true, rating: t.rating };
}

/* ---- Admin side (demo) ---- */
export async function adminList(status = "open") {
  const db = load();
  const list = db.threads.filter((t) => status === "all" || t.status === status)
    .sort((a, b) => (b.adminUnread > 0) - (a.adminUnread > 0) || b.updatedAt - a.updatedAt);
  const count = (s) => db.threads.filter((t) => t.status === s).length;
  return {
    threads: list.map((t) => pub(t, true)), open: count("open"), closed: count("closed"), all: db.threads.length,
    unread: db.threads.filter((t) => t.adminUnread > 0).length, online: db.online,
  };
}
export async function adminGet(id) {
  const db = load();
  const t = db.threads.find((x) => x.id === String(id));
  if (!t) throw new ApiError("", "support_not_found");
  t.adminUnread = 0;
  save(db);
  return { thread: { ...pub(t, true), otherThreads: db.threads.filter((x) => x.owner === t.owner && x.owner !== "guest" && x.id !== t.id).length }, messages: t.messages };
}
export async function adminReply(id, message, author) {
  const text = String(message || "").trim();
  if (!text) throw new ApiError("", "support_short");
  const db = load();
  const t = db.threads.find((x) => x.id === String(id));
  if (!t) throw new ApiError("", "support_not_found");
  const m = push(db, t, "admin", author, text);
  t.status = "open";
  t.userUnread += 1;
  t.adminUnread = 0;
  save(db);
  return { ok: true, emailed: false, messages: [m] };
}
export async function adminSetStatus(id, status) {
  const db = load();
  const t = db.threads.find((x) => x.id === String(id));
  if (!t) throw new ApiError("", "support_not_found");
  if (status === "closed" && t.status !== "closed") {
    push(db, t, "bot", "Ranilix", TEXT[t.lang].closed);
    t.userUnread += 1;
  }
  t.status = status === "closed" ? "closed" : "open";
  save(db);
  return { ok: true, status: t.status };
}
export async function adminDelete(id) {
  const db = load();
  db.threads = db.threads.filter((x) => x.id !== String(id));
  save(db);
  return { ok: true };
}
export async function adminSetOnline(online) {
  const db = load();
  db.online = !!online;
  save(db);
  return { online: db.online };
}
