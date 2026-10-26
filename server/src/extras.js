// Auto-reply ("I'm on vacation") and temporary addresses.

const DAY = 24 * 3600 * 1000;

/* ================================================================== */
/* Auto-reply                                                          */
/* ================================================================== */

const AR_SUBJECT_MAX = 150;
const AR_BODY_MAX = 4000;
const AR_SAME_SENDER_GAP = 4 * DAY; // one auto-reply per sender every 4 days
const AR_PER_DAY = 50;
// Never auto-answer robots, mailing lists or bounce addresses.
const NO_REPLY_RE = /^(no-?reply|do-?not-?reply|mailer-daemon|postmaster|bounces?|notifications?|newsletter|news|alerts?)([+._-].*)?@/i;

export async function getAutoReply(env, userId) {
  const r = await env.DB.prepare("SELECT * FROM auto_replies WHERE user_id = ?").bind(userId).first();
  return {
    enabled: !!r?.enabled,
    subject: r?.subject || "",
    body: r?.body || "",
    startsAt: r?.starts_at || null,
    endsAt: r?.ends_at || null,
    updatedAt: r?.updated_at || 0,
  };
}

/** Is it switched on and inside its dates right now? */
export const autoReplyActive = (ar, now = Date.now()) =>
  ar.enabled && ar.body.trim() && (!ar.startsAt || ar.startsAt <= now) && (!ar.endsAt || ar.endsAt > now);

export async function saveAutoReply(env, userId, input, HttpError) {
  const enabled = !!input.enabled;
  const subject = String(input.subject || "").replace(/[\r\n]+/g, " ").trim().slice(0, AR_SUBJECT_MAX);
  const body = String(input.body || "").replace(/\r\n/g, "\n").trim();
  if (body.length > AR_BODY_MAX) throw new HttpError(400, "The message is too long.", "autoreply_long", { max: AR_BODY_MAX });
  if (enabled && body.length < 2) throw new HttpError(400, "Write the message people will get.", "autoreply_empty");
  const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
  const startsAt = num(input.startsAt);
  const endsAt = num(input.endsAt);
  if ((startsAt !== null && !Number.isFinite(startsAt)) || (endsAt !== null && !Number.isFinite(endsAt))) throw new HttpError(400, "Invalid request.");
  if (startsAt && endsAt && endsAt <= startsAt) throw new HttpError(400, "The end date must be after the start date.", "autoreply_dates");
  await env.DB.prepare(`INSERT INTO auto_replies (user_id, enabled, subject, body, starts_at, ends_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET enabled = excluded.enabled, subject = excluded.subject, body = excluded.body,
    starts_at = excluded.starts_at, ends_at = excluded.ends_at, updated_at = excluded.updated_at`)
    .bind(userId, enabled ? 1 : 0, subject, body, startsAt, endsAt, Date.now()).run();
  // A new message starts fresh: people who already got the old one can get the new one.
  await env.DB.prepare("DELETE FROM auto_reply_log WHERE user_id = ?").bind(userId).run();
  return getAutoReply(env, userId);
}

/** True if these headers say the mail came from a robot or a mailing list. */
export function isBulkMail(get) {
  const auto = (get("auto-submitted") || "").toLowerCase();
  if (auto && auto !== "no") return true;
  if (/^(bulk|list|junk|auto_reply)$/i.test((get("precedence") || "").trim())) return true;
  return !!(get("list-id") || get("list-unsubscribe") || get("x-auto-response-suppress") || get("feedback-id"));
}

/**
 * Answer a message automatically, if the recipient turned that on.
 * h: { insertMessage, notifyUser, rateLimit, getSettings, log }
 * Never throws: an auto-reply problem must not break delivering the real mail.
 */
