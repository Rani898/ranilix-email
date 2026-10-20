// Web Push for "new mail" notifications, sent even when the site is closed.
// We send an empty push (no payload, so nothing needs encrypting); the service worker
// shows "You have new mail". VAPID keys are created on first use and kept in the settings table.

const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const enc = new TextEncoder();

// Only real browser push services, so the server can't be used to call arbitrary URLs.
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/];
export function validPushEndpoint(endpoint) {
  try {
    const u = new URL(endpoint);
    return u.protocol === "https:" && PUSH_HOSTS.some((re) => re.test(u.hostname)) && endpoint.length < 1000;
  } catch { return false; }
}

async function vapidKeys(env) {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'vapid'").first();
  if (row) return JSON.parse(row.value);
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const keys = {
    publicKey: b64url(await crypto.subtle.exportKey("raw", pair.publicKey)),
    privateJwk: await crypto.subtle.exportKey("jwk", pair.privateKey),
  };
  // INSERT OR IGNORE + re-read: if two requests race, both end up with the same stored keys.
  await env.DB.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('vapid', ?)").bind(JSON.stringify(keys)).run();
  return JSON.parse((await env.DB.prepare("SELECT value FROM settings WHERE key = 'vapid'").first()).value);
}

export async function vapidPublicKey(env) {
  return (await vapidKeys(env)).publicKey;
}

async function vapidHeader(env, endpoint) {
  const keys = await vapidKeys(env);
  const key = await crypto.subtle.importKey("jwk", keys.privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const header = b64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = b64url(enc.encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: `mailto:team@${env.MAIL_DOMAIN}`,
  })));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${header}.${payload}`));
  return `vapid t=${header}.${payload}.${b64url(sig)}, k=${keys.publicKey}`;
}

/** Ping every device this user turned notifications on for. Dead subscriptions are removed. */
export async function notifyUser(env, userId) {
  const { results } = await env.DB.prepare("SELECT endpoint FROM push_subs WHERE user_id = ? LIMIT 10").bind(userId).all();
  await Promise.all(results.map(async ({ endpoint }) => {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: await vapidHeader(env, endpoint), TTL: "86400", Urgency: "high", "Content-Length": "0" },
      });
      if (res.status === 404 || res.status === 410) {
        await env.DB.prepare("DELETE FROM push_subs WHERE endpoint = ?").bind(endpoint).run();
      }
    } catch { /* a failed notification never blocks mail delivery */ }
  }));
}
