// Drive: personal file storage inside each account.
// Files live in Cloudflare R2 when the DRIVE bucket is connected (10 GB free), otherwise in the
// KV namespace FILES that mail attachments already use (1 GB free for the whole site).

const MB = 1024 * 1024;
const GB = 1024 * MB;
const NAME_MAX = 120;
const DEFAULT_QUOTA_MB = 100;

/** Which storage is in use and how big it can get (free tiers). */
// R2 has no hard size: the admin picks a ceiling for the whole site (the bill can't go past it).
// 10 GB is free; above that R2 costs about $0.015 per GB a month.
export const DEFAULT_CAP_GB = 500;
export const MAX_CAP_GB = 2000;
export async function driveCapGb(env) {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'drive_cap_gb'").first();
  const n = Number(row?.value);
  return Number.isFinite(n) && n >= 1 && n <= MAX_CAP_GB && row ? n : DEFAULT_CAP_GB;
}
// Big files go up in parts (R2 multipart): each request stays under the 100 MB request limit.
export const PART_SIZE = 20 * MB;
const SINGLE_MAX = 90 * MB;
const R2_MAX_FILE = 50 * GB; // R2 allows 10,000 parts: 20 MB parts reach 200 GB, so 50 GB is well inside
export async function driveBackend(env) {
  if (env.DRIVE) return { kind: "r2", capacity: (await driveCapGb(env)) * GB, maxFile: R2_MAX_FILE };
  if (env.FILES) return { kind: "kv", capacity: 1 * GB, maxFile: 24 * MB };
  return { kind: "none", capacity: 0, maxFile: 0 };
}

/** The highest quota an admin can give one person: everything the storage holds. */
export const maxQuotaBytes = async (env) => (await driveBackend(env)).capacity;

async function put(env, key, body, mime) {
  if (env.DRIVE) return env.DRIVE.put(key, body, { httpMetadata: { contentType: mime } });
  return env.FILES.put(key, body, { metadata: { mime } });
}
// Keys say where the bytes are, so files saved before R2 was connected keep working after:
// "att/…" an email attachment (KV), "kvd/…" a drive file in KV, "drive/…" a drive file in R2.
const inKv = (key) => key.startsWith("att/") || key.startsWith("kvd/");
async function get(env, key) {
  if (inKv(key)) return env.FILES ? env.FILES.get(key, "stream") : null;
  return env.DRIVE ? (await env.DRIVE.get(key))?.body ?? null : null;
}
/** Read a file, honouring an HTTP Range request when the bytes are in R2 (lets videos stream and seek). */
/**
 * `cap` (bytes) is used for playing in the page: an open range ("bytes=0-") gets at most that much
 * back, and the player simply asks for the next piece. Without it every video on a page holds a
 * never-ending download open, which chokes the connection: pages hang and videos won't start.
 */
async function getForResponse(env, key, rangeHeader, cap = 0) {
  const m = /^bytes=(\d*)-(\d*)$/.exec((rangeHeader || "").trim());
  const pick = (total) => {
    let start; let end;
    if (m[1] === "") { start = Math.max(0, total - Number(m[2])); end = total - 1; }
    else { start = Number(m[1]); end = m[2] === "" ? total - 1 : Math.min(Number(m[2]), total - 1); }
    if (cap && end - start + 1 > cap) end = start + cap - 1;
    return [start, end];
  };
  const partial = (body, start, end, total) => ({
    body, status: 206,
    headers: { "Content-Range": `bytes ${start}-${end}/${total}`, "Content-Length": String(end - start + 1), "Accept-Ranges": "bytes" },
  });
  if (inKv(key) || !env.DRIVE) {
    const body = await get(env, key);
    if (!body) return null;
    if (!m || (m[1] === "" && m[2] === "")) return { body, status: 200, headers: { "Content-Length": String(body.byteLength), "Accept-Ranges": "bytes" } };
    const total = body.byteLength;
    const [start, end] = pick(total);
    if (start >= total || start > end) return { body: null, status: 416, headers: { "Content-Range": `bytes */${total}` } };
    return partial(body.slice(start, end + 1), start, end, total);
  }
  if (!m || (m[1] === "" && m[2] === "")) {
    const obj = await env.DRIVE.get(key);
    return obj ? { body: obj.body, status: 200, headers: { "Content-Length": String(obj.size), "Accept-Ranges": "bytes" } } : null;
  }
  const head = await env.DRIVE.head(key);
  if (!head) return null;
  const total = head.size;
  const [start, end] = pick(total);
  if (start >= total || start > end) {
    return { body: null, status: 416, headers: { "Content-Range": `bytes */${total}` } };
  }
  const obj = await env.DRIVE.get(key, { range: { offset: start, length: end - start + 1 } });
  if (!obj) return null;
  return partial(obj.body, start, end, total);
}
const STREAM_PIECE = 4 * 1024 * 1024;

async function remove(env, key) {
  if (key.startsWith("att/")) {
    // Shared with an email attachment: only delete when nothing else points to it.
    const still = await env.DB.prepare("SELECT 1 FROM attachments WHERE kv_key = ? LIMIT 1").bind(key).first()
      || await env.DB.prepare("SELECT 1 FROM drive_files WHERE storage_key = ? LIMIT 1").bind(key).first();
    if (!still && env.FILES) await env.FILES.delete(key);
    return;
  }
  if (inKv(key)) { if (env.FILES) await env.FILES.delete(key); }
  else if (env.DRIVE) await env.DRIVE.delete(key);
}

export async function driveDefaultMb(env) {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'drive_default_mb'").first();
  const n = Number(row?.value);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_QUOTA_MB;
}

