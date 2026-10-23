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
  if (i.type !== 2) return h.json({ type: 4, data: { content: "🤷", flags: EPHEMERAL } });

  const user = i.member?.user || i.user || {};
  const name = i.data?.name;
  const options = i.data?.options || [];
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
      await discordNotify(env, "logs", { title: "🚩 דיווח חדש מדיסקורד", description: message, fields: [{ name: "מאת", value: `<@${user.id}>`, inline: true }, { name: "סוג", value: category, inline: true }] });
      return reply(h.json, "✅ תודה! הדיווח הגיע לצוות.");
    }

    if (name === "verify") {
      const sub = options[0];
      if (sub?.name === "start") {
        await h.rateLimit(env, `dverify:${user.id}`, 5, 3600 * 1000);
        const local = String(opt(sub.options, "email") || "").toLowerCase().trim().replace(new RegExp(`@${domain.replace(/\./g, "\\.")}$`), "");
        const target = local && await env.DB.prepare("SELECT id, username FROM users WHERE username = ?").bind(local).first();
        if (target) {
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
        await discordNotify(env, "logs", { title: "✅ אימות חדש", description: `<@${user.id}> ← \`${u?.username || "?"}@${domain}\`` });
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

    if (name === "setup") {
      if (!isAdminMember(i)) return reply(h.json, "רק למנהלים.");
      if (!env.DISCORD_BOT_TOKEN) return reply(h.json, "❌ חסר טוקן של הבוט בשרת. הריצו את setup.bat והדביקו אותו בשלב של Discord.");
      const [channels, roles] = await Promise.all([rest(env, "GET", `/guilds/${i.guild_id}/channels`), rest(env, "GET", `/guilds/${i.guild_id}/roles`)]);
      const text = channels.filter((c) => c.type === 0 || c.type === 5);
      const updates = text.find((c) => c.name.includes("עדכונים")) || text.find((c) => /update|announce/i.test(c.name));
      const logs = text.find((c) => c.name.includes("לוגים")) || text.find((c) => /log/i.test(c.name));
      const role = roles.find((r) => r.name.includes("משתמש Ranilix")) || roles.find((r) => /verified/i.test(r.name));
      await saveSetting(env, "guild", i.guild_id);
      await saveSetting(env, "updates", updates?.id || "");
      await saveSetting(env, "logs", logs?.id || "");
      await saveSetting(env, "role", role?.id || "");
      const line = (label, x, kind) => `${x ? "✅" : "⚠️"} ${label}: ${x ? (kind === "role" ? `<@&${x.id}>` : `<#${x.id}>`) : "לא נמצא"}`;
      return reply(h.json, [
        "🔗 הבוט חובר לשרת!",
        line("עדכונים מהאתר", updates),
        line("לוגים לצוות", logs),
        line("תפקיד למאומתים", role, "role"),
        "",
        "אם משהו לא נמצא, צרו אותו (או שנו את השם) והריצו שוב `/setup`. את התפקיד של הבוט צריך לגרור מעל התפקיד 📧 משתמש Ranilix.",
      ].join("\n"));
    }
  } catch (e) {
    if (e?.code === "rate_limited") return reply(h.json, "⏳ יותר מדי ניסיונות. נסו שוב בעוד שעה.");
    console.error("discord command", name, e?.message);
    return reply(h.json, "😕 משהו השתבש. נסו שוב עוד מעט.");
  }
  return reply(h.json, "🤷 פקודה לא מוכרת.");
}

/* ---------- Admin panel ---------- */

export async function discordAdminStatus(env) {
  const s = await discordSettings(env);
  return {
    appId: env.DISCORD_APP_ID || "",
    hasPublicKey: !!env.DISCORD_PUBLIC_KEY,
    hasToken: !!env.DISCORD_BOT_TOKEN,
    linked: !!s.guild,
    channels: { updates: !!s.updates, logs: !!s.logs, role: !!s.role },
    inviteUrl: env.DISCORD_APP_ID ? `https://discord.com/oauth2/authorize?client_id=${env.DISCORD_APP_ID}&scope=bot+applications.commands&permissions=268454912` : "",
  };
}

/** Registers the slash commands with Discord (run once, and again after changing COMMANDS). */
export async function discordRegister(env) {
  if (!env.DISCORD_APP_ID) throw new Error("no_app_id");
  const res = await rest(env, "PUT", `/applications/${env.DISCORD_APP_ID}/commands`, COMMANDS);
  return Array.isArray(res) ? res.length : 0;
}
