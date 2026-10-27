// The private room: a chat with Mochi, a friendly AI (Google Gemini), for the admin who turned it on.
// Needs the GEMINI_API_KEY secret (free key from Google AI Studio).

const API = "https://generativelanguage.googleapis.com/v1beta";
const HISTORY = 30; // messages sent along so Mochi remembers the conversation
const MAX_TEXT = 4000;

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

// Google changes model names now and then: use GEMINI_MODEL if set, otherwise pick the newest
// stable "flash" model the key can use (and remember it for a while).
let picked = null;
async function modelFor(env, avoid = []) {
  if (env.GEMINI_MODEL && !avoid.includes(env.GEMINI_MODEL)) return env.GEMINI_MODEL;
  if (picked && picked.until > Date.now() && !avoid.includes(picked.name)) return picked.name;
  const res = await fetch(`${API}/models?pageSize=200`, { headers: { "x-goog-api-key": env.GEMINI_API_KEY } });
  if (!res.ok) throw new Error(`models ${res.status}`);
  const { models = [] } = await res.json();
  const ver = (n) => Number((/gemini-(\d+(?:\.\d+)?)/.exec(n) || [])[1] || 0);
  const ok = models
    .map((m) => ({ name: m.name.replace(/^models\//, ""), methods: m.supportedGenerationMethods || [] }))
    .filter((m) => m.methods.includes("generateContent") && /^gemini-[\d.]+-flash/.test(m.name)
      && !/(image|tts|live|audio|embedding|thinking|exp|computer|robotics|native)/.test(m.name) && !avoid.includes(m.name));
  // Stable before preview, newer first, the full flash before lite.
  ok.sort((a, b) => (/preview/.test(a.name) - /preview/.test(b.name)) || (ver(b.name) - ver(a.name)) || (/lite/.test(a.name) - /lite/.test(b.name)));
  if (!ok.length) throw new Error("no model");
  picked = { name: ok[0].name, until: Date.now() + 6 * 3600 * 1000 };
  return picked.name;
}

async function ask(env, contents, name) {
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: systemPrompt(name) }] },
    contents,
    generationConfig: { temperature: 0.9, maxOutputTokens: 1024 },
  });
  const tried = [];
  for (let i = 0; i < 3; i++) {
    const model = await modelFor(env, tried);
    tried.push(model);
    const res = await fetch(`${API}/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY }, body,
    });
    if (res.status === 404) { picked = null; continue; } // that model is gone: pick another
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data?.error?.message || `gemini ${res.status}`);
      err.status = res.status;
      throw err;
    }
    const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("").trim();
    if (text) return text;
    if (data.candidates?.[0]?.finishReason === "SAFETY" || data.promptFeedback?.blockReason) return null;
    return "";
  }
  throw new Error("no working model");
}

/** /api/ai/* for a logged-in admin. */
export async function aiRoute(req, env, path, user, h) {
  if (!path.startsWith("/api/ai/")) return null;
  if (!h.admin) throw new h.HttpError(403, "Not available.", "forbidden");

  if (path === "/api/ai/chat" && req.method === "GET") {
    const { results } = await env.DB.prepare("SELECT id, role, text, at FROM ai_chat WHERE user_id = ? ORDER BY id DESC LIMIT 200").bind(user.id).all();
    return h.json({ ready: !!env.GEMINI_API_KEY, messages: results.reverse().map((r) => ({ id: String(r.id), role: r.role, text: r.text, at: r.at })) });
  }

  if (path === "/api/ai/chat" && req.method === "DELETE") {
    await env.DB.prepare("DELETE FROM ai_chat WHERE user_id = ?").bind(user.id).run();
    return h.json({ ok: true });
  }

  if (path === "/api/ai/chat" && req.method === "POST") {
    if (!env.GEMINI_API_KEY) throw new h.HttpError(503, "The chat isn't connected yet.", "ai_not_ready");
    const { text } = await h.readJson(req);
    const msg = String(text || "").trim().slice(0, MAX_TEXT);
    if (!msg) throw new h.HttpError(400, "Write something first.", "ai_empty");
    await h.rateLimit(env, `ai:${user.id}`, 300, 24 * 3600 * 1000);
    const now = Date.now();
    await env.DB.prepare("INSERT INTO ai_chat (user_id, role, text, at) VALUES (?, 'user', ?, ?)").bind(user.id, msg, now).run();
    const { results } = await env.DB.prepare("SELECT role, text FROM ai_chat WHERE user_id = ? ORDER BY id DESC LIMIT ?").bind(user.id, HISTORY).all();
    // Gemini wants turns that alternate and start with the user.
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
      console.error("ai", e?.message);
      if (e?.status === 429) throw new h.HttpError(429, "Mochi needs a short break. Try again in a minute.", "ai_busy");
      if (e?.status === 400 || e?.status === 403) throw new h.HttpError(502, "The Gemini key isn't working.", "ai_key");
      throw new h.HttpError(502, "Mochi couldn't answer right now. Try again.", "ai_failed");
    }
    if (reply === null) reply = "💗 על זה אני לא יכול/ה לענות. בוא/י נדבר על משהו אחר?";
    if (!reply) reply = "...🤔";
    const at = Date.now();
    const res = await env.DB.prepare("INSERT INTO ai_chat (user_id, role, text, at) VALUES (?, 'model', ?, ?)").bind(user.id, reply.slice(0, 20000), at).run();
    return h.json({ message: { id: String(res.meta.last_row_id), role: "model", text: reply, at } });
  }

  throw new h.HttpError(405, "Not allowed.");
}
