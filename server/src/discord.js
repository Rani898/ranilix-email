// Ranilix Discord bot. It runs inside this Worker (no extra server):
// Discord sends slash commands to POST /api/discord/interactions, and the Worker
// posts site updates, reports and new sign-ups to the Discord server with the bot token.
//
// Config: DISCORD_APP_ID and DISCORD_PUBLIC_KEY (vars, from the Developer Portal),
//         DISCORD_BOT_TOKEN (secret). The server/channels are linked with /setup in Discord.

const API = "https://discord.com/api/v10";
const SITE = "https://rani898.github.io/ranilix-email/";
const COLOR = 0x2547ea;
const EPHEMERAL = 64;
const CODE_TTL = 10 * 60 * 1000;
const enc = new TextEncoder();

export const discordConfigured = (env) => !!(env.DISCORD_APP_ID && env.DISCORD_PUBLIC_KEY);

const NO_DM = { dm_permission: false };
const ADMIN_ONLY = { default_member_permissions: "8", dm_permission: false };
export const COMMANDS = [
  { name: "site", description: "קישורים לאתר Ranilix Email", ...NO_DM },
  { name: "check", description: "בדיקה אם כתובת @ranilix.com פנויה", ...NO_DM,
    options: [{ type: 3, name: "name", description: "השם שרוצים, בלי @ranilix.com", required: true, max_length: 30 }] },
  { name: "status", description: "מצב השירות", ...NO_DM },
  { name: "help", description: "שאלות נפוצות ואיך מקבלים עזרה", ...NO_DM },
  { name: "report", description: "דיווח על בעיה או רעיון לצוות", ...NO_DM,
    options: [
      { type: 3, name: "message", description: "מה קרה? / מה הרעיון?", required: true, min_length: 5, max_length: 1500 },
      { type: 3, name: "type", description: "סוג הדיווח", required: false, choices: [
        { name: "משהו לא עובד", value: "bug" }, { name: "רעיון", value: "idea" }, { name: "ספאם או הטרדה", value: "spam" },
        { name: "החשבון שלי", value: "account" }, { name: "אחר", value: "other" },
      ] },
    ] },
  { name: "verify", description: "קבלת התפקיד 📧 משתמש Ranilix", ...NO_DM,
    options: [
      { type: 1, name: "start", description: "שליחת קוד לתיבה שלך ב-Ranilix",
        options: [{ type: 3, name: "email", description: "הכתובת שלך, למשל dana@ranilix.com", required: true, max_length: 80 }] },
      { type: 1, name: "code", description: "הקלדת הקוד שקיבלת במייל",
        options: [{ type: 3, name: "code", description: "6 הספרות מהמייל", required: true, min_length: 6, max_length: 6 }] },
    ] },
  { name: "stats", description: "נתוני האתר (למנהלים)", ...ADMIN_ONLY },
  { name: "setup", description: "חיבור הבוט לשרת הזה (למנהלים)", ...ADMIN_ONLY },
  { name: "block-links", description: "חסימת קישורים והזמנות לשרתים אחרים (למנהלים)", ...ADMIN_ONLY,
    options: [
      { type: 5, name: "links", description: "לחסום קישורים לאתרים (חוץ מהאתר של Ranilix)", required: false },
      { type: 5, name: "invites", description: "לחסום הזמנות לשרתי דיסקורד אחרים", required: false },
    ] },
  { name: "verify-panel", description: "שליחת פאנל אימות עם כפתור לערוץ הזה (למנהלים)", ...ADMIN_ONLY,
    options: [{ type: 5, name: "lock", description: "להסתיר את שאר הערוצים ממי שעוד לא לחץ על הכפתור", required: false }] },
];

/* ---------- Discord REST ---------- */

