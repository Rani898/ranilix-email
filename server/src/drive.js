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
async function getForResponse(env, key, rangeHeader) {
  if (inKv(key) || !env.DRIVE) {
    const body = await get(env, key);
    return body ? { body, status: 200, headers: {} } : null;
  }
  const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader || "");
  if (!m || (m[1] === "" && m[2] === "")) {
    const obj = await env.DRIVE.get(key);
    return obj ? { body: obj.body, status: 200, headers: { "Content-Length": String(obj.size), "Accept-Ranges": "bytes" } } : null;
  }
  const head = await env.DRIVE.head(key);
  if (!head) return null;
  const total = head.size;
  let start; let end;
  if (m[1] === "") { start = Math.max(0, total - Number(m[2])); end = total - 1; }
  else { start = Number(m[1]); end = m[2] === "" ? total - 1 : Math.min(Number(m[2]), total - 1); }
  if (start >= total || start > end) {
    return { body: null, status: 416, headers: { "Content-Range": `bytes */${total}` } };
  }
  const obj = await env.DRIVE.get(key, { range: { offset: start, length: end - start + 1 } });
  if (!obj) return null;
  return {
    body: obj.body, status: 206,
    headers: { "Content-Range": `bytes ${start}-${end}/${total}`, "Content-Length": String(end - start + 1), "Accept-Ranges": "bytes" },
  };
}

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
  downloads: r.downloads || 0,
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

function fileResponse(body, row, inline, extra = { status: 200, headers: {} }) {
  // Images and PDFs may open in the browser; everything else downloads (an HTML file must never run as a page).
  const safeInline = inline && /^(image\/(png|jpe?g|gif|webp|avif)|video\/(mp4|webm|ogg|quicktime)|audio\/(mpeg|mp4|ogg|wav|aac|flac|webm)|application\/pdf|text\/plain)$/.test(row.mime || "");
  return new Response(body, {
    status: extra.status,
    headers: {
      ...extra.headers,
      "Content-Type": safeInline ? row.mime : "application/octet-stream",
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
    const marks = level.map(() => "?").join(",");
    const { results } = await env.DB.prepare(`SELECT id FROM drive_files WHERE user_id = ? AND parent_id IN (${marks})`).bind(userId, ...level).all();
    level = results.map((r) => r.id);
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

/** Public share link: /api/drive/s/<token> (no login). */
export async function driveShareRoute(req, env, path, h) {
  // Short-lived streaming / download link made by the owner (/api/drive/f/<token>).
  const f = path.match(/^\/api\/drive\/f\/([a-f0-9]{40})$/);
  if (f && req.method === "GET") {
    const link = await env.DB.prepare("SELECT file_id FROM drive_links WHERE token = ? AND expires_at > ?").bind(f[1], Date.now()).first();
    const row = link && await env.DB.prepare("SELECT * FROM drive_files WHERE id = ? AND is_folder = 0").bind(link.file_id).first();
    if (!row) throw new h.HttpError(404, "This link has expired.", "drive_link_gone");
    const got = await getForResponse(env, row.storage_key, req.headers.get("Range"));
    if (!got) throw new h.HttpError(404, "Not found.", "drive_not_found");
    return fileResponse(got.body, row, new URL(req.url).searchParams.get("view") === "1", got);
  }
  const m = path.match(/^\/api\/drive\/s\/([a-f0-9]{32})(\/info)?$/);
  if (!m || req.method !== "GET") return null;
  const row = await env.DB.prepare("SELECT * FROM drive_files WHERE share_token = ? AND is_folder = 0").bind(m[1]).first();
  if (!row) throw new h.HttpError(404, "This link doesn't work anymore.", "drive_link_gone");
  // The download page asks for the name, size and type first (nothing private: no owner, no folder).
  if (m[2]) return h.json({ name: row.name, size: row.size, mime: row.mime || "", sharedAt: row.updated_at });
  const range = req.headers.get("Range");
  const firstPiece = !range || /^bytes=0-/.test(range); // a video asks for many pieces: count/limit once
  if (firstPiece) await h.rateLimit(env, `share:${m[1]}`, 500, 24 * 3600 * 1000);
  const got = await getForResponse(env, row.storage_key, range);
  if (!got) throw new h.HttpError(404, "Not found.", "drive_link_gone");
  const view = new URL(req.url).searchParams.get("view") === "1";
  if (!view && firstPiece) {
    await env.DB.prepare("INSERT INTO drive_share_stats (file_id, downloads) VALUES (?, 1) ON CONFLICT(file_id) DO UPDATE SET downloads = downloads + 1").bind(row.id).run();
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
    const { results } = await env.DB.prepare(`SELECT f.*, COALESCE(s.downloads, 0) AS downloads FROM drive_files f LEFT JOIN drive_share_stats s ON s.file_id = f.id
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

  const m = path.match(/^\/api\/drive\/(\d+)(\/download|\/share|\/link)?$/);
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

  if (m[2] === "/share" && req.method === "POST") {
    if (item.is_folder) throw new HttpError(400, "Only files can be shared.", "drive_folder");
    const { on } = await readJson(req);
    const token = on ? h.randomHex(16) : null;
    await env.DB.prepare("UPDATE drive_files SET share_token = ? WHERE id = ?").bind(token, item.id).run();
    if (!on) await env.DB.prepare("DELETE FROM drive_share_stats WHERE file_id = ?").bind(item.id).run();
    if (on) log("accounts", "🔗 קובץ מהדרייב שותף בקישור", { "משתמש": user.email });
    return json(clientItem({ ...item, share_token: token }));
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
  if (!env.DRIVE) return;
  const { results } = await env.DB.prepare("SELECT * FROM drive_uploads WHERE created_at < ?").bind(Date.now() - 24 * 3600 * 1000).all();
  for (const r of results) {
    try { await env.DRIVE.resumeMultipartUpload(r.storage_key, r.r2_upload_id).abort(); } catch { /* gone */ }
    await env.DB.prepare("DELETE FROM drive_uploads WHERE id = ?").bind(r.id).run();
  }
}