/** Admins always get everything the storage holds. */
export async function quotaOf(env, userId, isAdminUser = false) {
  if (isAdminUser) return maxQuotaBytes(env);
  const row = await env.DB.prepare("SELECT quota_bytes FROM drive_quota WHERE user_id = ?").bind(userId).first();
  const q = row ? row.quota_bytes : (await driveDefaultMb(env)) * MB;
  return Math.min(q, await maxQuotaBytes(env));
}
export async function usedBy(env, userId) {
  return (await env.DB.prepare("SELECT COALESCE(SUM(size), 0) AS n FROM drive_files WHERE user_id = ? AND is_folder = 0").bind(userId).first()).n;
}
export async function siteUsed(env) {
  return (await env.DB.prepare("SELECT COALESCE(SUM(size), 0) AS n FROM drive_files WHERE is_folder = 0").first()).n;
}

const cleanName = (s) => String(s || "").replace(/[\u0000-\u001f\u007f/\\]/g, "").replace(/\s+/g, " ").trim().slice(0, NAME_MAX);

const clientItem = (r) => ({
  id: String(r.id), name: r.name, folder: !!r.is_folder, size: r.size, mime: r.mime || "",
  createdAt: r.created_at, updatedAt: r.updated_at, shared: !!r.share_token, shareToken: r.share_token || null,
  downloads: r.downloads || 0, viewOnly: !!r.view_only, requests: r.pending || 0,
});

async function ownItem(env, userId, id) {
  return env.DB.prepare("SELECT * FROM drive_files WHERE id = ? AND user_id = ?").bind(Number(id), userId).first();
}

async function breadcrumbs(env, userId, folderId) {
  const path = [];
  let id = folderId;
  for (let i = 0; id && i < 30; i++) {
    const f = await env.DB.prepare("SELECT id, name, parent_id FROM drive_files WHERE id = ? AND user_id = ? AND is_folder = 1").bind(id, userId).first();
    if (!f) break;
    path.unshift({ id: String(f.id), name: f.name });
    id = f.parent_id;
  }
  return path;
}

