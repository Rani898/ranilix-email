// Ranilix Email API — Cloudflare Worker
//  • fetch(): JSON API used by the website (signup, login, inbox, send, attachments)
//  • email(): receives incoming mail from Cloudflare Email Routing and stores it
//
// Errors are returned as { error, code, params } so the site can show them in Hebrew or English.

import PostalMime from "postal-mime";
import { Buffer } from "node:buffer";
import { googleRoute } from "./google.js";
import { supportAdminRoute, supportRoute } from "./support.js";
import { notifyUser, validPushEndpoint, vapidPublicKey } from "./push.js";
import { createLogger, discordAdminStatus, discordInteraction, discordNotify, discordRegister } from "./discord.js";

/* ------------------------------------------------------------------ */
/* Config & helpers                                                    */
/* ------------------------------------------------------------------ */

const RESERVED = new Set([
  "admin", "administrator", "support", "help", "info", "root", "postmaster", "hostmaster",
  "abuse", "noreply", "no-reply", "security", "ranilix", "team", "tips", "webmaster", "mail",
]);
const USERNAME_MIN = 4;
// Each person can own this many addresses unless an admin raises it (account_limits).
const DEFAULT_ACCOUNTS = 5;
const USERNAME_MAX = 30;
const PASSWORD_MIN = 8;
const PBKDF2_ITERATIONS = 100_000; // Workers' maximum for PBKDF2
const MAX_BODY_CHARS = 100_000;
const MAX_INBOUND_BYTES = 25 * 1024 * 1024;
const MAX_FILES = 10;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
const DAY = 24 * 3600 * 1000;
// Sending to other providers (Gmail etc.) goes through Resend. Its free plan allows 100/day,
// so we stay under that globally and also limit each user, to protect the domain from spam use.
const OUTBOUND_PER_USER_DAY = 20;
const OUTBOUND_GLOBAL_DAY = 95;

const enc = new TextEncoder();
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const randomHex = (bytes) => toHex(crypto.getRandomValues(new Uint8Array(bytes)));
const sha256 = async (s) => toHex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
const mb = (n) => `${Math.round(n / (1024 * 1024))} MB`;

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hashPassword(password, saltHex) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const salt = new Uint8Array(saltHex.match(/../g).map((h) => parseInt(h, 16)));
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS }, key, 256);
  return toHex(bits);
}

export function validateUsername(u) {
  if (typeof u !== "string" || !u) return "Pick a name for your address.";
  if (u.length < USERNAME_MIN) return `Use at least ${USERNAME_MIN} characters.`;
  if ((u.match(/[a-z0-9]/g) || []).length < USERNAME_MIN) return `Use at least ${USERNAME_MIN} letters or numbers.`;
  if (u.length > USERNAME_MAX) return `Use at most ${USERNAME_MAX} characters.`;
  if (!/^[a-z0-9._-]+$/.test(u)) return "Use only lowercase letters, numbers, dots, dashes and underscores.";
  if (!/^[a-z0-9]/.test(u) || !/[a-z0-9]$/.test(u)) return "Start and end with a letter or number.";
  if (/[._-]{2,}/.test(u)) return "Avoid two symbols in a row.";
  return "";
}

function validatePassword(p) {
  if (typeof p !== "string" || p.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (p.length > 200) return "That password is too long.";
  const score = [/[a-z]/.test(p) && /[A-Z]/.test(p), /\d/.test(p), /[^A-Za-z0-9]/.test(p), p.length >= PASSWORD_MIN].filter(Boolean).length;
  if (score < 3) return "Add a mix of letters, numbers or symbols.";
  return "";
}

const isEmail = (s) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(s);

/** Very small HTML → text fallback for mails with no text part. We never store or serve raw HTML. */
function htmlToText(html) {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, "")
    // Keep link targets (verification buttons etc.): <a href="URL">Verify</a> → "Verify (URL)"
    .replace(/<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, inner) => {
      const label = inner.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      if (!/^https?:/i.test(href)) return label;
      return !label || label === href ? ` ${href} ` : `${label} (${href})`;
    })
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Make a file name safe to store and send back in a header. */
function cleanFilename(name) {
  const n = String(name || "file").replace(/[\u0000-\u001f\\/:*?"<>|]+/g, "_").trim().slice(0, 150);
  return n || "file";
}

/* ------------------------------------------------------------------ */
/* HTTP plumbing                                                       */
/* ------------------------------------------------------------------ */

class HttpError extends Error {
  constructor(status, message, code = "generic", params) {
    super(message);
    this.status = status;
    this.code = code;
    this.params = params;
  }
}

function corsHeaders(req, env) {
  const origin = req.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const h = {
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Support-Key",
    "Access-Control-Expose-Headers": "Content-Disposition",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (allowed.includes(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...extra } });

async function readJson(req) {
  try { return await req.json(); } catch { throw new HttpError(400, "Invalid request."); }
}

async function rateLimit(env, key, limit, windowMs) {
  const now = Date.now();
  const row = await env.DB.prepare("SELECT count, window_start FROM rate_limits WHERE key = ?").bind(key).first();
  if (!row || now - row.window_start > windowMs) {
    await env.DB.prepare("INSERT OR REPLACE INTO rate_limits (key, count, window_start) VALUES (?, 1, ?)").bind(key, now).run();
    return;
  }
  if (row.count >= limit) throw new HttpError(429, "Too many attempts. Please wait a bit and try again.", "rate_limited");
  await env.DB.prepare("UPDATE rate_limits SET count = count + 1 WHERE key = ?").bind(key).run();
}

async function createSession(env, userId, remember) {
  const token = randomHex(32);
  const expires = Date.now() + (remember ? 30 * DAY : DAY);
  await env.DB.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(await sha256(token), userId, expires).run();
  return token;
}

async function requireUser(req, env) {
  const auth = req.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) throw new HttpError(401, "Please log in.", "session");
  const row = await env.DB.prepare(
    "SELECT u.id, u.username, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?"
  ).bind(await sha256(token)).first();
  if (!row || row.expires_at < Date.now()) throw new HttpError(401, "Your session has ended. Please log in again.", "session");
  if (await isSuspended(env, row.id)) throw new HttpError(401, "This account is suspended.", "suspended");
  return { id: row.id, username: row.username, email: `${row.username}@${env.MAIL_DOMAIN}` };
}

const toClientMessage = (m, attachments = []) => ({
  id: String(m.id),
  folder: m.folder,
  from: { name: m.from_name || m.from_addr, email: m.from_addr },
  to: m.to_addr,
  subject: m.subject,
  body: m.body,
  date: m.date,
  read: !!m.is_read,
  starred: !!m.starred,
  attachments: attachments.map((a) => ({ id: String(a.id), filename: a.filename, mime: a.mime, size: a.size })),
});

/** Insert a message and return its id. */
async function insertMessage(env, userId, m) {
  const res = await env.DB.prepare(
    "INSERT INTO messages (user_id, folder, from_name, from_addr, to_addr, subject, body, date, is_read, starred) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)"
  ).bind(userId, m.folder, m.fromName || "", m.fromAddr || "", m.to || "", (m.subject || "(no subject)").slice(0, 500),
    (m.body || "").slice(0, MAX_BODY_CHARS), m.date || Date.now(), m.read ? 1 : 0).run();
  return res.meta.last_row_id;
}

/** Link already-stored files ({filename, mime, size, kv_key}) to a message. */
async function linkAttachments(env, userId, messageId, files) {
  for (const f of files) {
    await env.DB.prepare("INSERT INTO attachments (user_id, message_id, filename, mime, size, kv_key) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(userId, messageId, f.filename, f.mime, f.size, f.kv_key).run();
  }
}

/** Store bytes in KV and return the key. */
async function storeFile(env, bytes, mime) {
  if (!env.FILES) throw new HttpError(503, "File storage isn't set up on the server yet.");
  const key = `att/${randomHex(16)}`;
  await env.FILES.put(key, bytes, { metadata: { mime } });
  return key;
}

/** Delete KV files that no attachment row points to any more. */
async function cleanupFiles(env, keys) {
  if (!env.FILES) return;
  for (const key of new Set(keys)) {
    const still = await env.DB.prepare("SELECT 1 FROM attachments WHERE kv_key = ? LIMIT 1").bind(key).first();
    if (!still) await env.FILES.delete(key);
  }
}

const WELCOME = {
  en: (email) => ({
    subject: "Welcome to your new inbox 🎉",
    body: `Hi there,\n\nYour free address ${email} is ready.\n\nGive it to friends and services you use: emails sent to it will show up right here. You can reply, forward, and attach photos and documents.\n\nRanilix Email is free forever. No credit card, no hidden fees.\n\nEnjoy,\nThe Ranilix Team`,
  }),
  he: (email) => ({
    subject: "ברוכים הבאים לתיבת הדואר החדשה 🎉",
    body: `היי,\n\nהכתובת החינמית שלך ${email} מוכנה.\n\nתנו אותה לחברים ולשירותים שאתם משתמשים בהם: מיילים שיישלחו אליה יופיעו כאן. אפשר לענות, להעביר ולצרף תמונות ומסמכים.\n\nRanilix Email חינמי לתמיד. בלי כרטיס אשראי ובלי עלויות נסתרות.\n\nתהנו,\nצוות Ranilix`,
  }),
};

/** Read the send form: JSON or multipart (with files). */
async function readSendRequest(req) {
  const type = req.headers.get("Content-Type") || "";
  if (type.includes("multipart/form-data")) {
    const form = await req.formData();
    const files = form.getAll("files").filter((f) => typeof f === "object" && f !== null && "arrayBuffer" in f);
    return {
      to: String(form.get("to") || ""),
      subject: String(form.get("subject") || ""),
      body: String(form.get("body") || ""),
      forward: form.getAll("forward").map(String),
      files,
    };
  }
  const data = await readJson(req);
  return { to: data.to, subject: data.subject, body: data.body, forward: data.forward || [], files: [] };
}

/* ------------------------------------------------------------------ */
/* Admin helpers                                                       */
/* ------------------------------------------------------------------ */

/* ---- Address groups: one person can own up to N addresses ---- */

const ownerOf = async (env, userId) =>
  (await env.DB.prepare("SELECT owner_id FROM account_owners WHERE user_id = ?").bind(userId).first())?.owner_id ?? userId;

/** How many addresses a person (owner) has, and how many they may have. */
async function groupInfo(env, ownerId) {
  const [own, linked, limit] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE id = ?").bind(ownerId).first(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM account_owners WHERE owner_id = ? AND user_id != ?").bind(ownerId, ownerId).first(),
    env.DB.prepare("SELECT max_accounts FROM account_limits WHERE owner_id = ?").bind(ownerId).first(),
  ]);
  return { used: own.n + linked.n, max: limit?.max_accounts ?? DEFAULT_ACCOUNTS };
}

