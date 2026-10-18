// Ranilix Email API — Cloudflare Worker
//  • fetch(): JSON API used by the website (signup, login, inbox, send)
//  • email(): receives incoming mail from Cloudflare Email Routing and stores it

import PostalMime from "postal-mime";

/* ------------------------------------------------------------------ */
/* Config & helpers                                                    */
/* ------------------------------------------------------------------ */

const RESERVED = new Set([
  "admin", "administrator", "support", "help", "info", "root", "postmaster", "hostmaster",
  "abuse", "noreply", "no-reply", "security", "ranilix", "team", "tips", "webmaster", "mail",
]);
const USERNAME_MIN = 3;
const USERNAME_MAX = 30;
const PASSWORD_MIN = 8;
const PBKDF2_ITERATIONS = 100_000; // Workers' maximum for PBKDF2
const MAX_BODY_CHARS = 100_000;
const MAX_INBOUND_BYTES = 10 * 1024 * 1024;
const DAY = 24 * 3600 * 1000;

const enc = new TextEncoder();
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const randomHex = (bytes) => toHex(crypto.getRandomValues(new Uint8Array(bytes)));
const sha256 = async (s) => toHex(await crypto.subtle.digest("SHA-256", enc.encode(s)));

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
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* ------------------------------------------------------------------ */
/* HTTP plumbing                                                       */
/* ------------------------------------------------------------------ */

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function corsHeaders(req, env) {
  const origin = req.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const h = {
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
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
  if (row.count >= limit) throw new HttpError(429, "Too many attempts. Please wait a bit and try again.");
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
  if (!token) throw new HttpError(401, "Please log in.");
  const row = await env.DB.prepare(
    "SELECT u.id, u.username, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?"
  ).bind(await sha256(token)).first();
  if (!row || row.expires_at < Date.now()) throw new HttpError(401, "Your session has ended. Please log in again.");
  return { id: row.id, username: row.username, email: `${row.username}@${env.MAIL_DOMAIN}` };
}

const toClientMessage = (m) => ({
  id: String(m.id),
  folder: m.folder,
  from: { name: m.from_name || m.from_addr, email: m.from_addr },
  to: m.to_addr,
  subject: m.subject,
  body: m.body,
  date: m.date,
  read: !!m.is_read,
  starred: !!m.starred,
});

async function insertMessage(env, userId, m) {
  await env.DB.prepare(
    "INSERT INTO messages (user_id, folder, from_name, from_addr, to_addr, subject, body, date, is_read, starred) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)"
  ).bind(userId, m.folder, m.fromName || "", m.fromAddr || "", m.to || "", (m.subject || "(no subject)").slice(0, 500),
    (m.body || "").slice(0, MAX_BODY_CHARS), m.date || Date.now(), m.read ? 1 : 0).run();
}

function welcomeMessage(env, email) {
  return {
    folder: "inbox",
    fromName: "Ranilix Team",
    fromAddr: `team@${env.MAIL_DOMAIN}`,
    to: email,
    subject: "Welcome to your new inbox 🎉",
    body: `Hi there,\n\nYour free address ${email} is ready.\n\nGive it to friends and services you use: emails sent to it will show up right here.\n\nRanilix Email is free forever. No credit card, no hidden fees.\n\nEnjoy,\nThe Ranilix Team`,
  };
}

/* ------------------------------------------------------------------ */
/* Routes                                                              */
/* ------------------------------------------------------------------ */

async function route(req, env) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const ip = req.headers.get("CF-Connecting-IP") || "local";

  if (path === "/" && req.method === "GET") return json({ ok: true, service: "ranilix-email-api", domain: env.MAIL_DOMAIN });

  if (path === "/api/username-available" && req.method === "GET") {
    const u = (url.searchParams.get("u") || "").toLowerCase();
    if (validateUsername(u)) return json({ available: false });
    if (RESERVED.has(u)) return json({ available: false });
    const row = await env.DB.prepare("SELECT 1 FROM users WHERE username = ?").bind(u).first();
    return json({ available: !row });
  }

  if (path === "/api/signup" && req.method === "POST") {
    const { username, password } = await readJson(req);
    const u = String(username || "").toLowerCase();
    const uErr = validateUsername(u);
    if (uErr) throw new HttpError(400, uErr);
    if (RESERVED.has(u)) throw new HttpError(409, "Sorry, that name is taken. Try another.");
    const pErr = validatePassword(password);
    if (pErr) throw new HttpError(400, pErr);
    await rateLimit(env, `signup:${ip}`, 5, 3600 * 1000);

    const salt = randomHex(16);
    const hash = await hashPassword(password, salt);
    let userId;
    try {
      const res = await env.DB.prepare("INSERT INTO users (username, password_hash, salt, created_at) VALUES (?, ?, ?, ?)")
        .bind(u, hash, salt, Date.now()).run();
      userId = res.meta.last_row_id;
    } catch {
      throw new HttpError(409, "Sorry, that name is taken. Try another.");
    }
    const email = `${u}@${env.MAIL_DOMAIN}`;
    await insertMessage(env, userId, welcomeMessage(env, email));
    const token = await createSession(env, userId, true);
    return json({ token, email }, 201);
  }

  if (path === "/api/login" && req.method === "POST") {
    const { email, password, remember } = await readJson(req);
    await rateLimit(env, `login:${ip}`, 20, 15 * 60 * 1000);
    const u = String(email || "").toLowerCase().trim().replace(new RegExp(`@${env.MAIL_DOMAIN.replace(/\./g, "\\.")}$`), "");
    const user = await env.DB.prepare("SELECT id, username, password_hash, salt FROM users WHERE username = ?").bind(u).first();
    // Same message whether the user exists or not, so accounts can't be discovered.
    const fail = new HttpError(401, "That email or password isn't right.");
    if (!user || typeof password !== "string") throw fail;
    const hash = await hashPassword(password, user.salt);
    if (!safeEqual(hash, user.password_hash)) throw fail;
    const token = await createSession(env, user.id, remember !== false);
    return json({ token, email: `${user.username}@${env.MAIL_DOMAIN}` });
  }

  if (path === "/api/logout" && req.method === "POST") {
    const auth = req.headers.get("Authorization") || "";
    if (auth.startsWith("Bearer ")) {
      await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(auth.slice(7))).run();
    }
    return json({ ok: true });
  }

  // ---- Everything below needs a logged-in user ----
  const user = await requireUser(req, env);

  if (path === "/api/me" && req.method === "GET") return json({ email: user.email });

  if (path === "/api/messages" && req.method === "GET") {
    const { results } = await env.DB.prepare("SELECT * FROM messages WHERE user_id = ? ORDER BY date DESC LIMIT 500")
      .bind(user.id).all();
    return json({ messages: results.map(toClientMessage) });
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
    const res = await env.DB.prepare(`UPDATE messages SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`)
      .bind(...vals, id, user.id).run();
    if (!res.meta.changes) throw new HttpError(404, "Message not found.");
    return json({ ok: true });
  }
  if (msgMatch && req.method === "DELETE") {
    const res = await env.DB.prepare("DELETE FROM messages WHERE id = ? AND user_id = ?").bind(Number(msgMatch[1]), user.id).run();
    if (!res.meta.changes) throw new HttpError(404, "Message not found.");
    return json({ ok: true });
  }

  if (path === "/api/send" && req.method === "POST") {
    const { to, subject, body } = await readJson(req);
    const recipients = String(to || "").toLowerCase().split(/[,\s]+/).filter(Boolean);
    if (!recipients.length) throw new HttpError(400, "Add at least one recipient.");
    if (recipients.length > 10) throw new HttpError(400, "You can send to up to 10 people at once.");
    const bad = recipients.find((r) => !isEmail(r));
    if (bad) throw new HttpError(400, `"${bad}" doesn't look like an email address.`);
    const external = recipients.filter((r) => !r.endsWith(`@${env.MAIL_DOMAIN}`));
    if (external.length) {
      throw new HttpError(400, `Right now you can only send to other @${env.MAIL_DOMAIN} addresses. Sending to other providers is coming soon.`);
    }
    await rateLimit(env, `send:${user.id}`, 100, DAY);

    const usernames = recipients.map((r) => r.split("@")[0]);
    const found = [];
    for (const name of usernames) {
      const row = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(name).first();
      if (!row) throw new HttpError(400, `${name}@${env.MAIL_DOMAIN} doesn't exist.`);
      found.push(row.id);
    }
    const now = Date.now();
    const msg = { fromName: user.username, fromAddr: user.email, to: recipients.join(", "), subject: String(subject || "").trim() || "(no subject)", body: String(body || ""), date: now };
    await insertMessage(env, user.id, { ...msg, folder: "sent", read: true });
    for (const id of found) await insertMessage(env, id, { ...msg, folder: "inbox", read: false });
    return json({ ok: true }, 201);
  }

  throw new HttpError(404, "Not found.");
}