/** A name that doesn't clash in the folder: "photo.jpg" → "photo (2).jpg". */
async function freeName(env, userId, parentId, name) {
  const { results } = await env.DB.prepare("SELECT name FROM drive_files WHERE user_id = ? AND parent_id IS ?").bind(userId, parentId).all();
  const taken = new Set(results.map((r) => r.name.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  const dot = name.lastIndexOf(".");
  const [base, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
  for (let i = 2; i < 1000; i++) {
    const n = `${base} (${i})${ext}`;
    if (!taken.has(n.toLowerCase())) return n;
  }
  return `${base} (${Date.now()})${ext}`;
}

async function folderParam(env, userId, raw, HttpError) {
  if (!raw) return null;
  const f = await ownItem(env, userId, raw);
  if (!f || !f.is_folder) throw new HttpError(404, "Folder not found.", "drive_not_found");
  return f.id;
}

// Phones and computers often upload videos without a type (or with one players don't know):
// go by the file's ending so the player in the page gets something it can play.
const BY_EXT = {
  mp4: "video/mp4", m4v: "video/mp4", mov: "video/mp4", webm: "video/webm", mkv: "video/webm", ogv: "video/ogg",
  mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", wav: "audio/wav", ogg: "audio/ogg", oga: "audio/ogg", flac: "audio/flac", opus: "audio/ogg",
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", avif: "image/avif", pdf: "application/pdf", txt: "text/plain",
};
function playableType(row) {
  const ext = (/\.([a-z0-9]{1,5})$/i.exec(row.name || "") || [])[1]?.toLowerCase();
  let mime = (row.mime || "").toLowerCase();
  if (mime === "video/quicktime" || mime === "video/x-matroska") mime = BY_EXT[ext] || mime;
  if (!mime || mime === "application/octet-stream") mime = BY_EXT[ext] || "";
  return mime;
}

function fileResponse(body, row, inline, extra = { status: 200, headers: {} }) {
  // Images and PDFs may open in the browser; everything else downloads (an HTML file must never run as a page).
  const mime = playableType(row);
  const safeInline = inline && /^(image\/(png|jpe?g|gif|webp|avif)|video\/(mp4|webm|ogg)|audio\/(mpeg|mp4|ogg|wav|aac|flac|webm)|application\/pdf|text\/plain)$/.test(mime);
  return new Response(body, {
    status: extra.status,
    headers: {
      ...extra.headers,
      "Content-Type": safeInline ? mime : "application/octet-stream",
      "Content-Disposition": `${safeInline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(row.name)}`,
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=300",
    },
  });
}

/** Everything under a folder (ids of files and folders), the folder included. */
async function subtree(env, userId, rootId) {
  const all = [];
  let level = [rootId];
  for (let depth = 0; level.length && depth < 50; depth++) {
    all.push(...level);
    const next = [];
    for (let i = 0; i < level.length; i += 90) { // D1: at most 100 values per query
      const part = level.slice(i, i + 90);
      const marks = part.map(() => "?").join(",");
      const { results } = await env.DB.prepare(`SELECT id FROM drive_files WHERE user_id = ? AND parent_id IN (${marks})`).bind(userId, ...part).all();
      next.push(...results.map((r) => r.id));
    }
    level = next;
  }
  return all;
}

/** Delete every drive file of a user (account deletion). */
export async function deleteAllDrive(env, userId) {
  const { results } = await env.DB.prepare("SELECT storage_key FROM drive_files WHERE user_id = ? AND is_folder = 0").bind(userId).all();
  await env.DB.prepare("DELETE FROM drive_files WHERE user_id = ?").bind(userId).run();
  await env.DB.prepare("DELETE FROM drive_quota WHERE user_id = ?").bind(userId).run();
  for (const r of results) if (r.storage_key) await remove(env, r.storage_key);
}

/**
 * Is this item inside the shared folder? Returns the chain of folders from just under the
 * shared folder down to the item (the item last), or null when it's outside.
 */
async function insideShared(env, root, id) {
  if (!Number.isInteger(id)) return null;
  const chain = [];
  let cur = await env.DB.prepare("SELECT id, name, is_folder, parent_id, user_id, size, mime, storage_key FROM drive_files WHERE id = ?").bind(id).first();
  for (let i = 0; cur && i < 60; i++) {
    if (cur.user_id !== root.user_id) return null;
    if (cur.id === root.id) return chain.reverse();
    chain.push(cur);
    if (!cur.parent_id) return null;
    cur = await env.DB.prepare("SELECT id, name, is_folder, parent_id, user_id, size, mime, storage_key FROM drive_files WHERE id = ?").bind(cur.parent_id).first();
  }
  return null;
}

/* ---- Who opened a shared link (for the person who shared it) ---- */

/** Kind of device, system and browser, from the browser's own description. */
export function deviceOf(ua = "") {
  const device = /iPad|Tablet|Tab(?!le)|SM-T|Kindle|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua)) ? "tablet"
    : /Mobi|iPhone|iPod|Android/i.test(ua) ? "phone" : "computer";
  const os = /iPhone|iPod/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android"
    : /Windows/.test(ua) ? "Windows" : /CrOS/.test(ua) ? "ChromeOS" : /Mac OS X|Macintosh/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /SamsungBrowser/.test(ua) ? "Samsung Internet"
    : /FBAN|FBAV|Instagram/.test(ua) ? "Facebook/Instagram" : /WhatsApp/.test(ua) ? "WhatsApp"
    : /FxiOS|Firefox/.test(ua) ? "Firefox" : /CriOS|Chrome/.test(ua) ? "Chrome" : /Safari/.test(ua) ? "Safari" : "";
  return { device, os, browser };
}

async function logVisit(env, req, h, shareId, item, kind) {
  try {
    const ip = req.headers.get("CF-Connecting-IP") || "local";
    const ua = req.headers.get("User-Agent") || "";
    // The same person gets the same short code, without keeping their address.
    const visitor = (await h.sha256(`${shareId}|${ip}|${ua}`)).slice(0, 12);
    const now = Date.now();
    const quiet = { open: 10, view: 30, download: 2 }[kind] * 60 * 1000;
    const seen = await env.DB.prepare("SELECT 1 FROM drive_share_visits WHERE share_id = ? AND visitor = ? AND kind = ? AND item_id IS ? AND at > ? LIMIT 1")
      .bind(shareId, visitor, kind, item?.id ?? null, now - quiet).first();
    if (seen) return;
    const { device, os, browser } = deviceOf(ua);
    const cf = req.cf || {};
    await env.DB.prepare("INSERT INTO drive_share_visits (share_id, item_id, item_name, kind, visitor, device, os, browser, country, city, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(shareId, item?.id ?? null, item?.name ?? null, kind, visitor, device, os, browser, cf.country || req.headers.get("CF-IPCountry") || "", cf.city || "", now).run();
  } catch { /* never stop the file over this */ }
}

/* ---- View-only links: watching is open, downloading needs the owner's OK ---- */

const isViewOnly = (env, shareId) => cached(`vo:${shareId}`, 10000, async () =>
  !!(await env.DB.prepare("SELECT view_only FROM drive_share_opts WHERE file_id = ?").bind(shareId).first())?.view_only);

/** 'none' | 'pending' | 'approved' | 'denied' for the visitor holding `key`. */
async function accessOf(env, h, shareId, key) {
  if (!key || !/^[a-f0-9]{32}$/.test(key)) return "none";
  const keyHash = await h.sha256(key);
  return cached(`ak:${keyHash}`, 5000, async () => {
    const r = await env.DB.prepare("SELECT status FROM drive_share_requests WHERE share_id = ? AND key_hash = ?").bind(shareId, keyHash).first();
    return r ? r.status : "none";
  });
}

// Things a browser can show in the page; anything else can only be downloaded.
const VIEWABLE = /^(image\/(png|jpe?g|gif|webp|avif)|video\/(mp4|webm|ogg)|audio\/(mpeg|mp4|ogg|wav|aac|flac|webm)|application\/pdf|text\/plain)$/;

// Pieces of a video come one after another: remember the folder checks for a few seconds.
const shareCache = new Map();
async function cached(key, ms, load) {
  const hit = shareCache.get(key);
  if (hit && hit.until > Date.now()) return hit.value;
  const value = await load();
  if (shareCache.size > 500) shareCache.clear();
  shareCache.set(key, { value, until: Date.now() + ms });
  return value;
}

/** Public share link: /api/drive/s/<token> (no login). */
export async function driveShareRoute(req, env, path, h) {
  // Short-lived streaming / download link made by the owner (/api/drive/f/<token>).
  const f = path.match(/^\/api\/drive\/f\/([a-f0-9]{40})$/);
  if (f && req.method === "GET") {
    const link = await env.DB.prepare("SELECT file_id FROM drive_links WHERE token = ? AND expires_at > ?").bind(f[1], Date.now()).first();
    const row = link && await env.DB.prepare("SELECT * FROM drive_files WHERE id = ? AND is_folder = 0").bind(link.file_id).first();
    if (!row) throw new h.HttpError(404, "This link has expired.", "drive_link_gone");
    const view = new URL(req.url).searchParams.get("view") === "1";
    const got = await getForResponse(env, row.storage_key, req.headers.get("Range"), view ? STREAM_PIECE : 0);
    if (!got) throw new h.HttpError(404, "Not found.", "drive_not_found");
    return fileResponse(got.body, row, view, got);
  }
  // A shared folder: browse it (and its sub-folders) and open the files inside.
  const fm = path.match(/^\/api\/drive\/s\/([a-f0-9]{32})\/(list|file\/(\d+))$/);
  if (fm && req.method === "GET") {
    const root = await cached(`r:${fm[1]}`, 15000, () => env.DB.prepare("SELECT * FROM drive_files WHERE share_token = ? AND is_folder = 1").bind(fm[1]).first());
    if (!root) throw new h.HttpError(404, "This link doesn't work anymore.", "drive_link_gone");
    const url = new URL(req.url);
    if (fm[2] === "list") {
      const sub = url.searchParams.get("sub");
      let folderId = root.id;
      let crumbs = [];
      if (sub) {
        const chain = await insideShared(env, root, Number(sub));
        if (!chain) throw new h.HttpError(404, "Not found.", "drive_not_found");
        const target = chain[chain.length - 1];
        if (!target.is_folder) throw new h.HttpError(404, "Not found.", "drive_not_found");
        folderId = target.id;
        crumbs = chain.map((c) => ({ id: String(c.id), name: c.name }));
      }
      const { results } = await env.DB.prepare("SELECT id, name, is_folder, size, mime, updated_at FROM drive_files WHERE user_id = ? AND parent_id = ? ORDER BY is_folder DESC, name COLLATE NOCASE LIMIT 1000")
        .bind(root.user_id, folderId).all();
      return h.json({
        name: root.name, path: crumbs,
        items: results.map((r) => ({ id: String(r.id), name: r.name, folder: !!r.is_folder, size: r.size, mime: r.mime || "", updatedAt: r.updated_at })),
      });
    }
    const chain = await cached(`c:${root.id}:${fm[3]}`, 15000, () => insideShared(env, root, Number(fm[3])));
    const row = chain && chain[chain.length - 1];
    if (!row || row.is_folder) throw new h.HttpError(404, "Not found.", "drive_not_found");
    return serveShared(req, env, h, url, root, row);
  }

  // Ask the owner for permission to download (view-only links).
  const rq = path.match(/^\/api\/drive\/s\/([a-f0-9]{32})\/request$/);
  if (rq && req.method === "POST") {
    const share = await env.DB.prepare("SELECT * FROM drive_files WHERE share_token = ?").bind(rq[1]).first();
    if (!share) throw new h.HttpError(404, "This link doesn't work anymore.", "drive_link_gone");
    let body = {};
    try { body = await req.json(); } catch { /* empty */ }
    const name = String(body.name || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 60);
    const email = String(body.email || "").trim().slice(0, 120);
    const note = String(body.note || "").replace(/[\u0000-\u0008\u000b-\u001f]/g, " ").trim().slice(0, 300);
    if (!name) throw new h.HttpError(400, "Please write your name.", "share_req_name");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new h.HttpError(400, "That email doesn't look right.", "share_req_email");
    const ip = req.headers.get("CF-Connecting-IP") || "local";
    await h.rateLimit(env, `sharereq:${ip}`, 8, 3600 * 1000);
    const open = await env.DB.prepare("SELECT COUNT(*) AS n FROM drive_share_requests WHERE share_id = ? AND status = 'pending'").bind(share.id).first();
    if (open.n >= 50) throw new h.HttpError(429, "Too many requests are waiting for this link.", "rate_limited");
    const key = h.randomHex(16);
    const { device, os, browser } = deviceOf(req.headers.get("User-Agent") || "");
    const cf = req.cf || {};
    const now = Date.now();
    await env.DB.prepare("INSERT INTO drive_share_requests (share_id, key_hash, name, email, note, status, device, os, browser, country, city, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)")
      .bind(share.id, await h.sha256(key), name, email || null, note || null, device, os, browser, cf.country || "", cf.city || "", now).run();
    // Tell the owner in their inbox (one note per few minutes per link, so a crowd can't flood it).
    try {
      const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM drive_share_requests WHERE share_id = ? AND created_at > ? AND created_at < ?").bind(share.id, now - 10 * 60 * 1000, now).first();
      if (!recent.n && h.insertMessage) {
        const owner = await env.DB.prepare("SELECT username FROM users WHERE id = ?").bind(share.user_id).first();
        await h.insertMessage(env, share.user_id, {
          folder: "inbox", fromName: "Ranilix Drive", fromAddr: `drive@${env.MAIL_DOMAIN}`, to: owner ? `${owner.username}@${env.MAIL_DOMAIN}` : "",
          subject: `בקשה להורדה: ${share.name}`,
          body: `${name}${email ? ` (${email})` : ""} מבקש/ת להוריד את "${share.name}" מהקישור ששיתפת.${note ? `\n\nהודעה: ${note}` : ""}\n\nכדי לאשר או לדחות: הדרייב שלך ← "${share.name}" ← שיתוף בקישור.\n\n${name} asked to download "${share.name}". Open your drive → share settings to approve or decline.`,
          date: now,
        });
        await h.notifyUser?.(env, share.user_id);
      }
    } catch (e) { console.error("share request note", e); /* the request is saved anyway */ }
    return h.json({ key, status: "pending" }, 201);
  }

  const m = path.match(/^\/api\/drive\/s\/([a-f0-9]{32})(\/info)?$/);
  if (!m || req.method !== "GET") return null;
  const row = await env.DB.prepare("SELECT * FROM drive_files WHERE share_token = ?").bind(m[1]).first();
  if (!row) throw new h.HttpError(404, "This link doesn't work anymore.", "drive_link_gone");
  // The download page asks for the name, size and type first (nothing private: no owner, no folder).
  if (m[2]) {
    const key = new URL(req.url).searchParams.get("k");
    if (!key) await logVisit(env, req, h, row.id, null, "open"); // checking on a request isn't a new visit
    const viewOnly = await isViewOnly(env, row.id);
    const access = viewOnly ? await accessOf(env, h, row.id, key) : "approved";
    if (row.is_folder) {
      const c = await env.DB.prepare("SELECT COUNT(*) AS n FROM drive_files WHERE parent_id = ? AND user_id = ?").bind(row.id, row.user_id).first();
      return h.json({ folder: true, name: row.name, count: c.n, sharedAt: row.updated_at, viewOnly, access });
    }
    return h.json({ name: row.name, size: row.size, mime: row.mime || "", sharedAt: row.updated_at, viewOnly, access, viewable: VIEWABLE.test(playableType(row)) });
  }
  if (row.is_folder) throw new h.HttpError(400, "That's a folder.", "drive_folder");
  return serveShared(req, env, h, new URL(req.url), row, row);
}

/**
 * One file of a share (`share` is the shared file or folder). Playing in the page (?view=1) comes in
 * small pieces and is never limited; ?thumb=1 is the little picture in the gallery (not counted as a visit).
 */
async function serveShared(req, env, h, url, share, row) {
  const view = url.searchParams.get("view") === "1";
  const thumb = url.searchParams.get("thumb") === "1";
  if (await isViewOnly(env, share.id)) {
    // Watching in the page is fine; a real download (or a file the page can't show) needs an approved request.
    const needsOk = !view || !VIEWABLE.test(playableType(row));
    if (needsOk && (await accessOf(env, h, share.id, url.searchParams.get("k"))) !== "approved") {
      throw new h.HttpError(403, "The owner has to approve downloads for this link.", "drive_view_only");
    }
  }
  const range = req.headers.get("Range");
  const firstPiece = !range || /^bytes=0-/.test(range.trim());
  if (!view && firstPiece) {
    // Downloads: a limit per visitor (not per link), so one person can't block everyone else.
    const ip = req.headers.get("CF-Connecting-IP") || "local";
    await h.rateLimit(env, `sharedl:${share.id}:${ip}`, 300, 3600 * 1000);
  }
  const got = await getForResponse(env, row.storage_key, range, view ? STREAM_PIECE : 0);
  if (!got) throw new h.HttpError(404, "Not found.", "drive_not_found");
  if (firstPiece && !thumb && got.status !== 416) {
    if (!view) {
      await env.DB.prepare("INSERT INTO drive_share_stats (file_id, downloads) VALUES (?, 1) ON CONFLICT(file_id) DO UPDATE SET downloads = downloads + 1").bind(share.id).run();
    }
    await logVisit(env, req, h, share.id, row, view ? "view" : "download");
  }
  return fileResponse(got.body, row, view, got);
}

/** /api/drive* for a logged-in user. Returns null when the path isn't ours. */
export async function driveRoute(req, env, path, url, user, h) {
  const { HttpError, json, readJson, log } = h;
  if (!path.startsWith("/api/drive")) return null;
  const backend = await driveBackend(env);
  if (backend.kind === "none") throw new HttpError(503, "File storage isn't set up on the server yet.", "drive_off");
  const usage = async () => ({ used: await usedBy(env, user.id), quota: await quotaOf(env, user.id, !!h.admin), maxFile: backend.maxFile, backend: backend.kind });

  // List a folder
  if (path === "/api/drive" && req.method === "GET") {
    const folder = await folderParam(env, user.id, url.searchParams.get("folder"), HttpError);
    const { results } = await env.DB.prepare(`SELECT f.*, COALESCE(s.downloads, 0) AS downloads, COALESCE(o.view_only, 0) AS view_only,
      (SELECT COUNT(*) FROM drive_share_requests q WHERE q.share_id = f.id AND q.status = 'pending') AS pending
      FROM drive_files f LEFT JOIN drive_share_stats s ON s.file_id = f.id LEFT JOIN drive_share_opts o ON o.file_id = f.id
      WHERE f.user_id = ? AND f.parent_id IS ? ORDER BY f.is_folder DESC, f.name COLLATE NOCASE LIMIT 1000`)
      .bind(user.id, folder).all();
    return json({ items: results.map(clientItem), path: await breadcrumbs(env, user.id, folder), ...(await usage()) });
  }

  // All folders (for "move to")
  if (path === "/api/drive/folders" && req.method === "GET") {
    const { results } = await env.DB.prepare("SELECT id, name, parent_id FROM drive_files WHERE user_id = ? AND is_folder = 1 ORDER BY name COLLATE NOCASE LIMIT 1000").bind(user.id).all();
    return json({ folders: results.map((r) => ({ id: String(r.id), name: r.name, parent: r.parent_id ? String(r.parent_id) : null })) });
  }

  // New folder
  if (path === "/api/drive/folder" && req.method === "POST") {
    const { name, parent } = await readJson(req);
    const n = cleanName(name);
    if (!n) throw new HttpError(400, "Give the folder a name.", "drive_name");
    const parentId = await folderParam(env, user.id, parent, HttpError);
    const now = Date.now();
    const final = await freeName(env, user.id, parentId, n);
    const res = await env.DB.prepare("INSERT INTO drive_files (user_id, parent_id, name, is_folder, size, mime, storage_key, created_at, updated_at) VALUES (?, ?, ?, 1, 0, '', NULL, ?, ?)")
      .bind(user.id, parentId, final, now, now).run();
    return json(clientItem({ id: res.meta.last_row_id, name: final, is_folder: 1, size: 0, created_at: now, updated_at: now }), 201);
  }

  // Upload: the raw file is the request body; name and folder come in the query string.
  if (path === "/api/drive/upload" && req.method === "POST") {
    const name = cleanName(url.searchParams.get("name"));
    if (!name) throw new HttpError(400, "The file needs a name.", "drive_name");
    const size = Number(req.headers.get("Content-Length"));
    if (!Number.isFinite(size) || size < 0) throw new HttpError(411, "Missing file size.");
    if (size > Math.min(backend.maxFile, SINGLE_MAX)) throw new HttpError(413, "This file is too big.", "drive_file_big", { max: Math.floor(backend.maxFile / MB) });
    const [used, quota] = [await usedBy(env, user.id), await quotaOf(env, user.id, !!h.admin)];
    if (used + size > quota) throw new HttpError(413, "Not enough space in your drive.", "drive_full", { quota: Math.round(quota / MB) });
    if ((await siteUsed(env)) + size > backend.capacity) throw new HttpError(507, "The site's storage is full.", "drive_site_full");
    await h.rateLimit(env, `drive:up:${user.id}`, backend.kind === "kv" ? 200 : 2000, 24 * 3600 * 1000);
    const parentId = await folderParam(env, user.id, url.searchParams.get("parent"), HttpError);
    const mime = (req.headers.get("Content-Type") || "application/octet-stream").split(";")[0].slice(0, 100);
    const key = `${backend.kind === "r2" ? "drive" : "kvd"}/${user.id}/${h.randomHex(16)}`;
    // KV needs the whole file; R2 takes the stream as it arrives.
    const body = backend.kind === "kv" ? await req.arrayBuffer() : req.body;
    if (backend.kind === "kv" && body.byteLength > backend.maxFile) throw new HttpError(413, "This file is too big.", "drive_file_big", { max: Math.floor(backend.maxFile / MB) });
    await put(env, key, body, mime);
    const now = Date.now();
    const final = await freeName(env, user.id, parentId, name);
    const res = await env.DB.prepare("INSERT INTO drive_files (user_id, parent_id, name, is_folder, size, mime, storage_key, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?)")
      .bind(user.id, parentId, final, size, mime, key, now, now).run();
    log("accounts", "☁️ קובץ הועלה לדרייב", { "משתמש": user.email, "גודל (MB)": (size / MB).toFixed(1) });
    return json({ item: clientItem({ id: res.meta.last_row_id, name: final, is_folder: 0, size, mime, created_at: now, updated_at: now }), ...(await usage()) }, 201);
  }

  /* ---- Big files: upload in parts (R2 only) ---- */
  if (path === "/api/drive/upload/start" && req.method === "POST") {
    if (backend.kind !== "r2") throw new HttpError(413, "This file is too big.", "drive_file_big", { max: Math.floor(backend.maxFile / MB) });
    const { name: rawName, size, mime: rawMime, parent } = await readJson(req);
    const name = cleanName(rawName);
    if (!name) throw new HttpError(400, "The file needs a name.", "drive_name");
    const total = Number(size);
    if (!Number.isFinite(total) || total <= 0) throw new HttpError(400, "Invalid request.");
    if (total > backend.maxFile) throw new HttpError(413, "This file is too big.", "drive_file_big", { max: Math.floor(backend.maxFile / MB) });
    const [used, quota] = [await usedBy(env, user.id), await quotaOf(env, user.id, !!h.admin)];
    if (used + total > quota) throw new HttpError(413, "Not enough space in your drive.", "drive_full", { quota: Math.round(quota / MB) });
    if ((await siteUsed(env)) + total > backend.capacity) throw new HttpError(507, "The site's storage is full.", "drive_site_full");
    await h.rateLimit(env, `drive:up:${user.id}`, 2000, 24 * 3600 * 1000);
    const parentId = await folderParam(env, user.id, parent, HttpError);
    const mime = String(rawMime || "application/octet-stream").split(";")[0].slice(0, 100);
    const key = `drive/${user.id}/${h.randomHex(16)}`;
    const mp = await env.DRIVE.createMultipartUpload(key, { httpMetadata: { contentType: mime } });
    const res = await env.DB.prepare("INSERT INTO drive_uploads (user_id, r2_upload_id, storage_key, name, size, mime, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(user.id, mp.uploadId, key, name, total, mime, parentId, Date.now()).run();
    return json({ uploadId: String(res.meta.last_row_id), partSize: PART_SIZE, parts: Math.ceil(total / PART_SIZE) }, 201);
  }
  const up = path.match(/^\/api\/drive\/upload\/(\d+)\/(part|complete|abort)$/);
  if (up) {
    const row = await env.DB.prepare("SELECT * FROM drive_uploads WHERE id = ? AND user_id = ?").bind(Number(up[1]), user.id).first();
    if (!row || !env.DRIVE) throw new HttpError(404, "This upload wasn't found.", "drive_not_found");
    const mp = env.DRIVE.resumeMultipartUpload(row.storage_key, row.r2_upload_id);
    if (up[2] === "part" && req.method === "PUT") {
      const n = Number(url.searchParams.get("n"));
      if (!Number.isInteger(n) || n < 1 || n > Math.ceil(row.size / PART_SIZE)) throw new HttpError(400, "Invalid request.");
      const bytes = await req.arrayBuffer();
      if (bytes.byteLength > PART_SIZE || bytes.byteLength === 0) throw new HttpError(400, "Invalid request.");
      const part = await mp.uploadPart(n, bytes);
      return json({ partNumber: n, etag: part.etag });
    }
    if (up[2] === "complete" && req.method === "POST") {
      const { parts } = await readJson(req);
      if (!Array.isArray(parts) || !parts.length) throw new HttpError(400, "Invalid request.");
      const obj = await mp.complete(parts.map((p) => ({ partNumber: Number(p.partNumber), etag: String(p.etag) })).sort((a, b) => a.partNumber - b.partNumber));
      await env.DB.prepare("DELETE FROM drive_uploads WHERE id = ?").bind(row.id).run();
      const size = obj.size;
      const [used, quota] = [await usedBy(env, user.id), await quotaOf(env, user.id, !!h.admin)];
      if (size > backend.maxFile || used + size > quota) {
        await env.DRIVE.delete(row.storage_key);
        throw new HttpError(413, "Not enough space in your drive.", "drive_full", { quota: Math.round(quota / MB) });
      }
      const now = Date.now();
      const final = await freeName(env, user.id, row.parent_id, row.name);
      const res = await env.DB.prepare("INSERT INTO drive_files (user_id, parent_id, name, is_folder, size, mime, storage_key, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?)")
        .bind(user.id, row.parent_id, final, size, row.mime, row.storage_key, now, now).run();
      log("accounts", "☁️ קובץ גדול הועלה לדרייב", { "משתמש": user.email, "גודל (MB)": (size / MB).toFixed(1) });
      return json({ item: clientItem({ id: res.meta.last_row_id, name: final, is_folder: 0, size, mime: row.mime, created_at: now, updated_at: now }), ...(await usage()) }, 201);
    }
    if (up[2] === "abort" && req.method === "POST") {
      try { await mp.abort(); } catch { /* already gone */ }
      await env.DB.prepare("DELETE FROM drive_uploads WHERE id = ?").bind(row.id).run();
      return json({ ok: true });
    }
    throw new HttpError(405, "Not allowed.");
  }

  // Save an email attachment to the drive (no copy needed: it points to the same stored file)
  if (path === "/api/drive/from-attachment" && req.method === "POST") {
    const { attachmentId, parent } = await readJson(req);
    const att = await env.DB.prepare("SELECT filename, mime, size, kv_key FROM attachments WHERE id = ? AND user_id = ?").bind(Number(attachmentId), user.id).first();
    if (!att) throw new HttpError(404, "Attachment not found.", "drive_not_found");
    const [used, quota] = [await usedBy(env, user.id), await quotaOf(env, user.id, !!h.admin)];
    if (used + att.size > quota) throw new HttpError(413, "Not enough space in your drive.", "drive_full", { quota: Math.round(quota / MB) });
    const parentId = await folderParam(env, user.id, parent, HttpError);
    const now = Date.now();
    const final = await freeName(env, user.id, parentId, cleanName(att.filename) || "file");
    const res = await env.DB.prepare("INSERT INTO drive_files (user_id, parent_id, name, is_folder, size, mime, storage_key, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?)")
      .bind(user.id, parentId, final, att.size, att.mime, att.kv_key, now, now).run();
    return json({ item: clientItem({ id: res.meta.last_row_id, name: final, is_folder: 0, size: att.size, mime: att.mime, created_at: now, updated_at: now }) }, 201);
  }

  // Many short-lived links at once: thumbnails for the gallery view.
  if (path === "/api/drive/links" && req.method === "POST") {
    const { ids } = await readJson(req);
    const list = [...new Set((Array.isArray(ids) ? ids : []).map(Number).filter(Number.isInteger))].slice(0, 500);
    if (!list.length) return json({ links: {} });
    // D1 allows at most 100 values in one query, so look the files up 90 at a time.
    const found = [];
    for (let i = 0; i < list.length; i += 90) {
      const part = list.slice(i, i + 90);
      const marks = part.map(() => "?").join(",");
      const { results } = await env.DB.prepare(`SELECT id FROM drive_files WHERE user_id = ? AND is_folder = 0 AND id IN (${marks})`).bind(user.id, ...part).all();
      found.push(...results);
    }
    const expires = Date.now() + 6 * 3600 * 1000;
    const links = {};
    const stmts = found.map((r) => {
      const token = h.randomHex(20);
      links[String(r.id)] = `/api/drive/f/${token}`;
      return env.DB.prepare("INSERT INTO drive_links (token, file_id, expires_at) VALUES (?, ?, ?)").bind(token, r.id, expires);
    });
    if (stmts.length) await env.DB.batch(stmts);
    return json({ links });
  }

  const m = path.match(/^\/api\/drive\/(\d+)(\/download|\/share|\/share-mode|\/link|\/visits|\/requests(?:\/\d+)?)?$/);
  if (!m) return null;
  const item = await ownItem(env, user.id, m[1]);
  if (!item) throw new HttpError(404, "Not found.", "drive_not_found");

  if (m[2] === "/download" && req.method === "GET") {
    if (item.is_folder) throw new HttpError(400, "Folders can't be downloaded.", "drive_folder");
    const body = await get(env, item.storage_key);
    if (!body) throw new HttpError(404, "Not found.", "drive_not_found");
    return fileResponse(body, item, url.searchParams.get("view") === "1");
  }

  // A short-lived link for the video player or a direct download (works without the login header).
  if (m[2] === "/link" && req.method === "POST") {
    if (item.is_folder) throw new HttpError(400, "Folders can't be downloaded.", "drive_folder");
    const token = h.randomHex(20);
    await env.DB.prepare("INSERT INTO drive_links (token, file_id, expires_at) VALUES (?, ?, ?)").bind(token, item.id, Date.now() + 6 * 3600 * 1000).run();
    return json({ path: `/api/drive/f/${token}` });
  }

  if (m[2] === "/share-mode" && req.method === "POST") {
    const { viewOnly } = await readJson(req);
    await env.DB.prepare("INSERT INTO drive_share_opts (file_id, view_only, updated_at) VALUES (?, ?, ?) ON CONFLICT(file_id) DO UPDATE SET view_only = excluded.view_only, updated_at = excluded.updated_at")
      .bind(item.id, viewOnly ? 1 : 0, Date.now()).run();
    shareCache.delete(`vo:${item.id}`);
    return json({ viewOnly: !!viewOnly });
  }

  if (m[2] === "/requests" && req.method === "GET") {
    const { results } = await env.DB.prepare("SELECT id, name, email, note, status, device, os, browser, country, city, created_at, decided_at FROM drive_share_requests WHERE share_id = ? ORDER BY (status = 'pending') DESC, created_at DESC LIMIT 200").bind(item.id).all();
    return json({ requests: results.map((r) => ({ id: String(r.id), name: r.name, email: r.email || "", note: r.note || "", status: r.status, device: r.device, os: r.os, browser: r.browser, country: r.country, city: r.city, at: r.created_at, decidedAt: r.decided_at })) });
  }

  const rm = m[2] && /^\/requests\/(\d+)$/.exec(m[2]);
  if (rm && req.method === "POST") {
    const { status } = await readJson(req);
    if (!["approved", "denied"].includes(status)) throw new HttpError(400, "Choose approve or decline.");
    const r = await env.DB.prepare("SELECT * FROM drive_share_requests WHERE id = ? AND share_id = ?").bind(Number(rm[1]), item.id).first();
    if (!r) throw new HttpError(404, "Not found.", "drive_not_found");
    await env.DB.prepare("UPDATE drive_share_requests SET status = ?, decided_at = ? WHERE id = ?").bind(status, Date.now(), r.id).run();
    shareCache.delete(`ak:${r.key_hash}`);
    // Let them know by email when they left one.
    if (status === "approved" && r.status !== "approved" && r.email && env.RESEND_API_KEY && item.share_token) {
      try {
        const link = `https://rani898.github.io/ranilix-email/share?f=${item.share_token}`;
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: `"Ranilix Drive" <drive@${env.MAIL_DOMAIN}>`, to: [r.email],
            subject: `אושר: אפשר להוריד את "${item.name}"`,
            text: `היי ${r.name},\n\nהבקשה שלך להוריד את "${item.name}" אושרה.\nפתחו את הקישור מאותו מכשיר ששלחתם ממנו את הבקשה, ותראו כפתור הורדה:\n${link}\n\n---\nYour request to download "${item.name}" was approved. Open the link on the same device you asked from:\n${link}`,
          }),
        });
      } catch { /* the page shows it anyway */ }
    }
    return json({ ok: true, status });
  }

  if (m[2] === "/visits" && req.method === "GET") {
    const { results } = await env.DB.prepare("SELECT item_name, kind, visitor, device, os, browser, country, city, at FROM drive_share_visits WHERE share_id = ? ORDER BY at DESC LIMIT 300").bind(item.id).all();
    const sum = await env.DB.prepare("SELECT COUNT(*) AS total, COUNT(DISTINCT visitor) AS people, SUM(kind = 'open') AS opens, SUM(kind = 'download') AS downloads, SUM(kind = 'view') AS views FROM drive_share_visits WHERE share_id = ?").bind(item.id).first();
    // Number the visitors in the order they first came (visitor 1, 2, 3 ...).
    const order = new Map();
    [...results].reverse().forEach((r) => { if (!order.has(r.visitor)) order.set(r.visitor, order.size + 1); });
    return json({
      summary: { people: sum.people || 0, opens: sum.opens || 0, downloads: sum.downloads || 0, views: sum.views || 0 },
      visits: results.map((r) => ({ at: r.at, kind: r.kind, item: r.item_name, visitor: order.get(r.visitor), device: r.device, os: r.os, browser: r.browser, country: r.country, city: r.city })),
    });
  }

  if (m[2] === "/share" && req.method === "POST") {
    const { on } = await readJson(req);
    const token = on ? h.randomHex(16) : null;
    await env.DB.prepare("UPDATE drive_files SET share_token = ? WHERE id = ?").bind(token, item.id).run();
    if (!on) await env.DB.prepare("DELETE FROM drive_share_stats WHERE file_id = ?").bind(item.id).run();
    if (on) log("accounts", "🔗 קובץ מהדרייב שותף בקישור", { "משתמש": user.email });
    const opts = await env.DB.prepare("SELECT view_only FROM drive_share_opts WHERE file_id = ?").bind(item.id).first();
    return json(clientItem({ ...item, share_token: token, view_only: opts?.view_only || 0 }));
  }

  // Rename / move
  if (!m[2] && req.method === "PATCH") {
    const body = await readJson(req);
    let { name, parent_id: parentId } = item;
    if (body.name !== undefined) {
      name = cleanName(body.name);
      if (!name) throw new HttpError(400, "Give it a name.", "drive_name");
    }
    if (body.parent !== undefined) {
      parentId = await folderParam(env, user.id, body.parent, HttpError);
      if (item.is_folder && parentId && (await subtree(env, user.id, item.id)).includes(parentId)) {
        throw new HttpError(400, "A folder can't go inside itself.", "drive_loop");
      }
    }
    if (name !== item.name || parentId !== item.parent_id) name = await freeName(env, user.id, parentId, name);
    const now = Date.now();
    await env.DB.prepare("UPDATE drive_files SET name = ?, parent_id = ?, updated_at = ? WHERE id = ?").bind(name, parentId, now, item.id).run();
    return json(clientItem({ ...item, name, parent_id: parentId, updated_at: now }));
  }

  // Delete (a folder with everything in it)
  if (!m[2] && req.method === "DELETE") {
    const ids = item.is_folder ? await subtree(env, user.id, item.id) : [item.id];
    const keys = [];
    for (let i = 0; i < ids.length; i += 90) {
      const part = ids.slice(i, i + 90);
      const marks = part.map(() => "?").join(",");
      const { results } = await env.DB.prepare(`SELECT storage_key FROM drive_files WHERE is_folder = 0 AND id IN (${marks})`).bind(...part).all();
      keys.push(...results.map((r) => r.storage_key).filter(Boolean));
      await env.DB.prepare(`DELETE FROM drive_files WHERE user_id = ? AND id IN (${marks})`).bind(user.id, ...part).run();
    }
    for (const k of keys) await remove(env, k);
    return json({ ok: true, ...(await usage()) });
  }

  throw new HttpError(405, "Not allowed.");
}

/** Daily: drop expired links and give up on uploads that never finished. */
export async function driveCleanup(env) {
  await env.DB.prepare("DELETE FROM drive_links WHERE expires_at < ?").bind(Date.now()).run();
  await env.DB.prepare("DELETE FROM drive_share_visits WHERE at < ? OR share_id NOT IN (SELECT id FROM drive_files)").bind(Date.now() - 90 * 24 * 3600 * 1000).run();
  await env.DB.prepare("DELETE FROM drive_share_requests WHERE created_at < ? OR share_id NOT IN (SELECT id FROM drive_files)").bind(Date.now() - 180 * 24 * 3600 * 1000).run();
  await env.DB.prepare("DELETE FROM drive_share_opts WHERE file_id NOT IN (SELECT id FROM drive_files)").run();
  if (!env.DRIVE) return;
  const { results } = await env.DB.prepare("SELECT * FROM drive_uploads WHERE created_at < ?").bind(Date.now() - 24 * 3600 * 1000).all();
  for (const r of results) {
    try { await env.DRIVE.resumeMultipartUpload(r.storage_key, r.r2_upload_id).abort(); } catch { /* gone */ }
    await env.DB.prepare("DELETE FROM drive_uploads WHERE id = ?").bind(r.id).run();
  }
}