/** The signed-in user behind any of the given session tokens (the browser sends its saved accounts). */
async function firstValidUser(env, tokens) {
  for (const tok of (Array.isArray(tokens) ? tokens : []).slice(0, 10)) {
    if (typeof tok !== "string" || !tok) continue;
    const row = await env.DB.prepare("SELECT user_id, expires_at FROM sessions WHERE token_hash = ?").bind(await sha256(tok)).first();
    if (row && row.expires_at > Date.now()) return row.user_id;
  }
  return null;
}

/* ---- Profiles (display name, signature, photo) ---- */

const MAX_AVATAR_CHARS = 200_000; // a 256px JPEG data URL is ~20–40 KB
// Names that could be used to pretend to be the site's staff.
const STAFF_NAME_RE = /ranilix|admin|support|security|official|team|staff|צוות|מנהל|תמיכה|אבטחה|רשמי/i;
const cleanName = (s) => String(s || "").replace(/[<>"\r\n\t]/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
async function getProfile(env, userId) {
  const row = await env.DB.prepare("SELECT display_name, signature, avatar IS NOT NULL AS has_avatar, updated_at FROM profiles WHERE user_id = ?").bind(userId).first();
  return { displayName: row?.display_name || "", signature: row?.signature || "", hasAvatar: !!row?.has_avatar, updatedAt: row?.updated_at || 0 };
}
async function upsertProfile(env, userId, fields) {
  const cur = await env.DB.prepare("SELECT * FROM profiles WHERE user_id = ?").bind(userId).first();
  const next = { display_name: cur?.display_name ?? "", signature: cur?.signature ?? "", avatar: cur?.avatar ?? null, ...fields };
  await env.DB.prepare("INSERT OR REPLACE INTO profiles (user_id, display_name, signature, avatar, updated_at) VALUES (?, ?, ?, ?, ?)")
    .bind(userId, next.display_name, next.signature, next.avatar, Date.now()).run();
}
const REPORT_CATEGORIES = new Set(["bug", "idea", "spam", "account", "other"]);

const adminSet = (env) => new Set((env.ADMIN_USERS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
const isAdmin = (env, username) => adminSet(env).has(String(username).toLowerCase());

async function getSettings(env) {
  const { results } = await env.DB.prepare("SELECT key, value FROM settings").all();
  const s = Object.fromEntries(results.map((r) => [r.key, r.value]));
  return {
    signupsOpen: s.signups_open !== "0",
    outboundEnabled: s.outbound_enabled !== "0",
    outboundConfigured: !!env.RESEND_API_KEY,
    announcement: { enabled: s.announcement_enabled === "1", text: s.announcement_text || "", level: s.announcement_level || "info" },
  };
}
const setSetting = (env, key, value) =>
  env.DB.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(key, String(value)).run();

const isSuspended = async (env, userId) =>
  !!(await env.DB.prepare("SELECT 1 FROM user_meta WHERE user_id = ? AND suspended = 1").bind(userId).first());

/** Delete a user with all their mail and files. */
async function deleteUserCompletely(env, userId) {
  const { results: atts } = await env.DB.prepare("SELECT kv_key FROM attachments WHERE user_id = ?").bind(userId).all();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM attachments WHERE user_id = ?").bind(userId),
    env.DB.prepare("DELETE FROM messages WHERE user_id = ?").bind(userId),
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId),
    env.DB.prepare("DELETE FROM user_meta WHERE user_id = ?").bind(userId),
    env.DB.prepare("DELETE FROM google_accounts WHERE user_id = ?").bind(userId),
    env.DB.prepare("DELETE FROM account_owners WHERE user_id = ?").bind(userId),
    env.DB.prepare("DELETE FROM profiles WHERE user_id = ?").bind(userId),
    env.DB.prepare("DELETE FROM push_subs WHERE user_id = ?").bind(userId),
    env.DB.prepare("DELETE FROM discord_links WHERE user_id = ?").bind(userId),
    env.DB.prepare("DELETE FROM support_messages WHERE thread_id IN (SELECT id FROM support_threads WHERE user_id = ?)").bind(userId),
    env.DB.prepare("DELETE FROM support_threads WHERE user_id = ?").bind(userId),
    env.DB.prepare("DELETE FROM users WHERE id = ?").bind(userId),
  ]);
  await cleanupFiles(env, atts.map((a) => a.kv_key));
}

async function adminRoute(req, env, admin, path, url, log) {
  const sup = await supportAdminRoute(req, env, admin, path, url, { HttpError, json, readJson, log, setSetting, insertMessage, notifyUser });
  if (sup) return sup;

  // GET /api/admin/stats — numbers for the overview page
  if (path === "/api/admin/stats" && req.method === "GET") {
    const now = Date.now();
    const one = (sql, ...args) => env.DB.prepare(sql).bind(...args).first();
    const [users, suspendedN, new1, new7, active7, msgs, msgs1, storage, bcasts] = await Promise.all([
      one("SELECT COUNT(*) AS n FROM users"),
      one("SELECT COUNT(*) AS n FROM user_meta WHERE suspended = 1"),
      one("SELECT COUNT(*) AS n FROM users WHERE created_at > ?", now - DAY),
      one("SELECT COUNT(*) AS n FROM users WHERE created_at > ?", now - 7 * DAY),
      one("SELECT COUNT(*) AS n FROM user_meta WHERE last_login_at > ?", now - 7 * DAY),
      one("SELECT COUNT(*) AS n FROM messages"),
      one("SELECT COUNT(*) AS n FROM messages WHERE date > ? AND folder = 'inbox'", now - DAY),
      one("SELECT COALESCE(SUM(size), 0) AS bytes, COUNT(DISTINCT kv_key) AS files FROM attachments"),
      one("SELECT COUNT(*) AS n FROM broadcasts"),
    ]);
    // Sign-ups per day for the last 14 days (UTC days)
    const start = new Date(); start.setUTCHours(0, 0, 0, 0);
    const from = start.getTime() - 13 * DAY;
    const { results: rows } = await env.DB.prepare(
      "SELECT CAST((created_at - ?) / 86400000 AS INTEGER) AS d, COUNT(*) AS n FROM users WHERE created_at >= ? GROUP BY d"
    ).bind(from, from).all();
    const signups = Array.from({ length: 14 }, (_, i) => ({ day: from + i * DAY, count: rows.find((r) => r.d === i)?.n || 0 }));
    const settings = await getSettings(env);
    return json({
      users: users.n, recipients: users.n - suspendedN.n, newToday: new1.n, newWeek: new7.n, activeWeek: active7.n,
      messages: msgs.n, receivedToday: msgs1.n, storageBytes: storage.bytes, files: storage.files,
      broadcasts: bcasts.n, signups, signupsOpen: settings.signupsOpen,
      outboundToday: (await env.DB.prepare("SELECT count, window_start FROM rate_limits WHERE key = 'out:global'").first().then((r) => (r && now - r.window_start < DAY ? r.count : 0))),
      outboundLimit: OUTBOUND_GLOBAL_DAY,
      openReports: (await env.DB.prepare("SELECT COUNT(*) AS n FROM reports WHERE status = 'open'").first()).n,
      supportUnread: (await env.DB.prepare("SELECT COUNT(*) AS n FROM support_threads WHERE admin_unread > 0").first()).n,
      supportOpen: (await env.DB.prepare("SELECT COUNT(*) AS n FROM support_threads WHERE status = 'open'").first()).n,
    });
  }

  // GET /api/admin/users?q=&offset= — searchable user list
  if (path === "/api/admin/users" && req.method === "GET") {
    const q = `%${(url.searchParams.get("q") || "").toLowerCase().replace(/[%_]/g, "")}%`;
    const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
    const { results } = await env.DB.prepare(`
      SELECT u.id, u.username, u.created_at,
             COALESCE(m.suspended, 0) AS suspended, m.last_login_at,
             COALESCE((SELECT owner_id FROM account_owners WHERE user_id = u.id), u.id) AS owner_id,
             (SELECT COUNT(*) FROM messages WHERE user_id = u.id) AS messages,
             (SELECT COALESCE(SUM(size), 0) FROM attachments WHERE user_id = u.id) AS storage
      FROM users u LEFT JOIN user_meta m ON m.user_id = u.id
      WHERE u.username LIKE ?
      ORDER BY u.created_at DESC LIMIT 50 OFFSET ?`).bind(q, offset).all();
    const total = await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE username LIKE ?").bind(q).first();
    // Address counts per person, for the owners on this page (2 queries, not one per row).
    const owners = [...new Set(results.map((u) => u.owner_id))];
    const used = new Map(owners.map((o) => [o, 0]));
    const linked = new Map(owners.map((o) => [o, []]));
    const limits = new Map();
    if (owners.length) {
      const marks = owners.map(() => "?").join(",");
      // Every address in each person's group, so the admin can see which addresses belong together.
      const { results: grp } = await env.DB.prepare(`
        SELECT COALESCE(ao.owner_id, u.id) AS o, u.id, u.username, u.created_at FROM users u LEFT JOIN account_owners ao ON ao.user_id = u.id
        WHERE COALESCE(ao.owner_id, u.id) IN (${marks}) ORDER BY u.created_at`).bind(...owners).all();
      for (const r of grp) {
        used.set(r.o, (used.get(r.o) || 0) + 1);
        linked.get(r.o)?.push({ id: String(r.id), email: `${r.username}@${env.MAIL_DOMAIN}`, createdAt: r.created_at, main: r.id === r.o });
      }
      const { results: lim } = await env.DB.prepare(`SELECT owner_id, max_accounts FROM account_limits WHERE owner_id IN (${marks})`).bind(...owners).all();
      for (const r of lim) limits.set(r.owner_id, r.max_accounts);
    }
    return json({
      total: total.n,
      users: results.map((u) => ({
        id: String(u.id), email: `${u.username}@${env.MAIL_DOMAIN}`, createdAt: u.created_at, lastLoginAt: u.last_login_at,
        messages: u.messages, storageBytes: u.storage, suspended: !!u.suspended, admin: isAdmin(env, u.username),
        accounts: { used: used.get(u.owner_id) || 1, max: limits.get(u.owner_id) ?? DEFAULT_ACCOUNTS },
        linked: linked.get(u.owner_id) || [],
      })),
    });
  }

  const userMatch = path.match(/^\/api\/admin\/users\/(\d+)(?:\/(suspend|password|accounts))?$/);
  if (userMatch) {
    const id = Number(userMatch[1]);
    const target = await env.DB.prepare("SELECT id, username FROM users WHERE id = ?").bind(id).first();
    if (!target) throw new HttpError(404, "Not found.", "not_found");
    const protectedUser = isAdmin(env, target.username);

    if (userMatch[2] === "suspend" && req.method === "POST") {
      const { suspended } = await readJson(req);
      if (protectedUser) throw new HttpError(400, "Admins can't be suspended.", "admin_protected");
      await env.DB.prepare("INSERT INTO user_meta (user_id, suspended) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET suspended = excluded.suspended")
        .bind(id, suspended ? 1 : 0).run();
      if (suspended) await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id).run();
      log("admin", suspended ? "⛔ משתמש הושעה" : "✅ השעיה בוטלה", { "מנהל": admin.email, "משתמש": `${target.username}@${env.MAIL_DOMAIN}` });
      return json({ ok: true });
    }
    // Set how many addresses this user's person/group may have.
    if (userMatch[2] === "accounts" && req.method === "PUT") {
      const { max } = await readJson(req);
      const n = Math.floor(Number(max));
      if (!Number.isFinite(n) || n < 1 || n > 100) throw new HttpError(400, "Choose a number from 1 to 100.", "accounts_range");
      const owner = await ownerOf(env, id);
      await env.DB.prepare("INSERT INTO account_limits (owner_id, max_accounts) VALUES (?, ?) ON CONFLICT(owner_id) DO UPDATE SET max_accounts = excluded.max_accounts")
        .bind(owner, n).run();
      log("admin", "🔢 שינוי מגבלת כתובות", { "מנהל": admin.email, "משתמש": `${target.username}@${env.MAIL_DOMAIN}`, "מגבלה חדשה": n });
      return json({ ok: true, accounts: await groupInfo(env, owner) });
    }
    if (userMatch[2] === "password" && req.method === "POST") {
      const { password } = await readJson(req);
      const pErr = validatePassword(password);
      if (pErr) throw new HttpError(400, pErr, "weak_password");
      const salt = randomHex(16);
      await env.DB.prepare("UPDATE users SET password_hash = ?, salt = ? WHERE id = ?").bind(await hashPassword(password, salt), salt, id).run();
      await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id).run();
      log("admin", "🔑 מנהל איפס סיסמה", { "מנהל": admin.email, "משתמש": `${target.username}@${env.MAIL_DOMAIN}` });
      return json({ ok: true });
    }
    if (!userMatch[2] && req.method === "DELETE") {
      const { confirm } = await readJson(req);
      if (protectedUser) throw new HttpError(400, "Admins can't be deleted here.", "admin_protected");
      if (String(confirm || "").toLowerCase() !== target.username) throw new HttpError(400, "Type the username to confirm.", "confirm_mismatch");
      await deleteUserCompletely(env, id);
      log("admin", "🗑️ מנהל מחק משתמש", { "מנהל": admin.email, "משתמש": `${target.username}@${env.MAIL_DOMAIN}` });
      return json({ ok: true });
    }
  }

  // Discord bot
  if (path === "/api/admin/discord" && req.method === "GET") return json(await discordAdminStatus(env));
  if (path === "/api/admin/discord/register" && req.method === "POST") {
    try {
      const n = await discordRegister(env);
      log("admin", "🤖 פקודות הבוט נרשמו", { "מנהל": admin.email, "פקודות": n });
      return json({ ok: true, commands: n });
    } catch (e) {
      console.error("discord register", e.message);
      const code = e.message === "no_token" ? "discord_no_token" : e.message === "no_app_id" ? "discord_no_app" : "discord_failed";
      throw new HttpError(400, "Couldn't register the Discord commands.", code);
    }
  }

  // Reports from users
  if (path === "/api/admin/reports" && req.method === "GET") {
    const status = url.searchParams.get("status") || "open";
    const where = status === "all" ? "" : "WHERE status = ?";
    const stmt = env.DB.prepare(`SELECT * FROM reports ${where} ORDER BY created_at DESC LIMIT 200`);
    const { results } = await (status === "all" ? stmt : stmt.bind(status === "resolved" ? "resolved" : "open")).all();
    const counts = await env.DB.prepare("SELECT status, COUNT(*) AS n FROM reports GROUP BY status").all();
    const by = Object.fromEntries(counts.results.map((r) => [r.status, r.n]));
    return json({
      open: by.open || 0, resolved: by.resolved || 0,
      reports: results.map((r) => ({ id: String(r.id), email: r.email, category: r.category, message: r.message, page: r.page, userAgent: r.user_agent, createdAt: r.created_at, status: r.status })),
    });
  }
  const repMatch = path.match(/^\/api\/admin\/reports\/(\d+)$/);
  if (repMatch && req.method === "PUT") {
    const { status } = await readJson(req);
    await env.DB.prepare("UPDATE reports SET status = ? WHERE id = ?").bind(status === "resolved" ? "resolved" : "open", Number(repMatch[1])).run();
    log("admin", status === "resolved" ? "☑️ דיווח סומן כטופל" : "↩️ דיווח נפתח מחדש", { "מנהל": admin.email, "דיווח": `#${repMatch[1]}` });
    return json({ ok: true });
  }
  if (repMatch && req.method === "DELETE") {
    await env.DB.prepare("DELETE FROM reports WHERE id = ?").bind(Number(repMatch[1])).run();
    log("admin", "🗑️ דיווח נמחק", { "מנהל": admin.email, "דיווח": `#${repMatch[1]}` });
    return json({ ok: true });
  }

  // Broadcasts: GET history, POST send (test → only to the admin)
  if (path === "/api/admin/broadcasts" && req.method === "GET") {
    const { results } = await env.DB.prepare(`
      SELECT b.*, (SELECT COUNT(*) FROM broadcast_messages bm JOIN messages m ON m.id = bm.message_id
                   WHERE bm.broadcast_id = b.id AND m.is_read = 1) AS read_count
      FROM broadcasts b ORDER BY b.created_at DESC LIMIT 50`).all();
    return json({
      broadcasts: results.map((b) => ({ id: String(b.id), subject: b.subject, body: b.body, createdAt: b.created_at, sentBy: b.sent_by, recipients: b.recipients, read: b.read_count })),
    });
  }
  if (path === "/api/admin/broadcasts" && req.method === "POST") {
    const { subject, body, test } = await readJson(req);
    const subj = String(subject || "").trim().slice(0, 300);
    const text = String(body || "").trim().slice(0, MAX_BODY_CHARS);
    if (!subj || !text) throw new HttpError(400, "Add a subject and a message.", "broadcast_empty");
    const now = Date.now();
    const recipients = test
      ? [{ id: admin.id, username: admin.username }]
      : (await env.DB.prepare("SELECT u.id, u.username FROM users u LEFT JOIN user_meta m ON m.user_id = u.id WHERE COALESCE(m.suspended, 0) = 0").all()).results;

    let broadcastId = null;
    if (!test) {
      const res = await env.DB.prepare("INSERT INTO broadcasts (subject, body, created_at, sent_by, recipients) VALUES (?, ?, ?, ?, ?)")
        .bind(subj, text, now, admin.username, recipients.length).run();
      broadcastId = res.meta.last_row_id;
    }
    const from = `team@${env.MAIL_DOMAIN}`;
    for (let i = 0; i < recipients.length; i += 50) {
      const chunk = recipients.slice(i, i + 50);
      const inserted = await env.DB.batch(chunk.map((u) =>
        env.DB.prepare("INSERT INTO messages (user_id, folder, from_name, from_addr, to_addr, subject, body, date, is_read, starred) VALUES (?, 'inbox', 'Ranilix Team', ?, ?, ?, ?, ?, 0, 0)")
          .bind(u.id, from, `${u.username}@${env.MAIL_DOMAIN}`, test ? `[Test] ${subj}` : subj, text, now)));
      if (broadcastId) {
        await env.DB.batch(inserted.map((r) =>
          env.DB.prepare("INSERT INTO broadcast_messages (broadcast_id, message_id) VALUES (?, ?)").bind(broadcastId, r.meta.last_row_id)));
      }
    }
    log("admin", test ? "🧪 עדכון בדיקה נשלח" : "📢 עדכון נשלח לכל המשתמשים", { "מנהל": admin.email, "נושא": subj, "נמענים": recipients.length });
    if (!test) await discordNotify(env, "updates", { title: `📢 ${subj}`.slice(0, 256), description: text.slice(0, 3500), url: "https://rani898.github.io/ranilix-email/" });
    return json({ ok: true, recipients: recipients.length, test: !!test }, 201);
  }

  // Settings
  if (path === "/api/admin/settings" && req.method === "GET") return json(await getSettings(env));
  if (path === "/api/admin/settings" && req.method === "PUT") {
    const body = await readJson(req);
    if (typeof body.signupsOpen === "boolean") await setSetting(env, "signups_open", body.signupsOpen ? "1" : "0");
    if (typeof body.outboundEnabled === "boolean") await setSetting(env, "outbound_enabled", body.outboundEnabled ? "1" : "0");
    if (body.announcement) {
      const a = body.announcement;
      if (typeof a.enabled === "boolean") await setSetting(env, "announcement_enabled", a.enabled ? "1" : "0");
      if (typeof a.text === "string") await setSetting(env, "announcement_text", a.text.slice(0, 500));
      if (["info", "warning", "success"].includes(a.level)) await setSetting(env, "announcement_level", a.level);
    }
    const changed = [typeof body.signupsOpen === "boolean" && `הרשמה: ${body.signupsOpen ? "פתוחה" : "סגורה"}`,
      typeof body.outboundEnabled === "boolean" && `שליחה חיצונית: ${body.outboundEnabled ? "פעילה" : "כבויה"}`,
      body.announcement && `באנר: ${body.announcement.enabled ? "מוצג" : "מוסתר"}`].filter(Boolean).join(" · ");
    log("admin", "⚙️ הגדרות האתר שונו", { "מנהל": admin.email, "מה השתנה": changed });
    return json(await getSettings(env));
  }

  throw new HttpError(404, "Not found.", "not_found");
}

