// "Connect Google": lets a Ranilix user read their Gmail inbox inside Ranilix.
// Uses Google OAuth (scopes: openid, email, gmail.readonly). Needs GOOGLE_CLIENT_ID (var)
// and GOOGLE_CLIENT_SECRET (secret). Tokens are stored encrypted in D1.

const SCOPES = "openid email https://www.googleapis.com/auth/gmail.readonly";
const STATE_TTL = 10 * 60 * 1000;
const LIST_SIZE = 20; // keeps each request under the free plan's 50 outgoing calls
const enc = new TextEncoder();

export const googleConfigured = (env) => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
function redirectUri(req) {
  const u = new URL(req.url);
  const local = ["localhost", "127.0.0.1"].includes(u.hostname);
  return `${local ? u.protocol : "https:"}//${u.host}/api/google/callback`;
}

/* ---------- token encryption (AES-GCM, key derived from the client secret) ---------- */

async function cryptoKey(env) {
  const raw = await crypto.subtle.digest("SHA-256", enc.encode(`ranilix-google:${env.GOOGLE_CLIENT_SECRET}`));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function seal(env, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await cryptoKey(env), enc.encode(text));
  return `${b64(iv)}.${b64(data)}`;
}
async function open(env, sealed) {
  const [iv, data] = String(sealed || "").split(".");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await cryptoKey(env), unb64(data));
  return new TextDecoder().decode(plain);
}

/* ---------- Gmail message parsing ---------- */

function decodePart(data, charset = "utf-8") {
  const bin = atob(String(data || "").replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  try { return new TextDecoder(charset || "utf-8").decode(bytes); } catch { return new TextDecoder().decode(bytes); }
}
const header = (payload, name) => payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";
const charsetOf = (part) => /charset="?([^";\s]+)"?/i.exec(header(part, "Content-Type"))?.[1];

function parseAddress(value) {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(value || "");
  if (m) return { name: m[1].trim(), email: m[2].trim() };
  return { name: "", email: String(value || "").trim() };
}

function walk(part, out) {
  if (!part) return;
  const mime = (part.mimeType || "").toLowerCase();
  if (part.filename && part.body?.attachmentId) {
    out.attachments.push({ filename: part.filename, mime: part.mimeType, size: part.body.size || 0 });
  } else if (mime === "text/plain" && part.body?.data && !out.text) {
    out.text = decodePart(part.body.data, charsetOf(part));
  } else if (mime === "text/html" && part.body?.data && !out.html) {
    out.html = decodePart(part.body.data, charsetOf(part));
  }
  for (const p of part.parts || []) walk(p, out);
}

function summary(m) {
  const p = m.payload || {};
  return {
    id: m.id,
    from: parseAddress(header(p, "From")),
    to: header(p, "To"),
    subject: header(p, "Subject") || "(no subject)",
    snippet: (m.snippet || "").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"),
    date: Number(m.internalDate) || Date.parse(header(p, "Date")) || Date.now(),
    unread: (m.labelIds || []).includes("UNREAD"),
  };
}

/* ---------- routes ---------- */

/**
 * Handles /api/google/*. `user` is null for the OAuth callback (Google redirects the browser there
 * without our session token; the one-time `state` ties it to the user).
 */
