// Live support chat: the help window on the site (visitors and logged-in users) and the admin Support tab.
// Visitors who aren't logged in get a random key the first time they write; only its hash is stored.

const MSG_MIN = 2;
const MSG_MAX = 2000;
const NAME_MAX = 60;
const EMAIL_RE = /^[^\s@<>"]{1,64}@[^\s@<>"]{1,190}\.[a-z]{2,24}$/i;
const PREVIEW = 140;

const BOT = {
  he: {
    welcome: (online) => `תודה שכתבת לנו! 🙌\nההודעה הגיעה לצוות התמיכה. ${online ? "אנחנו מחוברים עכשיו ונענה כאן בקרוב." : "נענה כאן בהקדם, בדרך כלל תוך כמה שעות."}`,
    guest: "התשובה תופיע בחלון הזה. אפשר לסגור אותו ולחזור מאותו דפדפן בכל זמן.",
    guestEmail: (e) => `נשלח עותק של התשובה גם ל-${e}.`,
    closed: "השיחה סומנה כפתורה. אם יש עוד משהו, פשוט כתבו כאן והיא תיפתח מחדש.",
    inboxSubject: "יש לך תשובה מצוות התמיכה 💬",
    inboxBody: (preview) => `היי,\n\nצוות התמיכה של Ranilix ענה לך:\n\n"${preview}"\n\nכדי לראות את כל השיחה ולענות, לחצו על כפתור העזרה (הבועה בפינת המסך).\n\nצוות Ranilix`,
    mailSubject: "תשובה מצוות התמיכה של Ranilix",
    mailBody: (text) => `היי,\n\n${text}\n\nכדי להמשיך את השיחה, חזרו לאתר ופתחו את חלון העזרה מאותו דפדפן.\n\nצוות Ranilix`,
  },
  en: {
    welcome: (online) => `Thanks for writing to us! 🙌\nYour message reached our support team. ${online ? "We're online now and will answer here soon." : "We'll answer here soon, usually within a few hours."}`,
    guest: "The answer will show up in this window. You can close it and come back from this browser any time.",
    guestEmail: (e) => `We'll also send a copy of the answer to ${e}.`,
    closed: "This conversation was marked as solved. If there's anything else, just write here and it opens again.",
    inboxSubject: "You have a reply from our support team 💬",
    inboxBody: (preview) => `Hi,\n\nThe Ranilix support team answered you:\n\n"${preview}"\n\nTo see the whole conversation and reply, click the help button (the bubble in the corner of the screen).\n\nThe Ranilix Team`,
    mailSubject: "A reply from Ranilix support",
    mailBody: (text) => `Hi,\n\n${text}\n\nTo continue the conversation, come back to the site and open the help window from the same browser.\n\nThe Ranilix Team`,
  },
};
const bot = (lang) => BOT[lang === "he" ? "he" : "en"];

const clientThread = (t) => ({
  id: String(t.id),
  topic: t.topic || "",
  status: t.status,
  rating: t.rating ?? null,
  createdAt: t.created_at,
  updatedAt: t.updated_at,
  lastFrom: t.last_from,
  lastPreview: t.last_preview || "",
  unread: t.user_unread || 0,
});
const clientMessage = (m) => ({ id: String(m.id), sender: m.sender, author: m.author || "", body: m.body, createdAt: m.created_at });