/* ------------------------------------------------------------------ */
/* Routes                                                              */
/* ------------------------------------------------------------------ */

async function route(req, env, log) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const ip = req.headers.get("CF-Connecting-IP") || "local";
  const country = req.headers.get("CF-IPCountry") || "";

  if (path === "/" && req.method === "GET") return json({ ok: true, service: "ranilix-email-api", domain: env.MAIL_DOMAIN, files: !!env.FILES });

  if (path === "/api/announcement" && req.method === "GET") {
    const { announcement } = await getSettings(env);
    return json(announcement.enabled && announcement.text ? announcement : { enabled: false });
  }

  if (path === "/api/username-available" && req.method === "GET") {
    const u = (url.searchParams.get("u") || "").toLowerCase();
    if (validateUsername(u) || RESERVED.has(u) || isAdmin(env, u)) return json({ available: false });
    const row = await env.DB.prepare("SELECT 1 FROM users WHERE username = ?").bind(u).first();
    return json({ available: !row });
  }

  if (path === "/api/signup" && req.method === "POST") {
    const { username, password, lang, accountTokens } = await readJson(req);
    const u = String(username || "").toLowerCase();
    const uErr = validateUsername(u);
    if (uErr) throw new HttpError(400, uErr);
    // Reserved names, and names listed as admins (so nobody can register an admin name that's free).
    if (RESERVED.has(u) || isAdmin(env, u)) {
      if (isAdmin(env, u)) log("security", "🚫 ניסיון להירשם בשם של מנהל", { "שם": u, "מדינה": country });
      throw new HttpError(409, "Sorry, that name is taken. Try another.", "name_taken");
    }
    const pErr = validatePassword(password);
    if (pErr) throw new HttpError(400, pErr);
    if (!(await getSettings(env)).signupsOpen) throw new HttpError(403, "New sign-ups are paused right now.", "signups_closed");
    try { await rateLimit(env, `signup:${ip}`, 5, 3600 * 1000); }
    catch (e) { log("security", "⏳ יותר מדי הרשמות מאותה כתובת IP", { "מדינה": country }); throw e; }

    // Creating another address from a browser that's already signed in: it joins that person's group.
    const existing = await firstValidUser(env, accountTokens);
    const ownerId = existing ? await ownerOf(env, existing) : null;
    const creator = existing && await env.DB.prepare("SELECT username FROM users WHERE id = ?").bind(existing).first();
    if (ownerId && !(creator && isAdmin(env, creator.username))) { // admins aren't limited
      const { used, max } = await groupInfo(env, ownerId);
      if (used >= max) {
        log("accounts", "🔢 הגיע למגבלת הכתובות", { "מנסה ליצור": `${u}@${env.MAIL_DOMAIN}`, "מגבלה": max });
        throw new HttpError(403, `You can have up to ${max} addresses.`, "account_limit", { max });
      }
    }

    const salt = randomHex(16);
    const hash = await hashPassword(password, salt);
    let userId;
    try {
      const res = await env.DB.prepare("INSERT INTO users (username, password_hash, salt, created_at) VALUES (?, ?, ?, ?)")
        .bind(u, hash, salt, Date.now()).run();
      userId = res.meta.last_row_id;
    } catch {
      throw new HttpError(409, "Sorry, that name is taken. Try another.", "name_taken");
    }
    if (ownerId) await env.DB.prepare("INSERT OR REPLACE INTO account_owners (user_id, owner_id) VALUES (?, ?)").bind(userId, ownerId).run();
    const email = `${u}@${env.MAIL_DOMAIN}`;
    const welcome = (WELCOME[lang] || WELCOME.en)(email);
    await insertMessage(env, userId, { folder: "inbox", fromName: "Ranilix Team", fromAddr: `team@${env.MAIL_DOMAIN}`, to: email, ...welcome });
    await env.DB.prepare("INSERT OR IGNORE INTO user_meta (user_id, last_login_at) VALUES (?, ?)").bind(userId, Date.now()).run();
    const token = await createSession(env, userId, true);
    log("signups", "🆕 משתמש חדש", { "כתובת": email, "מדינה": country, "כתובת נוספת של": creator ? `${creator.username}@${env.MAIL_DOMAIN}` : "" });
    return json({ token, email }, 201);
  }

  if (path === "/api/login" && req.method === "POST") {
    const { email, password, remember } = await readJson(req);
    await rateLimit(env, `login:${ip}`, 20, 15 * 60 * 1000);
    const u = String(email || "").toLowerCase().trim().replace(new RegExp(`@${env.MAIL_DOMAIN.replace(/\./g, "\\.")}$`), "");
    // Per-address limit too, so a password can't be guessed from many different IPs.
    const failKey = `loginfail:${u.slice(0, 40)}`;
    const fails = await env.DB.prepare("SELECT count, window_start FROM rate_limits WHERE key = ?").bind(failKey).first();
    if (fails && Date.now() - fails.window_start < 15 * 60 * 1000 && fails.count >= 10) {
      if (fails.count === 10) log("security", "🔒 כתובת ננעלה ל-15 דקות (10 סיסמאות שגויות)", { "כתובת": `${u}@${env.MAIL_DOMAIN}`, "מדינה": country });
      await rateLimit(env, failKey, 1_000_000, 15 * 60 * 1000);
      throw new HttpError(429, "Too many attempts. Please wait a bit and try again.", "rate_limited");
    }
    const user = await env.DB.prepare("SELECT id, username, password_hash, salt FROM users WHERE username = ?").bind(u).first();
    // Same message whether the user exists or not, so accounts can't be discovered.
    const fail = new HttpError(401, "That email or password isn't right.", "bad_login");
    const ok = user && typeof password === "string" && password.length <= 200 && safeEqual(await hashPassword(password, user.salt), user.password_hash);
    if (!ok) {
      await rateLimit(env, failKey, 1_000_000, 15 * 60 * 1000); // just counts failures
      // Only name real addresses: people sometimes type their password into the address field.
      log("logins", "❌ סיסמה שגויה", { "כתובת": user ? `${user.username}@${env.MAIL_DOMAIN}` : "(כתובת לא קיימת)", "מדינה": country });
      throw fail;
    }
    await env.DB.prepare("DELETE FROM rate_limits WHERE key = ?").bind(failKey).run();
    if (await isSuspended(env, user.id)) throw new HttpError(403, "This account is suspended.", "suspended");
    await env.DB.prepare("INSERT INTO user_meta (user_id, last_login_at) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET last_login_at = excluded.last_login_at")
      .bind(user.id, Date.now()).run();
    const token = await createSession(env, user.id, remember !== false);
    log("logins", "🔑 התחברות", { "כתובת": `${user.username}@${env.MAIL_DOMAIN}`, "מדינה": country, "זכור אותי": remember !== false ? "כן" : "לא" });
    return json({ token, email: `${user.username}@${env.MAIL_DOMAIN}` });
  }

  if (path === "/api/logout" && req.method === "POST") {
    const auth = req.headers.get("Authorization") || "";
    if (auth.startsWith("Bearer ")) {
      const th = await sha256(auth.slice(7));
      const who = await env.DB.prepare("SELECT u.username FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?").bind(th).first();
      await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(th).run();
      if (who) log("logins", "🚪 התנתקות", { "כתובת": `${who.username}@${env.MAIL_DOMAIN}` });
    }
    return json({ ok: true });
  }

  // Profile photos are public (like other mail apps), so the inbox can show them next to messages.
  const avatarMatch = path.match(/^\/api\/avatar\/([a-z0-9._-]{1,40})$/);
  if (avatarMatch && req.method === "GET") {
    const row = await env.DB.prepare("SELECT p.avatar FROM profiles p JOIN users u ON u.id = p.user_id WHERE u.username = ?").bind(avatarMatch[1]).first();
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(row?.avatar || "");
    if (!m) return new Response("Not found", { status: 404, headers: { "Cache-Control": "public, max-age=300" } });
    const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
    return new Response(bytes, { headers: { "Content-Type": m[1], "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff" } });
  }

  // Discord slash commands (Discord signs every request; checked inside).
  if (path === "/api/discord/interactions" && req.method === "POST") {
    return discordInteraction(req, env, { json, validateUsername, RESERVED, insertMessage, notifyUser, rateLimit, log, ctx: log.ctx });
  }

  if (path === "/api/push/key" && req.method === "GET") return json({ publicKey: await vapidPublicKey(env) });

  // Google redirects the browser here after "Connect Google" (no Ranilix token on this request).
  if (path === "/api/google/callback") return googleRoute(req, env, path, url, null, { HttpError, json, htmlToText, randomHex, log });

  // Help window chat: works for visitors too (it checks the login itself).
  if (path.startsWith("/api/support/")) {
    const res = await supportRoute(req, env, path, { HttpError, json, readJson, rateLimit, log, ip, requireUser, sha256, randomHex });
    if (res) return res;
  }

  // ---- Everything below needs a logged-in user ----
  const user = await requireUser(req, env);

  if (path.startsWith("/api/google/")) return googleRoute(req, env, path, url, user, { HttpError, json, htmlToText, randomHex, log });

  if (path === "/api/me" && req.method === "GET") {
    const accounts = await groupInfo(env, await ownerOf(env, user.id));
    return json({ email: user.email, isAdmin: isAdmin(env, user.username), accounts, profile: await getProfile(env, user.id) });
  }

  // Cheap "anything new?" check the inbox calls every few seconds (reads a single row).
  if (path === "/api/check" && req.method === "GET") {
    const row = await env.DB.prepare("SELECT id FROM messages WHERE user_id = ? ORDER BY id DESC LIMIT 1").bind(user.id).first();
    return json({ latest: row ? String(row.id) : null });
  }

  /* ---- Account settings ---- */
  if (path === "/api/profile" && req.method === "GET") return json(await getProfile(env, user.id));
  if (path === "/api/profile" && req.method === "PUT") {
    const { displayName, signature } = await readJson(req);
    const fields = {};
    if (displayName !== undefined) {
      fields.display_name = cleanName(displayName);
      if (STAFF_NAME_RE.test(fields.display_name) && !isAdmin(env, user.username)) {
        log("security", "🎭 ניסיון להשתמש בשם של הצוות", { "כתובת": user.email, "שם": fields.display_name });
        throw new HttpError(400, "That name is reserved for the Ranilix team.", "name_reserved");
      }
    }
    if (signature !== undefined) fields.signature = String(signature || "").slice(0, 1000);
    await upsertProfile(env, user.id, fields);
    log("accounts", "✏️ עדכון פרופיל", { "כתובת": user.email, "שם": fields.display_name, "חתימה": fields.signature !== undefined ? "עודכנה" : "" });
    return json(await getProfile(env, user.id));
  }
  if (path === "/api/profile/avatar" && req.method === "PUT") {
    const { dataUrl } = await readJson(req);
    if (typeof dataUrl !== "string" || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) throw new HttpError(400, "Choose a JPG, PNG or WebP picture.", "avatar_type");
    if (dataUrl.length > MAX_AVATAR_CHARS) throw new HttpError(400, "That picture is too big.", "avatar_big");
    await upsertProfile(env, user.id, { avatar: dataUrl });
    log("accounts", "🖼️ תמונת פרופיל חדשה", { "כתובת": user.email });
    return json(await getProfile(env, user.id));
  }
  if (path === "/api/profile/avatar" && req.method === "DELETE") {
    await upsertProfile(env, user.id, { avatar: null });
    log("accounts", "🖼️ תמונת פרופיל הוסרה", { "כתובת": user.email });
    return json(await getProfile(env, user.id));
  }
  if (path === "/api/account/password" && req.method === "POST") {
    const { current, next } = await readJson(req);
    await rateLimit(env, `pw:${user.id}`, 10, 3600 * 1000);
    const row = await env.DB.prepare("SELECT password_hash, salt FROM users WHERE id = ?").bind(user.id).first();
    if (typeof current !== "string" || !safeEqual(await hashPassword(current, row.salt), row.password_hash)) {
      log("security", "🔑 סיסמה נוכחית שגויה בהחלפת סיסמה", { "כתובת": user.email });
      throw new HttpError(400, "Your current password isn't right.", "wrong_password");
    }
    const pErr = validatePassword(next);
    if (pErr) throw new HttpError(400, pErr, "weak_password");
    const salt = randomHex(16);
    await env.DB.prepare("UPDATE users SET password_hash = ?, salt = ? WHERE id = ?").bind(await hashPassword(next, salt), salt, user.id).run();
    // Sign out every other device; keep this one.
    const mine = await sha256((req.headers.get("Authorization") || "").slice(7));
    await env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?").bind(user.id, mine).run();
    log("accounts", "🔐 סיסמה הוחלפה", { "כתובת": user.email, "מדינה": country });
    return json({ ok: true });
  }
  if (path === "/api/account/delete" && req.method === "POST") {
    const { password } = await readJson(req);
    await rateLimit(env, `del:${user.id}`, 10, 3600 * 1000);
    if (isAdmin(env, user.username)) throw new HttpError(400, "Admins can't delete their account here.", "admin_protected");
    const row = await env.DB.prepare("SELECT password_hash, salt FROM users WHERE id = ?").bind(user.id).first();
    if (typeof password !== "string" || !safeEqual(await hashPassword(password, row.salt), row.password_hash)) {
      throw new HttpError(400, "Your password isn't right.", "wrong_password");
    }
    await deleteUserCompletely(env, user.id);
    log("accounts", "🗑️ משתמש מחק את החשבון שלו", { "כתובת": user.email });
    return json({ ok: true });
  }

  /* ---- Report a problem ---- */
  if (path === "/api/reports" && req.method === "POST") {
    const { category, message, page } = await readJson(req);
    const text = String(message || "").trim();
    if (text.length < 5) throw new HttpError(400, "Tell us a bit more (at least a few words).", "report_short");
    await rateLimit(env, `report:${user.id}`, 5, 3600 * 1000);
    await env.DB.prepare("INSERT INTO reports (user_id, email, category, message, page, user_agent, created_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'open')")
      .bind(user.id, user.email, REPORT_CATEGORIES.has(category) ? category : "other", text.slice(0, 3000), String(page || "").slice(0, 200),
        (req.headers.get("User-Agent") || "").slice(0, 300), Date.now()).run();
    log("reports", "🚩 דיווח חדש מהאתר", { "מאת": user.email, "סוג": REPORT_CATEGORIES.has(category) ? category : "other", "עמוד": String(page || "") }, text.slice(0, 1500));
    return json({ ok: true }, 201);
  }

  /* ---- Push notifications ---- */
  if (path === "/api/push/subscribe" && req.method === "POST") {
    const { endpoint } = await readJson(req);
    if (!validPushEndpoint(endpoint)) throw new HttpError(400, "Invalid request.");
    const pr = await env.DB.prepare("INSERT OR IGNORE INTO push_subs (endpoint, user_id, created_at) VALUES (?, ?, ?)").bind(endpoint, user.id, Date.now()).run();
    if (pr.meta.changes) log("accounts", "🔔 הפעיל התראות במכשיר", { "כתובת": user.email, "שירות": new URL(endpoint).hostname });
    return json({ ok: true });
  }
  if (path === "/api/push/unsubscribe" && req.method === "POST") {
    const { endpoint } = await readJson(req);
    await env.DB.prepare("DELETE FROM push_subs WHERE endpoint = ? AND user_id = ?").bind(String(endpoint || ""), user.id).run();
    return json({ ok: true });
  }

  if (path.startsWith("/api/admin/")) {
    if (!isAdmin(env, user.username)) {
      log("security", "🕵️ משתמש רגיל ניסה לגשת לפאנל הניהול", { "כתובת": user.email, "נתיב": path, "מדינה": country });
      throw new HttpError(404, "Not found.", "not_found"); // don't reveal the panel exists
    }
    return adminRoute(req, env, user, path, url, log);
  }

  if (path === "/api/messages" && req.method === "GET") {
    const { results } = await env.DB.prepare("SELECT * FROM messages WHERE user_id = ? ORDER BY date DESC LIMIT 500").bind(user.id).all();
    const { results: atts } = await env.DB.prepare("SELECT id, message_id, filename, mime, size FROM attachments WHERE user_id = ?").bind(user.id).all();
    const byMessage = new Map();
    for (const a of atts) {
      if (!byMessage.has(a.message_id)) byMessage.set(a.message_id, []);
      byMessage.get(a.message_id).push(a);
    }
    return json({ messages: results.map((m) => toClientMessage(m, byMessage.get(m.id))) });
  }

  const msgMatch = path.match(/^\/api\/messages\/(\d+)$/);
  if (msgMatch && req.method === "PATCH") {
    const id = Number(msgMatch[1]);
    const body = await readJson(req);
    const sets = [];
    const vals = [];
    if (typeof body.read === "boolean") { sets.push("is_read = ?"); vals.push(body.read ? 1 : 0); }
    if (typeof body.starred === "boolean") { sets.push("starred = ?"); vals.push(body.starred ? 1 : 0); }
    if (["inbox", "sent", "trash"].includes(body.folder)) { sets.push("folder = ?"); vals.push(body.folder); }
    if (!sets.length) throw new HttpError(400, "Nothing to update.");
    const res = await env.DB.prepare(`UPDATE messages SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`).bind(...vals, id, user.id).run();
    if (!res.meta.changes) throw new HttpError(404, "Message not found.", "not_found");
    return json({ ok: true });
  }
  if (msgMatch && req.method === "DELETE") {
    const id = Number(msgMatch[1]);
    const { results: atts } = await env.DB.prepare("SELECT kv_key FROM attachments WHERE message_id = ? AND user_id = ?").bind(id, user.id).all();
    await env.DB.prepare("DELETE FROM attachments WHERE message_id = ? AND user_id = ?").bind(id, user.id).run();
    const res = await env.DB.prepare("DELETE FROM messages WHERE id = ? AND user_id = ?").bind(id, user.id).run();
    if (!res.meta.changes) throw new HttpError(404, "Message not found.", "not_found");
    await cleanupFiles(env, atts.map((a) => a.kv_key));
    return json({ ok: true });
  }

  const attMatch = path.match(/^\/api\/attachments\/(\d+)$/);
  if (attMatch && req.method === "GET") {
    const att = await env.DB.prepare("SELECT filename, mime, kv_key FROM attachments WHERE id = ? AND user_id = ?").bind(Number(attMatch[1]), user.id).first();
    if (!att || !env.FILES) throw new HttpError(404, "Not found.", "not_found");
    const data = await env.FILES.get(att.kv_key, "arrayBuffer");
    if (!data) throw new HttpError(404, "Not found.", "not_found");
    // Always download, never render: an attached HTML file must not run as a page.
    return new Response(data, {
      headers: {
        "Content-Type": att.mime.startsWith("image/") && !att.mime.includes("svg") ? att.mime : "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(att.filename)}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=3600",
      },
    });
  }

  if (path === "/api/send" && req.method === "POST") {
    const { to, subject, body, forward, files } = await readSendRequest(req);
    const savedName = (await getProfile(env, user.id)).displayName;
    // Never let a regular user's mail look like it came from the staff (even if the name was saved before this rule).
    const senderName = savedName && (isAdmin(env, user.username) || !STAFF_NAME_RE.test(savedName)) ? savedName : user.username;
    const recipients = [...new Set(String(to || "").toLowerCase().split(/[,;\s]+/).filter(Boolean))];
    if (!recipients.length) throw new HttpError(400, "Add at least one recipient.");
    if (recipients.length > 10) throw new HttpError(400, "You can send to up to 10 people at once.", "too_many_recipients");
    const bad = recipients.find((r) => !isEmail(r));
    if (bad) throw new HttpError(400, `"${bad}" doesn't look like an email address.`);
    const external = recipients.filter((r) => !r.endsWith(`@${env.MAIL_DOMAIN}`));
    const internal = recipients.filter((r) => r.endsWith(`@${env.MAIL_DOMAIN}`));
    if (external.length) {
      const settings = await getSettings(env);
      if (!env.RESEND_API_KEY || !settings.outboundEnabled) {
        throw new HttpError(400, "Sending to other providers isn't turned on.", "external_send", { domain: env.MAIL_DOMAIN });
      }
    }

    // Files: limits first, before anything is stored.
    if (files.length + forward.length > MAX_FILES) throw new HttpError(400, "Too many files.", "too_many_files", { max: MAX_FILES });
    const tooBig = files.find((f) => f.size > MAX_FILE_BYTES);
    if (tooBig) throw new HttpError(400, "File too big.", "file_too_big", { name: tooBig.name, max: mb(MAX_FILE_BYTES) });
    if (files.reduce((s, f) => s + f.size, 0) > MAX_TOTAL_BYTES) throw new HttpError(400, "Files too big.", "total_too_big", { max: mb(MAX_TOTAL_BYTES) });

    const ids = [];
    for (const r of internal) {
      const row = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(r.split("@")[0]).first();
      if (!row) throw new HttpError(400, `${r} doesn't exist.`, "no_recipient", { email: r });
      ids.push(row.id);
    }
    await rateLimit(env, `send:${user.id}`, 100, DAY);
    if (external.length) {
      try {
        await rateLimit(env, `out:${user.id}`, OUTBOUND_PER_USER_DAY, DAY);
        await rateLimit(env, "out:global", OUTBOUND_GLOBAL_DAY, DAY);
      } catch {
        log("security", "📮 הגיע למגבלת השליחה החיצונית היומית", { "כתובת": user.email });
        throw new HttpError(429, "Daily limit for sending to other providers reached.", "outbound_limit");
      }
    }

    // Forwarded attachments must belong to the sender; they reuse the stored file.
    const stored = [];
    for (const fid of forward) {
      const a = await env.DB.prepare("SELECT filename, mime, size, kv_key FROM attachments WHERE id = ? AND user_id = ?").bind(Number(fid), user.id).first();
      if (a) stored.push(a);
    }
    for (const f of files) {
      const mime = f.type || "application/octet-stream";
      stored.push({ filename: cleanFilename(f.name), mime, size: f.size, kv_key: await storeFile(env, await f.arrayBuffer(), mime) });
    }

    // Deliver to other providers first: if that fails, nothing is saved and the user can retry.
    if (external.length) {
      const attachments = [];
      for (const a of stored) {
        const data = env.FILES ? await env.FILES.get(a.kv_key, "arrayBuffer") : null;
        if (data) attachments.push({ filename: a.filename, content: Buffer.from(data).toString("base64") });
      }
      let res;
      try {
        res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: `"${senderName.replace(/["\\]/g, "")}" <${user.email}>`,
          to: external,
          subject: String(subject || "").trim() || "(no subject)",
          text: String(body || ""),
          ...(attachments.length ? { attachments } : {}),
        }),
        });
      } catch (err) {
        console.error("Resend unreachable", err);
        throw new HttpError(502, "The message couldn't be sent to other providers.", "outbound_failed");
      }
      if (!res.ok) {
        console.error("Resend error", res.status, await res.text());
        throw new HttpError(502, "The message couldn't be sent to other providers.", "outbound_failed");
      }
    }

    const now = Date.now();
    const msg = { fromName: senderName, fromAddr: user.email, to: recipients.join(", "), subject: String(subject || "").trim() || "(no subject)", body: String(body || ""), date: now };
    const sentId = await insertMessage(env, user.id, { ...msg, folder: "sent", read: true });
    await linkAttachments(env, user.id, sentId, stored);
    for (const id of ids) {
      const inboxId = await insertMessage(env, id, { ...msg, folder: "inbox", read: false });
      await linkAttachments(env, id, inboxId, stored);
      await notifyUser(env, id);
    }
    log("mail", "📤 מייל נשלח", { "מאת": user.email, "נמענים ב-Ranilix": internal.length, "נמענים חיצוניים": external.length, "קבצים": stored.length });
    return json({ ok: true }, 201);
  }

  throw new HttpError(404, "Not found.", "not_found");
}