export async function googleRoute(req, env, path, url, user, { HttpError, json, htmlToText, randomHex, log = () => {} }) {
  const fail = (status, message, code) => { throw new HttpError(status, message, code); };

  async function accessToken(userId) {
    const row = await env.DB.prepare("SELECT * FROM google_accounts WHERE user_id = ?").bind(userId).first();
    if (!row) fail(409, "Connect your Google account first.", "google_not_connected");
    if (row.access_enc && row.access_expires > Date.now() + 60_000) return open(env, row.access_enc);
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        refresh_token: await open(env, row.refresh_enc),
        grant_type: "refresh_token",
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.access_token) {
      // Revoked, or expired (in Google's "testing" mode refresh tokens last 7 days).
      await env.DB.prepare("DELETE FROM google_accounts WHERE user_id = ?").bind(userId).run();
      fail(409, "Google asked to sign in again. Please reconnect.", "google_reconnect");
    }
    await env.DB.prepare("UPDATE google_accounts SET access_enc = ?, access_expires = ? WHERE user_id = ?")
      .bind(await seal(env, data.access_token), Date.now() + (data.expires_in || 3600) * 1000, userId).run();
    return data.access_token;
  }

  async function gmail(userId, apiPath) {
    const token = await accessToken(userId);
    const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${apiPath}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401) {
      await env.DB.prepare("UPDATE google_accounts SET access_enc = NULL, access_expires = 0 WHERE user_id = ?").bind(userId).run();
      fail(409, "Google asked to sign in again. Please reconnect.", "google_reconnect");
    }
    if (!res.ok) fail(502, "Gmail didn't answer. Please try again.", "google_failed");
    return res.json();
  }

  // ---- OAuth callback (no Ranilix session) ----
  if (path === "/api/google/callback" && req.method === "GET") {
    const state = url.searchParams.get("state") || "";
    const row = state && await env.DB.prepare("SELECT * FROM oauth_states WHERE state = ?").bind(state).first();
    if (row) await env.DB.prepare("DELETE FROM oauth_states WHERE state = ?").bind(state).run();
    if (!row || row.created_at < Date.now() - STATE_TTL) return new Response("This link has expired. Please go back and try again.", { status: 400 });
    const back = (result) => new Response(null, { status: 302, headers: { Location: `${row.return_to}?gmail=${result}` } });

    const code = url.searchParams.get("code");
    if (!code) return back("cancelled");
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri(req),
        grant_type: "authorization_code",
      }),
    });
    const tok = await res.json().catch(() => ({}));
    if (!res.ok || !tok.access_token) return back("error");
    if (!String(tok.scope || "").includes("gmail.readonly")) return back("noscope");

    const info = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${tok.access_token}` } })
      .then((r) => r.json()).catch(() => ({}));
    const existing = await env.DB.prepare("SELECT refresh_enc FROM google_accounts WHERE user_id = ?").bind(row.user_id).first();
    const refreshEnc = tok.refresh_token ? await seal(env, tok.refresh_token) : existing?.refresh_enc;
    if (!refreshEnc) return back("error");
    await env.DB.prepare(
      "INSERT OR REPLACE INTO google_accounts (user_id, google_email, refresh_enc, access_enc, access_expires, connected_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(row.user_id, info.email || "", refreshEnc, await seal(env, tok.access_token), Date.now() + (tok.expires_in || 3600) * 1000, Date.now()).run();
    const owner = await env.DB.prepare("SELECT username FROM users WHERE id = ?").bind(row.user_id).first();
    log("accounts", "🔗 חיבור Gmail", { "כתובת": owner ? `${owner.username}@${env.MAIL_DOMAIN}` : "?", "חשבון Google": info.email || "" });
    return back("connected");
  }

  if (!user) fail(401, "Please log in.", "session");

  if (path === "/api/google/status" && req.method === "GET") {
    const row = await env.DB.prepare("SELECT google_email FROM google_accounts WHERE user_id = ?").bind(user.id).first();
    return json({ configured: googleConfigured(env), connected: !!row, email: row?.google_email || "" });
  }

  if (path === "/api/google/start" && req.method === "POST") {
    if (!googleConfigured(env)) fail(503, "Google sign-in isn't set up on this server yet.", "google_not_configured");
    const { returnTo = "" } = await req.json().catch(() => ({}));
    let target;
    try { target = new URL(returnTo); } catch { fail(400, "Invalid request."); }
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim());
    if (!allowed.includes(target.origin)) fail(400, "Invalid request.");
    const state = randomHex(24);
    await env.DB.prepare("DELETE FROM oauth_states WHERE created_at < ?").bind(Date.now() - STATE_TTL).run();
    await env.DB.prepare("INSERT INTO oauth_states (state, user_id, return_to, created_at) VALUES (?, ?, ?, ?)")
      .bind(state, user.id, `${target.origin}${target.pathname}`, Date.now()).run();
    const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    auth.search = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri(req),
      response_type: "code",
      scope: SCOPES,
      access_type: "offline",
      prompt: "consent select_account",
      include_granted_scopes: "true",
      state,
    });
    return json({ url: auth.toString() });
  }

  if (path === "/api/google/disconnect" && req.method === "POST") {
    const row = await env.DB.prepare("SELECT refresh_enc FROM google_accounts WHERE user_id = ?").bind(user.id).first();
    if (row) {
      try {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(await open(env, row.refresh_enc))}`, { method: "POST" });
      } catch { /* still forget it locally */ }
      await env.DB.prepare("DELETE FROM google_accounts WHERE user_id = ?").bind(user.id).run();
      log("accounts", "✂️ ניתוק Gmail", { "כתובת": user.email });
    }
    return json({ ok: true });
  }

  if (path === "/api/google/messages" && req.method === "GET") {
    const params = new URLSearchParams({ maxResults: String(LIST_SIZE) });
    const q = (url.searchParams.get("q") || "").slice(0, 200);
    params.set("q", q ? `${q} -in:chats` : "in:inbox");
    const page = url.searchParams.get("pageToken");
    if (page) params.set("pageToken", page);
    const list = await gmail(user.id, `messages?${params}`);
    const ids = (list.messages || []).map((m) => m.id);
    const meta = "format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date";
    const items = await Promise.all(ids.map((id) => gmail(user.id, `messages/${id}?${meta}`).catch(() => null)));
    return json({ messages: items.filter(Boolean).map(summary), nextPageToken: list.nextPageToken || null });
  }

  const one = path.match(/^\/api\/google\/messages\/([A-Za-z0-9_-]+)$/);
  if (one && req.method === "GET") {
    const m = await gmail(user.id, `messages/${one[1]}?format=full`);
    const parts = { text: "", html: "", attachments: [] };
    walk(m.payload, parts);
    const body = parts.text.trim() || (parts.html ? htmlToText(parts.html) : m.snippet || "");
    return json({ ...summary(m), body: body.slice(0, 100_000), attachments: parts.attachments });
  }

  fail(404, "Not found.", "not_found");
}