async function rest(env, method, path, body) {
  if (!env.DISCORD_BOT_TOKEN) throw new Error("no_token");
  const res = await fetch(API + path, {
    method,
    headers: {
      Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
      "User-Agent": `DiscordBot (${SITE}, 1.0)`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`discord_${res.status}: ${text.slice(0, 200)}`);
  }
  return res.status === 204 ? null : res.json();
}

async function discordSettings(env) {
  const { results } = await env.DB.prepare("SELECT key, value FROM settings WHERE key LIKE 'discord_%'").all();
  return Object.fromEntries(results.map((r) => [r.key.slice(8), r.value]));
}
const saveSetting = (env, key, value) =>
  env.DB.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(`discord_${key}`, String(value)).run();

/** Post an embed to the linked "updates" or "logs" channel. Never throws (site actions must not fail because of Discord). */
export async function discordNotify(env, which, embed) {
  try {
    if (!env.DISCORD_BOT_TOKEN) return;
    const channel = (await discordSettings(env))[which];
    if (!channel) return;
    await rest(env, "POST", `/channels/${channel}/messages`, {
      embeds: [{ color: COLOR, footer: { text: "Ranilix Email Free" }, timestamp: new Date().toISOString(), ...embed }],
      allowed_mentions: { parse: [] },
    });
  } catch (e) { console.error("discordNotify", which, e.message); }
}

/* ---------- Log channels ---------- */

// One Discord channel per kind of log. /setup creates the ones that are missing.
export const LOG_CHANNELS = {
  signups:  { name: "🆕│הרשמות",      color: 0x22c55e, topic: "כל משתמש חדש שנרשם לאתר." },
  logins:   { name: "🔑│התחברויות",   color: 0x3b82f6, topic: "התחברויות והתנתקויות." },
  accounts: { name: "👤│חשבונות",     color: 0x8b5cf6, topic: "שינוי סיסמה, שם, תמונה, מחיקת חשבון, חיבור Gmail." },
  mail:     { name: "📨│מיילים",      color: 0x0ea5e9, topic: "שליחת מיילים (כמה ולאן, בלי תוכן)." },
  security: { name: "🛡️│אבטחה",      color: 0xef4444, topic: "ניסיונות פריצה, נעילות, זיופים והצפות." },
  admin:    { name: "⚙️│ניהול",       color: 0xf59e0b, topic: "כל פעולה של מנהל בפאנל." },
  reports:  { name: "🚩│דיווחים",     color: 0xf97316, topic: "דיווחים מהאתר ומהדיסקורד." },
  support:  { name: "💬│תמיכה",       color: 0x6366f1, topic: "שיחות בחלון העזרה באתר: הודעות חדשות ותשובות." },
  verify:   { name: "✅│אימותים",     color: 0x10b981, topic: "אימותים בדיסקורד (כפתור ו-/verify)." },
  bot:      { name: "🤖│פקודות-בוט",  color: 0x64748b, topic: "מי השתמש באיזו פקודה." },
  errors:   { name: "⚠️│שגיאות-שרת", color: 0xdc2626, topic: "שגיאות בשרת שצריך לבדוק." },
};
const LOG_CATEGORY = "📊 לוגים";

/**
 * Returns log(kind, title, fields?, description?) for one request. Posts in the background (ctx.waitUntil)
 * so a slow Discord never slows the site. Falls back to the general logs channel. Never throws.
 */
export function createLogger(env, ctx) {
  let settingsPromise;
  const log = function log(kind, title, fields = {}, description) {
    if (!env.DISCORD_BOT_TOKEN) return;
    const work = (async () => {
      settingsPromise ||= discordSettings(env);
      const s = await settingsPromise;
      const channel = s[`log_${kind}`] || s.logs;
      if (!channel) return;
      const def = LOG_CHANNELS[kind] || {};
      const list = Object.entries(fields).filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(([name, value]) => ({ name, value: String(value).slice(0, 1000), inline: String(value).length < 40 }));
      await rest(env, "POST", `/channels/${channel}/messages`, {
        embeds: [{ color: def.color || COLOR, title: String(title).slice(0, 256), description: description ? String(description).slice(0, 3000) : undefined,
          fields: list.slice(0, 20), timestamp: new Date().toISOString() }],
        allowed_mentions: { parse: [] },
      });
    })().catch((e) => console.error("log", kind, e.message));
    if (ctx?.waitUntil) ctx.waitUntil(work); else return work;
  };
  log.ctx = ctx;
  return log;
}

/* ---------- Signature check ---------- */

const hexBytes = (hex) => new Uint8Array((hex.match(/../g) || []).map((h) => parseInt(h, 16)));

async function verifySignature(env, req, body) {
  const sig = req.headers.get("X-Signature-Ed25519") || "";
  const ts = req.headers.get("X-Signature-Timestamp") || "";
  if (!sig || !ts || !/^[0-9a-f]{64}$/i.test(env.DISCORD_PUBLIC_KEY || "")) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false; // replay protection
  try {
    const key = await crypto.subtle.importKey("raw", hexBytes(env.DISCORD_PUBLIC_KEY), { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify({ name: "Ed25519" }, key, hexBytes(sig), enc.encode(ts + body));
  } catch { return false; }
}

/* ---------- Commands ---------- */

const reply = (json, content, { embeds, ephemeral = true } = {}) =>
  json({ type: 4, data: { content, embeds, flags: ephemeral ? EPHEMERAL : 0, allowed_mentions: { parse: [] } } });
const opt = (options, name) => (options || []).find((o) => o.name === name)?.value;
const embed = (e) => ({ color: COLOR, ...e });
const isAdminMember = (i) => (BigInt(i.member?.permissions || "0") & 8n) === 8n;

async function sha256(s) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Handles POST /api/discord/interactions.
 * h = helpers from index.js: { json, validateUsername, RESERVED, insertMessage, notifyUser, rateLimit }
 */
export async function discordInteraction(req, env, h) {
  const body = await req.text();
  if (!discordConfigured(env) || !(await verifySignature(env, req, body))) return new Response("Bad signature", { status: 401 });
  const i = JSON.parse(body);

  if (i.type === 1) return h.json({ type: 1 }); // PING from Discord when you save the endpoint URL
  if (i.type === 3 && i.data?.custom_id === "ranilix_verify") return verifyButton(env, i, h);
  if (i.type !== 2) return h.json({ type: 4, data: { content: "🤷", flags: EPHEMERAL } });

  const user = i.member?.user || i.user || {};
  const name = i.data?.name;
  const options = i.data?.options || [];
  const sub = options[0]?.type === 1 ? ` ${options[0].name}` : "";
  h.log?.("bot", `🤖 /${name}${sub}`, { "משתמש": `<@${user.id}>`, "ערוץ": i.channel_id ? `<#${i.channel_id}>` : "" });
  const domain = env.MAIL_DOMAIN;

  try {
    if (name === "site") {
      return reply(h.json, null, { ephemeral: false, embeds: [embed({
        title: "🌐 Ranilix Email Free",
        description: `מייל חינמי עם כתובת משלכם ב-\`@${domain}\`. בלי כרטיס אשראי, לתמיד.`,
        url: SITE,
        fields: [
          { name: "✍️ הרשמה", value: `${SITE}signup`, inline: true },
          { name: "🔑 התחברות", value: `${SITE}login`, inline: true },
        ],
      })] });
    }

    if (name === "check") {
      const u = String(opt(options, "name") || "").toLowerCase().trim().replace(new RegExp(`@${domain.replace(/\./g, "\\.")}$`), "");
      const problem = h.validateUsername(u);
      if (problem) return reply(h.json, `❌ \`${u || "?"}\` לא יכול להיות כתובת. צריך לפחות 4 אותיות באנגלית או מספרים, בלי רווחים (מותר גם . - _).`);
      const taken = h.RESERVED.has(u) || !!(await env.DB.prepare("SELECT 1 FROM users WHERE username = ?").bind(u).first());
      return reply(h.json, taken
        ? `❌ \`${u}@${domain}\` כבר תפוסה. נסו שם אחר.`
        : `✅ \`${u}@${domain}\` פנויה! תפסו אותה לפני מישהו אחר: ${SITE}signup?u=${encodeURIComponent(u)}`);
    }

    if (name === "status") {
      const users = await env.DB.prepare("SELECT COUNT(*) AS n FROM users").first();
      return reply(h.json, null, { ephemeral: false, embeds: [embed({
        title: "✅ Ranilix פועל",
        fields: [
          { name: "שרת המיילים", value: "🟢 פעיל", inline: true },
          { name: "משתמשים רשומים", value: String(users.n), inline: true },
        ],
      })] });
    }

    if (name === "help") {
      return reply(h.json, null, { embeds: [embed({
        title: "❓ עזרה",
        fields: [
          { name: "איך פותחים כתובת?", value: `נכנסים ל-${SITE}signup ובוחרים שם וסיסמה. זה לוקח דקה.` },
          { name: "כמה כתובות אפשר?", value: "עד 5 לכל אחד. בתיבה: העיגול למעלה ← \"יצירת כתובת חדשה\"." },
          { name: "קוד לא הגיע?", value: "מחכים דקה ובודקים שהכתובת נכונה. אם עדיין לא, משתמשים ב-`/report`." },
          { name: "קבלת תפקיד משתמש", value: "`/verify start` עם הכתובת שלכם, ואז `/verify code` עם הקוד מהמייל." },
          { name: "⚠️ חשוב", value: "אף פעם לא כותבים בדיסקורד סיסמה או קוד. הצוות לא יבקש אותם." },
        ],
      })] });
    }

    if (name === "report") {
      await h.rateLimit(env, `dreport:${user.id}`, 5, 3600 * 1000);
      const message = String(opt(options, "message") || "").trim().slice(0, 1500);
      const category = opt(options, "type") || "other";
      if (message.length < 5) return reply(h.json, "כתבו קצת יותר, לפחות כמה מילים.");
      const who = `discord:${user.username || user.id}`;
      await env.DB.prepare("INSERT INTO reports (user_id, email, category, message, page, user_agent, created_at, status) VALUES (NULL, ?, ?, ?, 'discord', 'Discord', ?, 'open')")
        .bind(who, category, message, Date.now()).run();
      h.log?.("reports", "🚩 דיווח חדש מדיסקורד", { "מאת": `<@${user.id}>`, "סוג": category }, message);
      return reply(h.json, "✅ תודה! הדיווח הגיע לצוות.");
    }

    if (name === "verify") {
      const sub = options[0];
      if (sub?.name === "start") {
        await h.rateLimit(env, `dverify:${user.id}`, 5, 3600 * 1000);
        const local = String(opt(sub.options, "email") || "").toLowerCase().trim().replace(new RegExp(`@${domain.replace(/\./g, "\\.")}$`), "");
        const target = local && await env.DB.prepare("SELECT id, username FROM users WHERE username = ?").bind(local).first();
        let send = !!target;
        if (target) {
          // Max 3 codes an hour per address, so nobody can flood an inbox. Same reply either way.
          try { await h.rateLimit(env, `dverifyto:${target.id}`, 3, 3600 * 1000); } catch { send = false; }
        }
        if (send) {
          const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
          await env.DB.prepare("INSERT OR REPLACE INTO discord_links (discord_id, user_id, code_hash, code_expires, attempts, verified_at) VALUES (?, ?, ?, ?, 0, NULL)")
            .bind(user.id, target.id, await sha256(`${user.id}:${code}`), Date.now() + CODE_TTL).run();
          await h.insertMessage(env, target.id, {
            folder: "inbox", fromName: "Ranilix Discord", fromAddr: `team@${domain}`, to: `${target.username}@${domain}`,
            subject: `קוד האימות שלך לדיסקורד: ${code}`,
            body: `היי!\n\nמישהו בדיסקורד (${user.username || "משתמש"}) ביקש לחבר את הכתובת הזאת לשרת של Ranilix.\n\nהקוד שלך: ${code}\n\nבדיסקורד כתבו: /verify code ואז את הקוד. הקוד בתוקף ל-10 דקות.\n\nאם זה לא אתם, פשוט התעלמו מההודעה. בלי הקוד אף אחד לא יכול להתחבר.\n\nצוות Ranilix`,
            date: Date.now(),
          });
          await h.notifyUser(env, target.id);
        }
        // Same answer either way, so nobody can test which addresses exist.
        return reply(h.json, `📬 אם הכתובת \`${local}@${domain}\` קיימת, שלחנו אליה קוד. פתחו את התיבה ב-${SITE}inbox ואז כתבו כאן \`/verify code\`.`);
      }
      if (sub?.name === "code") {
        const row = await env.DB.prepare("SELECT * FROM discord_links WHERE discord_id = ?").bind(user.id).first();
        if (!row || !row.code_hash) return reply(h.json, "קודם כתבו `/verify start` עם הכתובת שלכם.");
        if (row.code_expires < Date.now() || row.attempts >= 5) return reply(h.json, "⌛ הקוד פג תוקף. בקשו קוד חדש עם `/verify start`.");
        const code = String(opt(sub.options, "code") || "").trim();
        if ((await sha256(`${user.id}:${code}`)) !== row.code_hash) {
          await env.DB.prepare("UPDATE discord_links SET attempts = attempts + 1 WHERE discord_id = ?").bind(user.id).run();
          if (row.attempts >= 2) h.log?.("security", "🔢 קוד אימות שגוי בדיסקורד", { "משתמש": `<@${user.id}>`, "ניסיון": row.attempts + 1 });
          return reply(h.json, `❌ הקוד לא נכון. נשארו ${Math.max(0, 4 - row.attempts)} ניסיונות.`);
        }
        await env.DB.prepare("UPDATE discord_links SET code_hash = NULL, verified_at = ? WHERE discord_id = ?").bind(Date.now(), user.id).run();
        const s = await discordSettings(env);
        let roleNote = "";
        if (s.role && i.guild_id && i.guild_id === s.guild) {
          try { await rest(env, "PUT", `/guilds/${i.guild_id}/members/${user.id}/roles/${s.role}`); roleNote = " קיבלתם את התפקיד 📧 משתמש Ranilix!"; }
          catch { roleNote = " (לא הצלחנו לתת את התפקיד. בקשו מהצוות.)"; }
        }
        const u = await env.DB.prepare("SELECT username FROM users WHERE id = ?").bind(row.user_id).first();
        h.log?.("verify", "📧 אימות כתובת Ranilix", { "משתמש": `<@${user.id}>`, "כתובת": `${u?.username || "?"}@${domain}` });
        return reply(h.json, `🎉 אומת!${roleNote}`);
      }
    }

    if (name === "stats") {
      if (!isAdminMember(i)) return reply(h.json, "רק למנהלים.");
      const day = Date.now() - 24 * 3600 * 1000;
      const [users, newDay, msgs, open, linked] = await Promise.all([
        env.DB.prepare("SELECT COUNT(*) AS n FROM users").first(),
        env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE created_at > ?").bind(day).first(),
        env.DB.prepare("SELECT COUNT(*) AS n FROM messages WHERE date > ?").bind(day).first(),
        env.DB.prepare("SELECT COUNT(*) AS n FROM reports WHERE status = 'open'").first(),
        env.DB.prepare("SELECT COUNT(*) AS n FROM discord_links WHERE verified_at IS NOT NULL").first(),
      ]);
      return reply(h.json, null, { embeds: [embed({
        title: "📊 נתוני Ranilix",
        fields: [
          { name: "משתמשים", value: String(users.n), inline: true },
          { name: "חדשים ב-24 שעות", value: String(newDay.n), inline: true },
          { name: "מיילים ב-24 שעות", value: String(msgs.n), inline: true },
          { name: "דיווחים פתוחים", value: String(open.n), inline: true },
          { name: "חשבונות דיסקורד מאומתים", value: String(linked.n), inline: true },
        ],
      })] });
    }

    if (name === "block-links") {
      if (!isAdminMember(i)) return reply(h.json, "רק למנהלים.");
      if (!env.DISCORD_BOT_TOKEN) return reply(h.json, "❌ חסר טוקן של הבוט בשרת.");
      const want = { links: opt(options, "links") !== false, invites: opt(options, "invites") !== false };
      const finish = setupAutoMod(env, i, want).then((text) => followUp(env, i, text)).catch((e) => {
        console.error("automod", e.message);
        return followUp(env, i, "😕 לא הצלחתי להגדיר את החסימה. ודאו שלבוט יש הרשאת מנהל ונסו שוב.");
      });
      h.log?.("admin", "🔗 חסימת קישורים עודכנה", { "מנהל": `<@${user.id}>`, "קישורים": want.links ? "חסום" : "מותר", "הזמנות": want.invites ? "חסום" : "מותר" });
      if (h.ctx?.waitUntil) h.ctx.waitUntil(finish); else await finish;
      return h.json({ type: 5, data: { flags: EPHEMERAL } });
    }

    if (name === "verify-panel") {
      if (!isAdminMember(i)) return reply(h.json, "רק למנהלים.");
      if (!env.DISCORD_BOT_TOKEN) return reply(h.json, "❌ חסר טוקן של הבוט בשרת.");
      const lock = opt(options, "lock") === true;
      const roles = await rest(env, "GET", `/guilds/${i.guild_id}/roles`);
      const everyone = roles.find((r) => r.id === i.guild_id);
      let member = roles.find((r) => r.name === MEMBER_ROLE);
      if (!member) {
        member = await rest(env, "POST", `/guilds/${i.guild_id}/roles`, { name: MEMBER_ROLE, color: 0x22c55e, permissions: everyone.permissions, hoist: false });
      }
      await saveSetting(env, "member_role", member.id);
      await rest(env, "POST", `/channels/${i.channel_id}/messages`, {
        embeds: [embed({
          title: "✅ אימות",
          description: "ברוכים הבאים לשרת של **Ranilix**!\n\nלחצו על הכפתור למטה כדי לאשר שקראתם את החוקים ולקבל גישה לכל הערוצים.",
          footer: { text: "Ranilix Email Free" },
        })],
        components: [{ type: 1, components: [{ type: 2, style: 3, custom_id: "ranilix_verify", label: "אני מאשר/ת את החוקים", emoji: { name: "✅" } }] }],
      });
      let lockNote = "";
      if (lock) {
        // Everyone loses "View channels" by default; every existing role (and the new one) gets it, so only
        // people with a role see the server. Channels that explicitly allow @everyone (welcome, rules…) stay visible.
        const VIEW = 1n << 10n;
        const base = BigInt(everyone.permissions) | VIEW;
        for (const r of roles) {
          if (r.id === everyone.id || r.managed) continue;
          const next = BigInt(r.permissions) | base;
          if (next !== BigInt(r.permissions)) await rest(env, "PATCH", `/guilds/${i.guild_id}/roles/${r.id}`, { permissions: String(next) });
        }
        await rest(env, "PATCH", `/guilds/${i.guild_id}/roles/${member.id}`, { permissions: String(BigInt(member.permissions) | base) });
        await rest(env, "PATCH", `/guilds/${i.guild_id}/roles/${everyone.id}`, { permissions: String(BigInt(everyone.permissions) & ~VIEW) });
        lockNote = "\n🔒 מעכשיו מי שלא לחץ על הכפתור רואה רק את ערוצי המידע (ברוכים הבאים, חוקים…). חברים שכבר בשרת בלי תפקיד יצטרכו ללחוץ גם הם.";
      }
      return reply(h.json, `✅ הפאנל נשלח. מי שלוחץ מקבל את התפקיד <@&${member.id}>.${lockNote}`);
    }

    if (name === "setup") {
      if (!isAdminMember(i)) return reply(h.json, "רק למנהלים.");
      if (!env.DISCORD_BOT_TOKEN) return reply(h.json, "❌ חסר טוקן של הבוט בשרת.");
      // Creating ~10 channels can take longer than Discord's 3 seconds: answer "thinking…" now, finish in the background.
      const finish = runSetup(env, i).then((text) => followUp(env, i, text)).catch((e) => {
        console.error("setup", e.message);
        return followUp(env, i, "😕 ההגדרה נכשלה. ודאו שלבוט יש הרשאת מנהל (Administrator) ונסו שוב.");
      });
      if (h.ctx?.waitUntil) h.ctx.waitUntil(finish); else await finish;
      return h.json({ type: 5, data: { flags: EPHEMERAL } });
    }
  } catch (e) {
    if (e?.code === "rate_limited") return reply(h.json, "⏳ יותר מדי ניסיונות. נסו שוב בעוד שעה.");
    console.error("discord command", name, e?.message);
    return reply(h.json, "😕 משהו השתבש. נסו שוב עוד מעט.");
  }
  return reply(h.json, "🤷 פקודה לא מוכרת.");
}

const MEMBER_ROLE = "✅ מאומת";

/* ---------- AutoMod: block links and invites (Discord enforces it, even while the bot is offline) ---------- */

const AUTOMOD = {
  invites: {
    name: "Ranilix · חסימת הזמנות",
    patterns: [
      "(?i)discord(app)?\\s*\\.\\s*(gg|io|me|li|com\\s*/\\s*invite)\\s*/\\s*\\S+",
      "(?i)\\b(dsc\\.gg|invite\\.gg|discord\\.link|dis\\.gd)\\s*/\\s*\\S+",
    ],
    message: "🚫 אסור לפרסם הזמנות לשרתי דיסקורד אחרים.",
  },
  links: {
    name: "Ranilix · חסימת קישורים",
    patterns: [
      "(?i)\\bhttps?://\\S+",
      "(?i)\\bwww\\.\\S+\\.\\S+",
      "(?i)\\b[a-z0-9-]{2,}\\.(com|net|org|io|co|me|xyz|gg|ly|info|biz|ru|tk|link|click|top|site|online|shop|app|dev|co\\.il)(/\\S*)?\\b",
    ],
    message: "🔗 אסור לשלוח קישורים בשרת. צריך לשתף משהו? פנו לצוות.",
  },
};
// Our own site and server stay allowed.
const AUTOMOD_ALLOW = ["*rani898.github.io*", "*ranilix.com*", "*discord.gg/EfgYMfQBp*", "*discord.com/invite/EfgYMfQBp*"];

async function setupAutoMod(env, i, want) {
  const g = i.guild_id;
  const [rules, roles, s] = await Promise.all([
    rest(env, "GET", `/guilds/${g}/auto-moderation/rules`),
    rest(env, "GET", `/guilds/${g}/roles`),
    discordSettings(env),
  ]);
  // Staff can still post links (admins are always exempt in Discord).
  const exempt = roles.filter((r) => /צוות|מנהל|תמיכה|staff|mod|admin/i.test(r.name) && !r.managed).map((r) => r.id).slice(0, 20);
  const alert = s.log_security || s.logs;
  const out = [];
  for (const [kind, def] of Object.entries(AUTOMOD)) {
    const existing = rules.find((r) => r.name === def.name);
    if (!want[kind]) {
      if (existing) { await rest(env, "DELETE", `/guilds/${g}/auto-moderation/rules/${existing.id}`); out.push(`➖ ${def.name}: כבוי`); }
      else out.push(`➖ ${def.name}: כבוי`);
      continue;
    }
    const body = {
      name: def.name,
      event_type: 1,          // when a message is sent
      trigger_type: 1,        // keyword / regex
      trigger_metadata: { regex_patterns: def.patterns, allow_list: AUTOMOD_ALLOW },
      actions: [
        { type: 1, metadata: { custom_message: def.message } },          // block the message
        ...(alert ? [{ type: 2, metadata: { channel_id: alert } }] : []), // and report it in the security log
      ],
      enabled: true,
      exempt_roles: exempt,
    };
    if (existing) await rest(env, "PATCH", `/guilds/${g}/auto-moderation/rules/${existing.id}`, body);
    else await rest(env, "POST", `/guilds/${g}/auto-moderation/rules`, body);
    out.push(`✅ ${def.name}: פועל`);
  }
  return [
    "🛡️ החסימה הוגדרה (Discord AutoMod):",
    ...out,
    "",
    `מותר: האתר של Ranilix וההזמנה לשרת הזה. מנהלים${exempt.length ? " ותפקידי צוות" : ""} פטורים.`,
    alert ? `כל הודעה שנחסמת מדווחת ב-<#${alert}>.` : "טיפ: הריצו /setup כדי שהחסימות ידווחו בערוץ האבטחה.",
    "לכיבוי: `/block-links links:False invites:False`",
  ].join("\n");
}

/** Edits the "thinking…" reply of a deferred command. */
async function followUp(env, i, content) {
  await fetch(`${API}/webhooks/${env.DISCORD_APP_ID}/${i.token}/messages/@original`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "User-Agent": `DiscordBot (${SITE}, 1.0)` },
    body: JSON.stringify({ content: content.slice(0, 1900), allowed_mentions: { parse: [] } }),
  });
}

/** Finds the updates channel and verified role, and creates the logs category with one channel per log kind. */
async function runSetup(env, i) {
  const g = i.guild_id;
  let [channels, roles] = await Promise.all([rest(env, "GET", `/guilds/${g}/channels`), rest(env, "GET", `/guilds/${g}/roles`)]);
  const text = channels.filter((c) => c.type === 0 || c.type === 5);
  const updates = text.find((c) => c.name.includes("עדכונים")) || text.find((c) => /update|announce/i.test(c.name));
  const general = text.find((c) => c.name.includes("לוגים") && !Object.values(LOG_CHANNELS).some((d) => d.name === c.name)) || text.find((c) => /log/i.test(c.name));
  const role = roles.find((r) => r.name.includes("משתמש Ranilix")) || roles.find((r) => /verified/i.test(r.name));
  const staffRoles = roles.filter((r) => /צוות|מנהל|staff|mod/i.test(r.name) && !r.managed);

  // Hidden category: nobody sees it except admins and staff roles.
  const VIEW = String(1 << 10);
  const overwrites = [{ id: g, type: 0, deny: VIEW }, ...staffRoles.map((r) => ({ id: r.id, type: 0, allow: VIEW }))];
  let category = channels.find((c) => c.type === 4 && c.name === LOG_CATEGORY);
  if (!category) category = await rest(env, "POST", `/guilds/${g}/channels`, { name: LOG_CATEGORY, type: 4, permission_overwrites: overwrites });

  const made = [];
  for (const [kind, def] of Object.entries(LOG_CHANNELS)) {
    let ch = channels.find((c) => c.type === 0 && c.name === def.name);
    if (!ch) {
      ch = await rest(env, "POST", `/guilds/${g}/channels`, { name: def.name, type: 0, parent_id: category.id, topic: def.topic, permission_overwrites: overwrites });
      made.push(def.name);
    }
    await saveSetting(env, `log_${kind}`, ch.id);
  }
  await saveSetting(env, "guild", g);
  await saveSetting(env, "updates", updates?.id || "");
  await saveSetting(env, "logs", general?.id || "");
  await saveSetting(env, "role", role?.id || "");

  const line = (label, x, kind) => `${x ? "✅" : "⚠️"} ${label}: ${x ? (kind === "role" ? `<@&${x.id}>` : `<#${x.id}>`) : "לא נמצא"}`;
  return [
    "🔗 הבוט חובר לשרת!",
    line("עדכונים מהאתר", updates),
    line("תפקיד למאומתים", role, "role"),
    `✅ קטגוריית ${LOG_CATEGORY}: ${Object.keys(LOG_CHANNELS).length} ערוצי לוגים${made.length ? ` (נוצרו עכשיו ${made.length})` : ""}`,
    "",
    "אם משהו לא נמצא, צרו אותו (או שנו את השם) והריצו שוב `/setup`.",
  ].join("\n");
}

async function verifyButton(env, i, h) {
  const user = i.member?.user || {};
  try {
    const roleId = (await discordSettings(env)).member_role;
    if (!roleId) return reply(h.json, "האימות עוד לא הוגדר. בקשו מהצוות להריץ /verify-panel.");
    if ((i.member?.roles || []).includes(roleId)) return reply(h.json, "✅ כבר אימתתם. ברוכים הבאים!");
    await rest(env, "PUT", `/guilds/${i.guild_id}/members/${user.id}/roles/${roleId}`);
    h.log?.("verify", "✅ אימות בכפתור", { "משתמש": `<@${user.id}>` });
    return reply(h.json, "🎉 אומתתם! עכשיו אתם רואים את כל הערוצים. תהנו!\nיש לכם כתובת ב-Ranilix? כתבו `/verify start` כדי לקבל גם את התפקיד 📧 משתמש Ranilix.");
  } catch (e) {
    console.error("verify button", e.message);
    return reply(h.json, "😕 לא הצלחנו לתת את התפקיד. ודאו שהתפקיד של הבוט נמצא מעל ✅ מאומת, או פנו לצוות.");
  }
}

/* ---------- Admin panel ---------- */

export async function discordAdminStatus(env) {
  const s = await discordSettings(env);
  return {
    appId: env.DISCORD_APP_ID || "",
    hasPublicKey: !!env.DISCORD_PUBLIC_KEY,
    hasToken: !!env.DISCORD_BOT_TOKEN,
    linked: !!s.guild,
    channels: { updates: !!s.updates, logs: Object.keys(LOG_CHANNELS).some((k) => s[`log_${k}`]) || !!s.logs, role: !!s.role },
    logChannels: Object.keys(LOG_CHANNELS).filter((k) => s[`log_${k}`]).length,
    inviteUrl: env.DISCORD_APP_ID ? `https://discord.com/oauth2/authorize?client_id=${env.DISCORD_APP_ID}&scope=bot+applications.commands&permissions=8` : "",
  };
}

/** Registers the slash commands with Discord (run once, and again after changing COMMANDS). */
export async function discordRegister(env) {
  if (!env.DISCORD_APP_ID) throw new Error("no_app_id");
  const res = await rest(env, "PUT", `/applications/${env.DISCORD_APP_ID}/commands`, COMMANDS);
  return Array.isArray(res) ? res.length : 0;
}
