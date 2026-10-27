// A personal look for the site ("skin"): only the person who chose it sees it.
// Admins set it from the admin panel: a colour set, a nickname for the greeting, and a background picture.

export const SKINS = ["default", "noya"];
const MAX_BG = 8 * 1024 * 1024;
const IMG = /^image\/(png|jpe?g|webp|gif|avif)$/;

export async function getSkin(env, userId) {
  const row = await env.DB.prepare("SELECT skin, nickname, bg_token, sticker_token FROM user_skins WHERE user_id = ?").bind(userId).first();
  if (!row) return { skin: "default", nickname: "", background: null, sticker: null };
  // Paths on the API; the site puts the API address in front.
  return {
    skin: row.skin, nickname: row.nickname || "",
    background: row.bg_token ? `/api/skin/bg/${row.bg_token}` : null,
    sticker: row.sticker_token ? `/api/skin/bg/${row.sticker_token}` : null,
  };
}

const COLS = ["skin", "nickname", "bg_key", "bg_token", "sticker_key", "sticker_token"];
async function save(env, userId, fields) {
  const cur = await env.DB.prepare("SELECT * FROM user_skins WHERE user_id = ?").bind(userId).first();
  const next = { skin: "default", ...Object.fromEntries(COLS.map((c) => [c, cur?.[c] ?? null])), ...fields };
  if (!next.skin) next.skin = "default";
  await env.DB.prepare(`INSERT OR REPLACE INTO user_skins (user_id, ${COLS.join(", ")}, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(userId, ...COLS.map((c) => next[c]), Date.now()).run();
  return cur;
}

/** Public: the background picture or sticker (the address itself is the secret). */
export async function skinPublicRoute(req, env, path, h) {
  const m = path.match(/^\/api\/skin\/bg\/([a-f0-9]{32})$/);
  if (!m || req.method !== "GET") return null;
  const row = await env.DB.prepare("SELECT bg_key, bg_token, sticker_key FROM user_skins WHERE bg_token = ? OR sticker_token = ?").bind(m[1], m[1]).first();
  const key = row ? (row.bg_token === m[1] ? row.bg_key : row.sticker_key) : null;
  const got = key && env.FILES ? await env.FILES.getWithMetadata(key, { type: "arrayBuffer" }) : null;
  if (!got?.value) throw new h.HttpError(404, "Not found.");
  const mime = IMG.test(got.metadata?.mime || "") ? got.metadata.mime : "image/jpeg";
  return new Response(got.value, {
    headers: { "Content-Type": mime, "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" },
  });
}

/** /api/skin* for a logged-in admin. */
export async function skinRoute(req, env, path, url, user, h) {
  if (!path.startsWith("/api/skin")) return null;
  if (!h.admin) throw new h.HttpError(403, "Only admins can change the look.", "forbidden");

  if (path === "/api/skin" && req.method === "GET") return h.json(await getSkin(env, user.id));

  if (path === "/api/skin" && req.method === "PUT") {
    const body = await h.readJson(req);
    const fields = {};
    if (body.skin !== undefined) {
      if (!SKINS.includes(body.skin)) throw new h.HttpError(400, "Unknown look.");
      fields.skin = body.skin;
    }
    if (body.nickname !== undefined) fields.nickname = String(body.nickname || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 30) || null;
    await save(env, user.id, fields);
    return h.json(await getSkin(env, user.id));
  }

  // Pictures: the background behind the site, and a little sticker for the corners of the frames.
  const pic = path.match(/^\/api\/skin\/(background|sticker)$/);
  if (pic) {
    const [k, t] = pic[1] === "background" ? ["bg_key", "bg_token"] : ["sticker_key", "sticker_token"];
    if (req.method === "POST") {
      if (!env.FILES) throw new h.HttpError(503, "File storage isn't set up on the server yet.");
      const mime = (req.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
      if (!IMG.test(mime)) throw new h.HttpError(400, "Pick a picture (JPG, PNG, WebP or GIF).", "skin_bg_type");
      const bytes = await req.arrayBuffer();
      const max = pic[1] === "background" ? MAX_BG : 2 * 1024 * 1024;
      if (!bytes.byteLength || bytes.byteLength > max) throw new h.HttpError(400, "That picture is too big.", "skin_bg_big");
      const key = `skin/${h.randomHex(16)}`;
      await env.FILES.put(key, bytes, { metadata: { mime } });
      const cur = await save(env, user.id, { [k]: key, [t]: h.randomHex(16) });
      if (cur?.[k]) await env.FILES.delete(cur[k]).catch(() => {});
      return h.json(await getSkin(env, user.id));
    }
    if (req.method === "DELETE") {
      const cur = await save(env, user.id, { [k]: null, [t]: null });
      if (cur?.[k] && env.FILES) await env.FILES.delete(cur[k]).catch(() => {});
      return h.json(await getSkin(env, user.id));
    }
  }

  throw new h.HttpError(405, "Not allowed.");
}
