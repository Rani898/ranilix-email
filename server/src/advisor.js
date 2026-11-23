// The admin's "advisor room": a private chat with an AI business advisor that sees the site's live
// numbers and answers like an honest outside critic — not a cheerleader. Admin only.
import { aiAvailable, generate } from "./ai.js";

const DAY = 24 * 3600 * 1000;
const HISTORY = 24;
const MAX_TEXT = 4000;

/** A short, factual snapshot of the site right now, handed to the advisor with every question. */
export async function siteSnapshot(env) {
  const now = Date.now();
  const one = async (sql, ...args) => {
    try { return (await env.DB.prepare(sql).bind(...args).first()) || {}; } catch { return {}; }
  };
  const [users, new1, new7, new30, prev7, active7, active30, suspended, msgs, in1, out1, threads, unread, reports, drive, temp, sites, discord, ai] = await Promise.all([
    one("SELECT COUNT(*) AS n FROM users"),
    one("SELECT COUNT(*) AS n FROM users WHERE created_at > ?", now - DAY),
    one("SELECT COUNT(*) AS n FROM users WHERE created_at > ?", now - 7 * DAY),
    one("SELECT COUNT(*) AS n FROM users WHERE created_at > ?", now - 30 * DAY),
    one("SELECT COUNT(*) AS n FROM users WHERE created_at > ? AND created_at <= ?", now - 14 * DAY, now - 7 * DAY),
    one("SELECT COUNT(*) AS n FROM (SELECT user_id FROM user_meta WHERE last_login_at > ? UNION SELECT user_id FROM device_sessions WHERE last_seen > ?)", now - 7 * DAY, now - 7 * DAY),
    one("SELECT COUNT(*) AS n FROM (SELECT user_id FROM user_meta WHERE last_login_at > ? UNION SELECT user_id FROM device_sessions WHERE last_seen > ?)", now - 30 * DAY, now - 30 * DAY),
    one("SELECT COUNT(*) AS n FROM user_meta WHERE suspended = 1"),
    one("SELECT COUNT(*) AS n FROM messages"),
    one("SELECT COUNT(*) AS n FROM messages WHERE date > ? AND folder = 'inbox'", now - DAY),
    one("SELECT COUNT(*) AS n FROM messages WHERE date > ? AND folder = 'sent'", now - DAY),
    one("SELECT COUNT(*) AS n, SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open FROM support_threads WHERE created_at > ?", now - 30 * DAY),
    one("SELECT COUNT(*) AS n FROM support_threads WHERE admin_unread > 0"),
    one("SELECT COUNT(*) AS n FROM reports WHERE status = 'open'"),
    one("SELECT COUNT(DISTINCT user_id) AS users, COUNT(*) AS files, COALESCE(SUM(size), 0) AS bytes FROM drive_files WHERE is_folder = 0"),
    one("SELECT COUNT(*) AS n FROM temp_addresses"),
    one("SELECT COUNT(*) AS n FROM site_addresses"),
    one("SELECT COUNT(*) AS n FROM discord_links"),
    one("SELECT COUNT(*) AS n FROM support_messages WHERE sender = 'ai' AND created_at > ?", now - 30 * DAY),
  ]);
  const n = (r, k = "n") => Number(r?.[k] || 0);
  const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : "n/a");
  const lines = [
    `Date: ${new Date(now).toISOString().slice(0, 10)}`,
    `Registered users: ${n(users)} (suspended: ${n(suspended)})`,
    `New sign-ups: last 24h ${n(new1)}, last 7 days ${n(new7)} (previous 7 days ${n(prev7)}), last 30 days ${n(new30)}`,
    `Active users (signed in or used the site): last 7 days ${n(active7)} = ${pct(n(active7), n(users))} of all; last 30 days ${n(active30)} = ${pct(n(active30), n(users))}`,
    `Emails stored: ${n(msgs)}; received in last 24h: ${n(in1)}; sent in last 24h: ${n(out1)}`,
    `Support chats last 30 days: ${n(threads)} (still open: ${n(threads, "open")}); waiting for the admin now: ${n(unread)}; AI desk answers last 30 days: ${n(ai)}`,
    `Open abuse/bug reports: ${n(reports)}`,
    `Drive: ${n(drive, "users")} users store ${n(drive, "files")} files, ${(n(drive, "bytes") / 1024 / 1024).toFixed(0)} MB total`,
    `Temporary addresses: ${n(temp)}; per-site addresses (Chrome extension): ${n(sites)}; Discord-linked accounts: ${n(discord)}`,
  ];
  return lines.join("\n");
}

