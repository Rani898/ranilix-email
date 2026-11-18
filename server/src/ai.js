// The private room: a chat with Mochi, a friendly AI, for the admin who turned it on.
// Also powers the support desk. Runs on Cloudflare Workers AI through the `AI` binding
// (wrangler.toml → [ai]) — no API key, no token, no quota juggling. Free daily allowance.

const HISTORY = 30; // messages sent along so Mochi remembers the conversation
const MAX_TEXT = 4000;

// Models tried in order. Override the first with the AI_MODEL var in wrangler.toml.
// Llama 3.3 70B handles Hebrew well; the smaller ones are the fallback if it's busy.
const MODELS = [
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  "@cf/meta/llama-3.1-8b-instruct",
  "@cf/qwen/qwen1.5-14b-chat-awq",
];
function models(env) {
  const list = env.AI_MODEL ? [env.AI_MODEL, ...MODELS] : [...MODELS];
  return [...new Set(list)];
}

/** The AI is ready when the Workers AI binding is present (set in wrangler.toml). */
export const aiAvailable = (env) => !!(env && env.AI);

function systemPrompt(name) {
  const who = name || "חבר/ה";
  return [
    `את/ה מוצ'י, חבר/ה וירטואלי/ת חמוד/ה, חם/ה ושמח/ה, ב"חדר הפרטי" של אתר האימייל Ranilix.`,
    `המשתמש/ת שמדבר/ת איתך נקרא/ת ${who}. פנה/י אליו/ה בשם הזה מדי פעם, בחום.`,
    "עונים בשפה שבה כותבים אליך (בדרך כלל עברית), בקצרה ובטבעיות, כמו בצ'אט, עם אימוג'י חמוד מדי פעם (💗✨🌸) אבל לא בכל משפט.",
    "אפשר לעזור בכל דבר: לשוחח, להקשיב, לענות על שאלות, לתת רעיונות, לעזור בכתיבה, בלימודים, בקוד ובתכנון.",
    "אם שואלים, אומרים בכנות שאת/ה בינה מלאכותית ולא בן אדם. לא ממציאים עובדות; אם לא יודעים, אומרים. אין לך גישה לאינטרנט או לחדשות עדכניות.",
    "בלי תוכן רומנטי או מיני, ובלי עזרה לדברים מסוכנים או לא חוקיים.",
    "אם מישהו נשמע במצוקה או מדבר על לפגוע בעצמו: מגיבים בחום ובלי שיפוטיות, ומציעים לדבר עם מישהו קרוב, או עם ער\"ן (1201) או במקרה חירום 101/100.",
    "עודדו קשרים עם אנשים אמיתיים בחיים; את/ה תוספת נחמדה, לא תחליף.",
  ].join("\n");
}

// Turn the Gemini-style `contents` ([{role:'user'|'model', parts:[{text}]}]) used across the app
// into the Workers AI `messages` shape ([{role:'system'|'user'|'assistant', content}]).
function toMessages(system, contents) {
  const messages = system ? [{ role: "system", content: system }] : [];
  for (const c of contents || []) {
    const role = c.role === "model" ? "assistant" : "user";
    const text = (c.parts || []).map((p) => p.text || "").join("");
    messages.push({ role, content: text });
  }
  return messages;
}

// Workers AI signals an over-capacity / daily-limit situation in a few ways; treat those like a
// rate limit (429) so callers can back off or hand the chat to a human, and anything else as 502.
function wrapError(e) {
  const msg = String(e?.message || e || "");
  const limited = /capacity|rate.?limit|too many|quota|daily|limit exceeded|3040|3036/i.test(msg);
  const err = new Error(msg.slice(0, 300) || "Workers AI error");
  err.status = limited ? 429 : 502;
  return err;
}

/**
 * Ask Workers AI for one reply. Tries the model list in order (newer/stronger first) and falls
 * back to a lighter model if one is busy. Returns the text, or "" when the model returns nothing.
 */