/* ------------------------------------------------------------------ */
/* Worker entry points                                                 */
/* ------------------------------------------------------------------ */

export default {
  async fetch(req, env) {
    const cors = corsHeaders(req, env);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    try {
      const res = await route(req, env);
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
      return res;
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) console.error(err);
      return json({ error: status === 500 ? "Something went wrong on our side. Please try again." : err.message }, status, cors);
    }
  },

  // Called by Cloudflare Email Routing (catch-all → this Worker)
  async email(message, env) {
    const to = String(message.to || "").toLowerCase();
    const [local, domain] = to.split("@");
    if (domain !== env.MAIL_DOMAIN) return message.setReject("Unknown domain");

    const user = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(local).first();
    if (!user) return message.setReject("Address not found");
    if (message.rawSize > MAX_INBOUND_BYTES) return message.setReject("Message too large");

    const raw = await new Response(message.raw).arrayBuffer();
    const parsed = await PostalMime.parse(raw);
    const body = parsed.text?.trim() || (parsed.html ? htmlToText(parsed.html) : "");
    const attachNote = parsed.attachments?.length ? `\n\n[${parsed.attachments.length} attachment(s) not shown — attachments aren't supported yet]` : "";

    await insertMessage(env, user.id, {
      folder: "inbox",
      fromName: parsed.from?.name || "",
      fromAddr: parsed.from?.address || message.from,
      to,
      subject: parsed.subject || "(no subject)",
      body: body + attachNote,
      date: parsed.date ? Date.parse(parsed.date) || Date.now() : Date.now(),
    });
  },

  // Daily cleanup of expired sessions and old rate-limit rows
  async scheduled(_event, env) {
    const now = Date.now();
    await env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now).run();
    await env.DB.prepare("DELETE FROM rate_limits WHERE window_start < ?").bind(now - DAY).run();
  },
};