export async function maybeAutoReply(env, h, { userId, userEmail, sender, subject, headers }) {
  try {
    const from = String(sender || "").trim().toLowerCase();
    if (!from || !from.includes("@") || from === userEmail.toLowerCase() || NO_REPLY_RE.test(from)) return;
    if (headers && isBulkMail(headers)) return;
    const ar = await getAutoReply(env, userId);
    if (!autoReplyActive(ar)) return;

    const now = Date.now();
    const last = await env.DB.prepare("SELECT sent_at FROM auto_reply_log WHERE user_id = ? AND sender = ?").bind(userId, from).first();
    if (last && now - last.sent_at < AR_SAME_SENDER_GAP) return;
    try { await h.rateLimit(env, `ar:${userId}`, AR_PER_DAY, DAY); } catch { return; }

    const original = String(subject || "").trim();
    const replySubject = ar.subject || (original ? `Re: ${original.replace(/^re:\s*/i, "")}` : "Auto-reply");
    const profile = await env.DB.prepare("SELECT display_name FROM profiles WHERE user_id = ?").bind(userId).first();
    const name = profile?.display_name || userEmail.split("@")[0];
    let sent = false;

    if (from.endsWith(`@${env.MAIL_DOMAIN}`)) {
      const target = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(from.split("@")[0]).first();
      if (!target) return;
      await h.insertMessage(env, target.id, { folder: "inbox", fromName: name, fromAddr: userEmail, to: from, subject: replySubject, body: ar.body, date: now });
      await h.notifyUser(env, target.id);
      sent = true;
    } else {
      const settings = await h.getSettings(env);
      if (!env.RESEND_API_KEY || !settings.outboundEnabled) return;
      try { await h.rateLimit(env, "out:global", h.outboundGlobal, DAY); } catch { return; }
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: `"${name.replace(/["\\]/g, "")}" <${userEmail}>`,
          to: [from],
          subject: replySubject,
          text: ar.body,
          headers: { "Auto-Submitted": "auto-replied", "X-Auto-Response-Suppress": "All" },
        }),
      });
      sent = res.ok;
      if (!res.ok) console.error("auto-reply", res.status, await res.text());
    }
    if (!sent) return;
    await env.DB.prepare("INSERT INTO auto_reply_log (user_id, sender, sent_at) VALUES (?, ?, ?) ON CONFLICT(user_id, sender) DO UPDATE SET sent_at = excluded.sent_at")
      .bind(userId, from, now).run();
    h.log?.("mail", "🏖️ מענה אוטומטי נשלח", { "מאת": userEmail, "אל (דומיין)": from.split("@")[1] });
  } catch (e) {
    console.error("auto-reply failed", e);
  }
}

/* ================================================================== */
/* Temporary addresses                                                 */
/* ================================================================== */

export const TEMP_RE = /^tmp-[a-z0-9]{8}$/;
export const TEMP_PREFIX_RE = /^tmp[._-]/; // nobody can register a name that looks like one
const TEMP_HOURS = [1, 24, 24 * 7, 24 * 30];
const TEMP_MAX_ACTIVE = 5;
const LABEL_MAX = 40;

export async function tempMode(env) {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'temp_mode'").first();
  return ["off", "chosen", "all"].includes(row?.value) ? row.value : "chosen";
}

/** May this user create temporary addresses? */
export async function tempAllowed(env, user, isAdmin) {
  if (isAdmin) return true;
  const mode = await tempMode(env);
  if (mode === "all") return true;
  if (mode === "off") return false;
  return !!(await env.DB.prepare("SELECT 1 FROM temp_access WHERE user_id = ?").bind(user.id).first());
}

function randomLocal() {
  const abc = "abcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return `tmp-${[...bytes].map((b) => abc[b % abc.length]).join("")}`;
}

const clientTemp = (r, domain) => ({
  address: `${r.local}@${domain}`, label: r.label || "", createdAt: r.created_at, expiresAt: r.expires_at, received: r.received,
});