function cleanText(v) {
  return String(v ?? "").replace(/\r\n/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();
}

async function isOnline(env) {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'support_online'").first();
  return row?.value === "1";
}

async function addMessage(env, threadId, sender, author, body, now = Date.now()) {
  await env.DB.prepare("INSERT INTO support_messages (thread_id, sender, author, body, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(threadId, sender, author || "", body, now).run();
}

/** Who is asking: a logged-in user, a visitor with a key, or nobody yet. */
async function whoIs(req, env, h) {
  let user = null;
  if ((req.headers.get("Authorization") || "").startsWith("Bearer ")) {
    try { user = await h.requireUser(req, env); } catch { user = null; }
  }
  const key = (req.headers.get("X-Support-Key") || "").trim();
  const guestHash = /^[a-f0-9]{48}$/.test(key) ? await h.sha256(key) : null;
  // A visitor who logs in later keeps the conversations they started.
  if (user && guestHash) {
    await env.DB.prepare("UPDATE support_threads SET user_id = ?, email = ?, guest_hash = NULL WHERE guest_hash = ? AND user_id IS NULL")
      .bind(user.id, user.email, guestHash).run();
  }
  return { user, guestHash };
}

async function ownThread(env, who, id) {
  const t = await env.DB.prepare("SELECT * FROM support_threads WHERE id = ?").bind(id).first();
  const mine = t && ((who.user && t.user_id === who.user.id) || (!t.user_id && who.guestHash && t.guest_hash === who.guestHash));
  return mine ? t : null;
}

/** Public part: /api/support/* (works with or without a login). Returns null when the path isn't ours. */
export async function supportRoute(req, env, path, h) {
  const { HttpError, json, readJson, rateLimit, log, ip } = h;

  if (path === "/api/support/info" && req.method === "GET") {
    return json({ online: await isOnline(env) });
  }

  if (!path.startsWith("/api/support/threads")) return null;
  const who = await whoIs(req, env, h);

  // List my conversations
  if (path === "/api/support/threads" && req.method === "GET") {
    if (!who.user && !who.guestHash) return json({ threads: [], unread: 0 });
    const { results } = who.user
      ? await env.DB.prepare("SELECT * FROM support_threads WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50").bind(who.user.id).all()
      : await env.DB.prepare("SELECT * FROM support_threads WHERE guest_hash = ? AND user_id IS NULL ORDER BY updated_at DESC LIMIT 50").bind(who.guestHash).all();
    return json({ threads: results.map(clientThread), unread: results.reduce((s, t) => s + (t.user_unread || 0), 0) });
  }

  // Start a conversation
  if (path === "/api/support/threads" && req.method === "POST") {
    const { message, name, email, topic, page, lang } = await readJson(req);
    const text = cleanText(message);
    if (text.length < MSG_MIN) throw new HttpError(400, "Write a few words first.", "support_short");
    if (text.length > MSG_MAX) throw new HttpError(400, "That message is too long.", "support_long", { max: MSG_MAX });
    const guestEmail = cleanText(email).toLowerCase();
    if (!who.user && guestEmail && !EMAIL_RE.test(guestEmail)) throw new HttpError(400, "That email address doesn't look right.", "support_email");
    await rateLimit(env, who.user ? `sup:new:${who.user.id}` : `sup:new:${ip}`, 6, 3600 * 1000);
    if (!who.user) await rateLimit(env, `sup:newday:${ip}`, 15, 24 * 3600 * 1000);

    let guestKey = null;
    let guestHash = who.guestHash;
    if (!who.user && !guestHash) {
      guestKey = h.randomHex(24);
      guestHash = await h.sha256(guestKey);
    }
    if (!who.user) {
      const open = await env.DB.prepare("SELECT COUNT(*) AS n FROM support_threads WHERE guest_hash = ? AND status = 'open'").bind(guestHash).first();
      if (open.n >= 3) throw new HttpError(429, "You already have open conversations. Please continue one of them.", "support_too_many");
    }

    const now = Date.now();
    const displayName = cleanText(name).slice(0, NAME_MAX);
    const res = await env.DB.prepare(`INSERT INTO support_threads
      (user_id, guest_hash, name, email, topic, status, lang, created_at, updated_at, last_from, last_preview, user_unread, admin_unread, page, user_agent)
      VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?, 'bot', ?, 0, 1, ?, ?)`)
      .bind(who.user?.id ?? null, who.user ? null : guestHash, displayName, who.user ? who.user.email : guestEmail,
        cleanText(topic).slice(0, 40), lang === "he" ? "he" : "en", now, now, "", String(page || "").slice(0, 200),
        (req.headers.get("User-Agent") || "").slice(0, 300)).run();
    const id = res.meta.last_row_id;
    await addMessage(env, id, "user", displayName, text, now);

    const b = bot(lang);
    let auto = b.welcome(await isOnline(env));
    if (!who.user) auto += `\n\n${guestEmail ? b.guestEmail(guestEmail) : b.guest}`;
    await addMessage(env, id, "bot", "Ranilix", auto, now + 1);
    await env.DB.prepare("UPDATE support_threads SET last_preview = ? WHERE id = ?").bind(auto.slice(0, PREVIEW), id).run();

    log("support", "💬 שיחת תמיכה חדשה", {
      "מאת": who.user ? who.user.email : `אורח${displayName ? ` (${displayName})` : ""}`,
      "אימייל לחזרה": who.user ? "" : guestEmail || "—",
      "נושא": cleanText(topic).slice(0, 40),
      "עמוד": String(page || "").slice(0, 100),
    }, text.slice(0, 1500));

    const t = await env.DB.prepare("SELECT * FROM support_threads WHERE id = ?").bind(id).first();
    const { results } = await env.DB.prepare("SELECT * FROM support_messages WHERE thread_id = ? ORDER BY id").bind(id).all();
    return json({ thread: clientThread(t), messages: results.map(clientMessage), ...(guestKey ? { guestKey } : {}) }, 201);
  }

  const m = path.match(/^\/api\/support\/threads\/(\d+)(\/messages|\/rate)?$/);
  if (!m) return null;
  const t = await ownThread(env, who, Number(m[1]));
  if (!t) throw new HttpError(404, "This conversation wasn't found.", "support_not_found");

  // Read a conversation
  if (!m[2] && req.method === "GET") {
    const after = Number(new URL(req.url).searchParams.get("after")) || 0;
    const { results } = await env.DB.prepare("SELECT * FROM support_messages WHERE thread_id = ? AND id > ? ORDER BY id LIMIT 500").bind(t.id, after).all();
    if (t.user_unread) await env.DB.prepare("UPDATE support_threads SET user_unread = 0 WHERE id = ?").bind(t.id).run();
    return json({ thread: clientThread({ ...t, user_unread: 0 }), messages: results.map(clientMessage) });
  }

  // Write in a conversation
  if (m[2] === "/messages" && req.method === "POST") {
    const { message } = await readJson(req);
    const text = cleanText(message);
    if (text.length < MSG_MIN) throw new HttpError(400, "Write a few words first.", "support_short");
    if (text.length > MSG_MAX) throw new HttpError(400, "That message is too long.", "support_long", { max: MSG_MAX });
    await rateLimit(env, `sup:msg:${t.id}`, 30, 10 * 60 * 1000);
    const now = Date.now();
    await addMessage(env, t.id, "user", t.name || "", text, now);
    await env.DB.prepare("UPDATE support_threads SET status = 'open', updated_at = ?, last_from = 'user', last_preview = ?, admin_unread = admin_unread + 1, user_unread = 0 WHERE id = ?")
      .bind(now, text.slice(0, PREVIEW), t.id).run();
    log("support", t.status === "closed" ? "🔁 שיחת תמיכה נפתחה מחדש" : "💬 הודעה חדשה בשיחת תמיכה", {
      "שיחה": `#${t.id}`, "מאת": t.user_id ? t.email : `אורח${t.name ? ` (${t.name})` : ""}`,
    }, text.slice(0, 1500));
    const { results } = await env.DB.prepare("SELECT * FROM support_messages WHERE thread_id = ? AND created_at >= ? ORDER BY id").bind(t.id, now).all();
    return json({ ok: true, messages: results.map(clientMessage) }, 201);
  }

  // Rate a solved conversation
  if (m[2] === "/rate" && req.method === "POST") {
    const { rating } = await readJson(req);
    const r = rating === 1 || rating === -1 ? rating : null;
    if (r === null) throw new HttpError(400, "Invalid request.");
    await env.DB.prepare("UPDATE support_threads SET rating = ? WHERE id = ?").bind(r, t.id).run();
    log("support", r === 1 ? "👍 דירוג טוב לשיחת תמיכה" : "👎 דירוג רע לשיחת תמיכה", { "שיחה": `#${t.id}`, "מאת": t.email || "אורח" });
    return json({ ok: true, rating: r });
  }

  throw new HttpError(405, "Not allowed.");
}

const adminThread = (t) => ({
  ...clientThread(t),
  unread: t.admin_unread || 0,
  name: t.name || "",
  email: t.email || "",
  member: !!t.user_id,
  lang: t.lang,
  page: t.page || "",
  userAgent: t.user_agent || "",
});

/** Admin part: /api/admin/support*. Returns null when the path isn't ours. */
export async function supportAdminRoute(req, env, admin, path, url, h) {
  const { HttpError, json, readJson, log } = h;
  if (!path.startsWith("/api/admin/support")) return null;

  if (path === "/api/admin/support-settings" && req.method === "PUT") {
    const { online } = await readJson(req);
    await h.setSetting(env, "support_online", online ? "1" : "0");
    log("admin", online ? "🟢 התמיכה סומנה כמחוברת" : "⚪ התמיכה סומנה כלא מחוברת", { "מנהל": admin.email });
    return json({ online: !!online });
  }

  if (path === "/api/admin/support" && req.method === "GET") {
    const status = url.searchParams.get("status") || "open";
    const where = status === "all" ? "" : "WHERE status = ?";
    const stmt = env.DB.prepare(`SELECT * FROM support_threads ${where} ORDER BY admin_unread > 0 DESC, updated_at DESC LIMIT 200`);
    const { results } = await (status === "all" ? stmt : stmt.bind(status === "closed" ? "closed" : "open")).all();
    const counts = await env.DB.prepare("SELECT status, COUNT(*) AS n, COALESCE(SUM(admin_unread > 0), 0) AS u FROM support_threads GROUP BY status").all();
    const c = Object.fromEntries(counts.results.map((r) => [r.status, r]));
    return json({
      threads: results.map(adminThread),
      open: c.open?.n || 0,
      closed: c.closed?.n || 0,
      all: (c.open?.n || 0) + (c.closed?.n || 0),
      unread: (c.open?.u || 0) + (c.closed?.u || 0),
      online: await isOnline(env),
    });
  }

  const m = path.match(/^\/api\/admin\/support\/(\d+)(\/messages)?$/);
  if (!m) return null;
  const t = await env.DB.prepare("SELECT * FROM support_threads WHERE id = ?").bind(Number(m[1])).first();
  if (!t) throw new HttpError(404, "This conversation wasn't found.", "support_not_found");

  if (!m[2] && req.method === "GET") {
    const { results } = await env.DB.prepare("SELECT * FROM support_messages WHERE thread_id = ? ORDER BY id LIMIT 1000").bind(t.id).all();
    if (t.admin_unread) await env.DB.prepare("UPDATE support_threads SET admin_unread = 0 WHERE id = ?").bind(t.id).run();
    let others = 0;
    if (t.user_id) {
      others = (await env.DB.prepare("SELECT COUNT(*) AS n FROM support_threads WHERE user_id = ? AND id != ?").bind(t.user_id, t.id).first()).n;
    }
    return json({ thread: { ...adminThread({ ...t, admin_unread: 0 }), otherThreads: others }, messages: results.map(clientMessage) });
  }

  if (m[2] && req.method === "POST") {
    const { message } = await readJson(req);
    const text = cleanText(message);
    if (text.length < 1) throw new HttpError(400, "Write a few words first.", "support_short");
    if (text.length > MSG_MAX * 2) throw new HttpError(400, "That message is too long.", "support_long", { max: MSG_MAX * 2 });
    const now = Date.now();
    await addMessage(env, t.id, "admin", admin.username, text, now);
    await env.DB.prepare("UPDATE support_threads SET status = 'open', updated_at = ?, last_from = 'admin', last_preview = ?, user_unread = user_unread + 1, admin_unread = 0 WHERE id = ?")
      .bind(now, text.slice(0, PREVIEW), t.id).run();
    const b = bot(t.lang);
    let emailed = false;
    if (t.user_id) {
      // One inbox note per batch of unread replies, so a long chat doesn't flood the inbox.
      if (!t.user_unread) {
        await h.insertMessage(env, t.user_id, {
          folder: "inbox", fromName: "Ranilix Support", fromAddr: `support@${env.MAIL_DOMAIN}`, to: t.email,
          subject: b.inboxSubject, body: b.inboxBody(text.slice(0, 400)), date: now,
        });
      }
      await h.notifyUser(env, t.user_id);
    } else if (t.email && env.RESEND_API_KEY) {
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: `"Ranilix Support" <support@${env.MAIL_DOMAIN}>`, to: [t.email], subject: b.mailSubject, text: b.mailBody(text) }),
        });
        emailed = res.ok;
        if (!res.ok) console.error("support mail", res.status, await res.text());
      } catch (e) { console.error("support mail", e); }
    }
    log("support", "↩️ מנהל ענה בשיחת תמיכה", { "שיחה": `#${t.id}`, "מנהל": admin.email, "אל": t.email || "אורח", "נשלח במייל": emailed ? "כן" : "" }, text.slice(0, 1500));
    const { results } = await env.DB.prepare("SELECT * FROM support_messages WHERE thread_id = ? AND created_at >= ? ORDER BY id").bind(t.id, now).all();
    return json({ ok: true, emailed, messages: results.map(clientMessage) }, 201);
  }

  if (!m[2] && req.method === "PUT") {
    const { status } = await readJson(req);
    const next = status === "closed" ? "closed" : "open";
    const now = Date.now();
    if (next === "closed" && t.status !== "closed") {
      const text = bot(t.lang).closed;
      await addMessage(env, t.id, "bot", "Ranilix", text, now);
      await env.DB.prepare("UPDATE support_threads SET status = 'closed', updated_at = ?, last_from = 'bot', last_preview = ?, user_unread = user_unread + 1 WHERE id = ?")
        .bind(now, text.slice(0, PREVIEW), t.id).run();
    } else if (next === "open") {
      await env.DB.prepare("UPDATE support_threads SET status = 'open' WHERE id = ?").bind(t.id).run();
    }
    log("admin", next === "closed" ? "✅ שיחת תמיכה נסגרה" : "🔁 שיחת תמיכה נפתחה מחדש", { "שיחה": `#${t.id}`, "מנהל": admin.email });
    return json({ ok: true, status: next });
  }

  if (!m[2] && req.method === "DELETE") {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM support_messages WHERE thread_id = ?").bind(t.id),
      env.DB.prepare("DELETE FROM support_threads WHERE id = ?").bind(t.id),
    ]);
    log("admin", "🗑️ שיחת תמיכה נמחקה", { "שיחה": `#${t.id}`, "מנהל": admin.email });
    return json({ ok: true });
  }

  throw new HttpError(405, "Not allowed.");
}