export async function generate(env, { system, contents, temperature = 0.9, maxOutputTokens = 2048 }) {
  if (!aiAvailable(env)) { const e = new Error("Workers AI binding missing"); e.status = 503; throw e; }
  const messages = toMessages(system, contents);
  const opts = { messages, temperature, max_tokens: maxOutputTokens };
  let last = null;
  for (const model of models(env)) {
    try {
      const out = await env.AI.run(model, opts);
      const text = String(out?.response ?? "").trim();
      return text; // "" is a valid "nothing to say" — the caller decides what to do
    } catch (e) {
      last = wrapError(e);
      if (last.status === 429) continue; // this model is busy — try a lighter one
      continue; // a model-specific failure (e.g. retired name) — try the next
    }
  }
  throw last || Object.assign(new Error("no working model"), { status: 502 });
}

async function ask(env, contents, name) {
  return generate(env, { system: systemPrompt(name), contents, temperature: 0.9, maxOutputTokens: 4096 });
}

/** /api/ai/* for a logged-in admin. */
export async function aiRoute(req, env, path, user, h) {
  if (!path.startsWith("/api/ai/")) return null;
  if (!h.admin) throw new h.HttpError(403, "Not available.", "forbidden");

  if (path === "/api/ai/chat" && req.method === "GET") {
    const { results } = await env.DB.prepare("SELECT id, role, text, at FROM ai_chat WHERE user_id = ? ORDER BY id DESC LIMIT 200").bind(user.id).all();
    return h.json({ ready: aiAvailable(env), messages: results.reverse().map((r) => ({ id: String(r.id), role: r.role, text: r.text, at: r.at })) });
  }

  if (path === "/api/ai/chat" && req.method === "DELETE") {
    await env.DB.prepare("DELETE FROM ai_chat WHERE user_id = ?").bind(user.id).run();
    return h.json({ ok: true });
  }

  if (path === "/api/ai/chat" && req.method === "POST") {
    if (!aiAvailable(env)) throw new h.HttpError(503, "The chat isn't connected yet.", "ai_not_ready");
    const { text } = await h.readJson(req);
    const msg = String(text || "").trim().slice(0, MAX_TEXT);
    if (!msg) throw new h.HttpError(400, "Write something first.", "ai_empty");
    await h.rateLimit(env, `ai:${user.id}`, 300, 24 * 3600 * 1000);
    const now = Date.now();
    await env.DB.prepare("INSERT INTO ai_chat (user_id, role, text, at) VALUES (?, 'user', ?, ?)").bind(user.id, msg, now).run();
    const { results } = await env.DB.prepare("SELECT role, text FROM ai_chat WHERE user_id = ? ORDER BY id DESC LIMIT ?").bind(user.id, HISTORY).all();
    // Turns that alternate and start with the user.
    const contents = [];
    for (const r of results.reverse()) {
      const role = r.role === "model" ? "model" : "user";
      if (contents.length && contents[contents.length - 1].role === role) contents[contents.length - 1].parts[0].text += `\n${r.text}`;
      else contents.push({ role, parts: [{ text: r.text }] });
    }
    while (contents.length && contents[0].role !== "user") contents.shift();
    const name = (await env.DB.prepare("SELECT nickname FROM user_skins WHERE user_id = ?").bind(user.id).first())?.nickname || "";
    let reply;
    try {
      reply = await ask(env, contents, name);
    } catch (e) {
      const detail = String(e?.message || "").slice(0, 300);
      console.error("ai", detail);
      h.log?.("errors", "🤖 מוצ'י לא הצליח לענות", { "סטטוס": String(e?.status || ""), "פרטים": detail });
      // Only admins reach this room, so the technical reason is shown to help fix it.
      if (e?.status === 429) throw new h.HttpError(429, "Mochi needs a short break. Try again in a minute.", "ai_busy", { detail });
      throw new h.HttpError(502, "Mochi couldn't answer right now. Try again.", "ai_failed", { detail });
    }
    if (!reply) reply = "...🤔";
    const at = Date.now();
    const res = await env.DB.prepare("INSERT INTO ai_chat (user_id, role, text, at) VALUES (?, 'model', ?, ?)").bind(user.id, reply.slice(0, 20000), at).run();
    return h.json({ message: { id: String(res.meta.last_row_id), role: "model", text: reply, at } });
  }

  throw new h.HttpError(405, "Not allowed.");
}