/** /api/temp* routes (logged-in users). Returns null when the path isn't ours. */
export async function tempRoute(req, env, path, user, h) {
  const { HttpError, json, readJson, log, admin } = h;
  if (!path.startsWith("/api/temp")) return null;
  const allowed = await tempAllowed(env, user, admin);

  if (path === "/api/temp" && req.method === "GET") {
    const { results } = await env.DB.prepare("SELECT * FROM temp_addresses WHERE user_id = ? AND expires_at > ? ORDER BY created_at DESC").bind(user.id, Date.now()).all();
    return json({ allowed, max: TEMP_MAX_ACTIVE, addresses: results.map((r) => clientTemp(r, env.MAIL_DOMAIN)) });
  }

  if (!allowed) throw new HttpError(403, "Temporary addresses aren't turned on for your account.", "temp_not_allowed");

  if (path === "/api/temp" && req.method === "POST") {
    const { hours, label } = await readJson(req);
    const h2 = TEMP_HOURS.includes(Number(hours)) ? Number(hours) : 24;
    const now = Date.now();
    const active = await env.DB.prepare("SELECT COUNT(*) AS n FROM temp_addresses WHERE user_id = ? AND expires_at > ?").bind(user.id, now).first();
    if (active.n >= TEMP_MAX_ACTIVE) throw new HttpError(400, "You have the most temporary addresses at once. Delete one first.", "temp_limit", { max: TEMP_MAX_ACTIVE });
    await h.rateLimit(env, `tmp:${user.id}`, 20, DAY);
    let local = randomLocal();
    for (let i = 0; i < 5 && (await env.DB.prepare("SELECT 1 FROM temp_addresses WHERE local = ?").bind(local).first()); i++) local = randomLocal();
    const row = { local, user_id: user.id, label: String(label || "").trim().slice(0, LABEL_MAX), created_at: now, expires_at: now + h2 * 3600 * 1000, received: 0 };
    await env.DB.prepare("INSERT INTO temp_addresses (local, user_id, label, created_at, expires_at, received) VALUES (?, ?, ?, ?, ?, 0)")
      .bind(row.local, row.user_id, row.label, row.created_at, row.expires_at).run();
    log("accounts", "⏳ כתובת זמנית נוצרה", { "משתמש": user.email, "תוקף (שעות)": h2 });
    return json(clientTemp(row, env.MAIL_DOMAIN), 201);
  }

  const m = path.match(/^\/api\/temp\/(tmp-[a-z0-9]{8})(\/extend)?$/);
  if (!m) return null;
  const row = await env.DB.prepare("SELECT * FROM temp_addresses WHERE local = ? AND user_id = ?").bind(m[1], user.id).first();
  if (!row) throw new HttpError(404, "This temporary address wasn't found.", "temp_not_found");

  if (m[2] && req.method === "POST") {
    const { hours } = await readJson(req);
    const h2 = TEMP_HOURS.includes(Number(hours)) ? Number(hours) : 24;
    const now = Date.now();
    const expires = Math.min(Math.max(now, row.expires_at) + h2 * 3600 * 1000, now + 30 * DAY);
    await env.DB.prepare("UPDATE temp_addresses SET expires_at = ? WHERE local = ?").bind(expires, row.local).run();
    return json(clientTemp({ ...row, expires_at: expires }, env.MAIL_DOMAIN));
  }
  if (!m[2] && req.method === "DELETE") {
    await env.DB.prepare("DELETE FROM temp_addresses WHERE local = ?").bind(row.local).run();
    log("accounts", "🗑️ כתובת זמנית נמחקה", { "משתמש": user.email });
    return json({ ok: true });
  }
  throw new HttpError(405, "Not allowed.");
}

/** Inbound mail to a temporary address: who gets it (or null if it doesn't exist or expired). */
export async function tempOwner(env, local) {
  if (!TEMP_RE.test(local)) return null;
  const row = await env.DB.prepare("SELECT user_id FROM temp_addresses WHERE local = ? AND expires_at > ?").bind(local, Date.now()).first();
  if (!row) return null;
  await env.DB.prepare("UPDATE temp_addresses SET received = received + 1 WHERE local = ?").bind(local).run();
  return row.user_id;
}