const PRODUCT = [
  "Ranilix (ranilix.com) is a 100% free webmail service run by one person, Rani, as a side project, on Cloudflare's free tier (Workers, D1, R2, Workers AI). No ads, no paid plan yet.",
  "Features: free name@ranilix.com address (up to 5 per person), temporary/expiring addresses, a Chrome extension that makes a per-site address + password, Drive (file storage + share links with view-only, visitor log, block/appeal, change link, folder covers), receipts with monthly summary, calendar, contacts, auto-reply, push notifications, installable app (PWA), Discord bot, Gmail import, an AI support desk that hands off to Rani, a private AI chat (Mochi), themes/skins, Hebrew + English.",
  "Audience so far: mostly Israeli, Hebrew-speaking, many young users; growth is word of mouth.",
  "Constraints: free infrastructure limits (outbound email has a daily cap), one developer, no marketing budget.",
];

function advisorPrompt(snapshot) {
  return [
    "You are the private business advisor of Rani, founder of Ranilix. You sit in his admin panel. Act like a sharp, experienced startup advisor and an honest outside critic — a real reviewer, not a cheerleader.",
    "Rules:",
    "- Reply in the language Rani writes in (usually Hebrew). Be direct and concise; use short paragraphs or numbered points.",
    "- Ground every judgement in the live numbers below when they are relevant; quote them. If a number is missing or too small to judge, say so instead of guessing.",
    "- Say clearly what is weak, risky or a waste of time, and why. Don't flatter. Praise only what the numbers or facts actually support.",
    "- Always end with concrete next steps: what to do this week, in priority order, and what to measure to know it worked.",
    "- Challenge vague ideas with one or two sharp questions when needed.",
    "- Think about growth, retention, trust and safety, costs on the free tier, legal basics (privacy, abuse, spam), and focus. Prefer cheap, testable experiments.",
    "- Never invent facts about the market, competitors' numbers or laws; say when something needs checking. Never ask for passwords or secrets.",
    "",
    "About the product:",
    ...PRODUCT,
    "",
    "Live site numbers right now:",
    snapshot,
  ].join("\n");
}

/** /api/ai/advisor for the admin. Returns null when the path isn't ours. */
export async function advisorRoute(req, env, path, user, h) {
  if (path !== "/api/ai/advisor" && path !== "/api/ai/advisor/snapshot") return null;
  if (!h.admin) throw new h.HttpError(403, "Not available.", "forbidden");

  if (path === "/api/ai/advisor/snapshot" && req.method === "GET") {
    return h.json({ snapshot: await siteSnapshot(env) });
  }
  if (req.method === "GET") {
    const { results } = await env.DB.prepare("SELECT id, role, text, at FROM advisor_chat WHERE user_id = ? ORDER BY id DESC LIMIT 200").bind(user.id).all();
    return h.json({ ready: aiAvailable(env), messages: results.reverse().map((r) => ({ id: String(r.id), role: r.role, text: r.text, at: r.at })) });
  }
  if (req.method === "DELETE") {
    await env.DB.prepare("DELETE FROM advisor_chat WHERE user_id = ?").bind(user.id).run();
    return h.json({ ok: true });
  }
  if (req.method === "POST") {
    if (!aiAvailable(env)) throw new h.HttpError(503, "The advisor isn't connected yet.", "ai_not_ready");
    const { text } = await h.readJson(req);
    const msg = String(text || "").trim().slice(0, MAX_TEXT);
    if (!msg) throw new h.HttpError(400, "Write something first.", "ai_empty");
    await h.rateLimit(env, `advisor:${user.id}`, 200, DAY);
    const now = Date.now();
    await env.DB.prepare("INSERT INTO advisor_chat (user_id, role, text, at) VALUES (?, 'user', ?, ?)").bind(user.id, msg, now).run();
    const { results } = await env.DB.prepare("SELECT role, text FROM advisor_chat WHERE user_id = ? ORDER BY id DESC LIMIT ?").bind(user.id, HISTORY).all();
    const contents = [];
    for (const r of results.reverse()) {
      const role = r.role === "model" ? "model" : "user";
      if (contents.length && contents[contents.length - 1].role === role) contents[contents.length - 1].parts[0].text += `\n${r.text}`;
      else contents.push({ role, parts: [{ text: r.text }] });
    }
    while (contents.length && contents[0].role !== "user") contents.shift();
    let reply;
    try {
      reply = await generate(env, { system: advisorPrompt(await siteSnapshot(env)), contents, temperature: 0.55, maxOutputTokens: 1800 });
    } catch (e) {
      const detail = String(e?.message || "").slice(0, 300);
      h.log?.("errors", "🧭 היועץ לא הצליח לענות", { "סטטוס": String(e?.status || ""), "פרטים": detail });
      if (e?.status === 429) throw new h.HttpError(429, "The advisor needs a short break. Try again in a minute.", "ai_busy", { detail });
      throw new h.HttpError(502, "The advisor couldn't answer right now. Try again.", "ai_failed", { detail });
    }
    if (!reply) reply = "…";
    const at = Date.now();
    const res = await env.DB.prepare("INSERT INTO advisor_chat (user_id, role, text, at) VALUES (?, 'model', ?, ?)").bind(user.id, reply.slice(0, 20000), at).run();
    return h.json({ message: { id: String(res.meta.last_row_id), role: "model", text: reply, at } });
  }
  throw new h.HttpError(405, "Not allowed.");
}