/* ------------------------------------------------------------------ */
/* Worker entry points                                                 */
/* ------------------------------------------------------------------ */

// Sent with every API response: no sniffing, no framing, no caching of private mail.
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
};

export default {
  async fetch(req, env, ctx) {
    const cors = corsHeaders(req, env);
    const log = createLogger(env, ctx);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    try {
      const res = await route(req, env, log);
      for (const [k, v] of Object.entries({ ...SECURITY_HEADERS, ...cors })) {
        if (k === "Cache-Control" && res.headers.has("Cache-Control")) continue;
        res.headers.set(k, v);
      }
      return res;
    } catch (err) {
      const isHttp = err instanceof HttpError;
      if (!isHttp) {
        console.error(err);
        log("errors", "⚠️ שגיאת שרת", { "נתיב": `${req.method} ${new URL(req.url).pathname}` }, String(err?.stack || err).slice(0, 1500));
      }
      return json(
        isHttp
          ? { error: err.message, code: err.code, params: err.params }
          : { error: "Something went wrong on our side. Please try again.", code: "generic" },
        isHttp ? err.status : 500,
        { ...SECURITY_HEADERS, ...cors },
      );
    }
  },

  // Called by Cloudflare Email Routing (catch-all → this Worker)
  async email(message, env, ctx) {
    const log = createLogger(env, ctx);
    const to = String(message.to || "").toLowerCase();
    const [local, domain] = to.split("@");
    if (domain !== env.MAIL_DOMAIN) return message.setReject("Unknown domain");

    const user = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(local).first();
    if (!user || (await isSuspended(env, user.id))) return message.setReject("Address not found");
    if (message.rawSize > MAX_INBOUND_BYTES) return message.setReject("Message too large");

    // Flood protection: per recipient and per sender (stops someone filling a mailbox or the storage).
    try {
      await rateLimit(env, `in:${user.id}`, 300, DAY);
      await rateLimit(env, `insender:${String(message.from || "").toLowerCase().slice(0, 120)}`, 60, 3600 * 1000);
    } catch {
      log("security", "🌊 הצפת מיילים נחסמה", { "אל": to, "שולח (דומיין)": String(message.from || "").split("@")[1] || "?" });
      return message.setReject("Too many messages, try again later");
    }

    const raw = await new Response(message.raw).arrayBuffer();
    const parsed = await PostalMime.parse(raw);
    const body = parsed.text?.trim() || (parsed.html ? htmlToText(parsed.html) : "");

    // Keep real attachments (skip inline images that are only part of an HTML layout).
    const files = (parsed.attachments || []).filter((a) => a.disposition !== "inline" || !a.contentId);
    const kept = [];
    let skipped = 0;
    for (const a of files) {
      const size = a.content?.byteLength ?? 0;
      if (!env.FILES || kept.length >= MAX_FILES || size === 0 || size > MAX_FILE_BYTES) { skipped++; continue; }
      const mime = a.mimeType || "application/octet-stream";
      kept.push({ filename: cleanFilename(a.filename || "attachment"), mime, size, kv_key: await storeFile(env, a.content, mime) });
    }
    const note = skipped ? `\n\n[${skipped} attachment(s) were too large or couldn't be saved]` : "";

    // Anti-spoofing: mail from outside can't claim to be from our own domain (e.g. "team@ranilix.com"),
    // and a "Ranilix" display name from another domain gets a warning sign.
    let fromAddr = String(parsed.from?.address || message.from || "").slice(0, 200);
    let fromName = String(parsed.from?.name || "").replace(/[\r\n]/g, " ").slice(0, 120);
    if (fromAddr.toLowerCase().endsWith(`@${env.MAIL_DOMAIN}`)) {
      log("security", "🎣 מייל מזויף בשם Ranilix סומן", { "אל": to, "התחזה ל": fromAddr, "שולח אמיתי (דומיין)": String(message.from || "").split("@")[1] || "?" });
      fromName = `⚠️ ${fromName || fromAddr} (unverified)`;
      fromAddr = String(message.from || "unknown").slice(0, 200);
    } else if (STAFF_NAME_RE.test(fromName) && /ranilix/i.test(fromName)) {
      fromName = `⚠️ ${fromName}`;
    }
    const messageId = await insertMessage(env, user.id, {
      folder: "inbox",
      fromName,
      fromAddr,
      to,
      subject: parsed.subject || "(no subject)",
      body: body + note,
      date: parsed.date ? Date.parse(parsed.date) || Date.now() : Date.now(),
    });
    await linkAttachments(env, user.id, messageId, kept);
    await notifyUser(env, user.id);
    log("mail", "📥 מייל התקבל", { "אל": to, "שולח (דומיין)": (fromAddr.split("@")[1] || "?").slice(0, 80), "קבצים": kept.length });
  },

  // Daily cleanup of expired sessions and old rate-limit rows
  async scheduled(_event, env) {
    const now = Date.now();
    await env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now).run();
    await env.DB.prepare("DELETE FROM rate_limits WHERE window_start < ?").bind(now - DAY).run();
    await env.DB.prepare("DELETE FROM oauth_states WHERE created_at < ?").bind(now - DAY).run();
  },
};
