// Site addresses: one permanent address per website you sign up to (made from the browser extension),
// e.g. "netflix--k3x9qa@ranilix.com". Mail to it lands in your normal inbox. Usernames can't contain
// two symbols in a row, so this shape never clashes with a real account.
import { tempAllowed } from "./extras.js";

const DAY = 24 * 3600 * 1000;
export const SITE_RE = /^[a-z0-9]{1,24}--[a-z0-9]{6}$/;
const SITE_MAX = 300;
// How long an address lives (hours); 0 = forever.
const LIFE_HOURS = [0, 1, 24, 24 * 7, 24 * 30, 24 * 365];
const lifeOf = (v) => (LIFE_HOURS.includes(Number(v)) ? Number(v) : 0);
const SELECT = "SELECT a.*, e.expires_at FROM site_addresses a LEFT JOIN site_expiry e ON e.local = a.local";

function slug(site) {
  return String(site || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "").slice(0, 24) || "site";
}
function randomTail() {
  const abc = "abcdefghijkmnpqrstuvwxyz23456789";
  return [...crypto.getRandomValues(new Uint8Array(6))].map((b) => abc[b % abc.length]).join("");
}
const clientSite = (r, domain) => ({
  address: `${r.local}@${domain}`, local: r.local, site: r.site, host: r.host || "", createdAt: r.created_at,
  received: r.received, lastAt: r.last_at || null, off: !!r.off, expiresAt: r.expires_at || null,
});
async function setLife(env, local, hours) {
  if (!hours) { await env.DB.prepare("DELETE FROM site_expiry WHERE local = ?").bind(local).run(); return null; }
  const at = Date.now() + hours * 3600 * 1000;
  await env.DB.prepare("INSERT INTO site_expiry (local, expires_at) VALUES (?, ?) ON CONFLICT(local) DO UPDATE SET expires_at = excluded.expires_at").bind(local, at).run();
  return at;
}

/** Pull a sign-up code and a confirm link out of a plain-text message. */
export function findCode(subject, body) {
  const text = `${subject || ""}\n${String(body || "").slice(0, 6000)}`;
  let code = "";
  for (const m of text.matchAll(/(?:code|קוד|pin|otp|verification|אימות|אישור)[^\n\d]{0,40}?\b([A-Z0-9]{4,8})\b/gi)) {
    if (/\d/.test(m[1])) { code = m[1]; break; }
  }
  if (!code) code = /(?<![\d/.:#])(\d{5,8})(?!\d|[.,:/-]\d)/.exec(text)?.[1] || "";
  const link = /https?:\/\/[^\s<>"')]+(?:verif|confirm|activat|validate|magic|login|signin|auth)[^\s<>"')]*/i.exec(String(body || ""))?.[0] || "";
  return { code, link: link.slice(0, 600) };
}

export async function sitesRoute(req, env, path, user, h) {
  const { HttpError, json, readJson, log, admin } = h;
  if (!path.startsWith("/api/sites")) return null;

  if (path === "/api/sites" && req.method === "GET") {
    const { results } = await env.DB.prepare(`${SELECT} WHERE a.user_id = ? ORDER BY a.created_at DESC`).bind(user.id).all();
    return json({ allowed: await tempAllowed(env, user, admin), addresses: results.map((r) => clientSite(r, env.MAIL_DOMAIN)) });
  }

  if (path === "/api/sites" && req.method === "POST") {
    if (!(await tempAllowed(env, user, admin))) throw new HttpError(403, "Extra addresses aren't turned on for your account.", "temp_not_allowed");
    const body = await readJson(req);
    const site = slug(body.site);
    const host = String(body.host || "").toLowerCase().replace(/[^a-z0-9.-]/g, "").slice(0, 120);
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM site_addresses WHERE user_id = ?").bind(user.id).first();
    if (n.n >= SITE_MAX) throw new HttpError(400, "You have the most site addresses. Delete one first.", "site_limit", { max: SITE_MAX });
    await h.rateLimit(env, `site:${user.id}`, 40, DAY);
    let local = `${site}--${randomTail()}`;
    for (let i = 0; i < 5 && (await env.DB.prepare("SELECT 1 FROM site_addresses WHERE local = ?").bind(local).first()); i++) local = `${site}--${randomTail()}`;
    const row = { local, user_id: user.id, site, host, created_at: Date.now(), received: 0, last_at: null, off: 0 };
    await env.DB.prepare("INSERT INTO site_addresses (local, user_id, site, host, created_at, received, off) VALUES (?, ?, ?, ?, ?, 0, 0)")
      .bind(local, user.id, site, host, row.created_at).run();
    row.expires_at = await setLife(env, local, lifeOf(body.hours));
    log("accounts", "🧩 כתובת לאתר נוצרה (תוסף)", { "משתמש": user.email, "אתר": host || site });
    return json(clientSite(row, env.MAIL_DOMAIN), 201);
  }

  const m = path.match(/^\/api\/sites\/([a-z0-9]{1,24}--[a-z0-9]{6})(\/latest)?$/);
  if (!m) return null;
  const row = await env.DB.prepare(`${SELECT} WHERE a.local = ? AND a.user_id = ?`).bind(m[1], user.id).first();
  if (!row) throw new HttpError(404, "This address wasn't found.", "site_not_found");
  const address = `${row.local}@${env.MAIL_DOMAIN}`;

  if (m[2] && req.method === "GET") {
    const { results } = await env.DB.prepare(
      "SELECT id, from_name, from_addr, subject, body, date FROM messages WHERE user_id = ? AND to_addr = ? AND folder != 'trash' ORDER BY id DESC LIMIT 5"
    ).bind(user.id, address).all();
    return json({
      messages: results.map((r) => ({ id: String(r.id), from: r.from_name || r.from_addr, subject: r.subject, date: r.date, ...findCode(r.subject, r.body) })),
    });
  }
  if (!m[2] && req.method === "PATCH") {
    const body = await readJson(req);
    const next = { ...row };
    if ("off" in body) {
      next.off = body.off ? 1 : 0;
      await env.DB.prepare("UPDATE site_addresses SET off = ? WHERE local = ?").bind(next.off, row.local).run();
    }
    if ("hours" in body) next.expires_at = await setLife(env, row.local, lifeOf(body.hours));
    return json(clientSite(next, env.MAIL_DOMAIN));
  }
  if (!m[2] && req.method === "DELETE") {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM site_addresses WHERE local = ?").bind(row.local),
      env.DB.prepare("DELETE FROM site_expiry WHERE local = ?").bind(row.local),
    ]);
    return json({ ok: true });
  }
  throw new HttpError(405, "Not allowed.");
}

/** Inbound mail to a site address: who gets it (null if unknown, turned off or expired). */
export async function siteOwner(env, local) {
  if (!SITE_RE.test(local)) return null;
  const row = await env.DB.prepare(`${SELECT} WHERE a.local = ?`).bind(local).first();
  if (!row || row.off || (row.expires_at && row.expires_at < Date.now())) return null;
  await env.DB.prepare("UPDATE site_addresses SET received = received + 1, last_at = ? WHERE local = ?").bind(Date.now(), local).run();
  return row.user_id;
}

/** Daily: forget addresses that expired more than 30 days ago. */
export async function sitesCleanup(env) {
  const old = Date.now() - 30 * DAY;
  await env.DB.batch([
    env.DB.prepare("DELETE FROM site_addresses WHERE local IN (SELECT local FROM site_expiry WHERE expires_at < ?)").bind(old),
    env.DB.prepare("DELETE FROM site_expiry WHERE expires_at < ?").bind(old),
  ]);
}
