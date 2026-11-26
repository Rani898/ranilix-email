// "Ranilix Wrapped": a personal year-in-review built only from the person's own data.
// GET /api/wrapped?year=2026 (logged in). Nothing here is shared unless the person shares it.

const DAY = 24 * 3600 * 1000;

/** Year bounds in Israel time (UTC+2 in winter is close enough for a yearly summary). */
function bounds(year) {
  const tz = 2 * 3600 * 1000;
  return [Date.UTC(year, 0, 1) - tz, Date.UTC(year + 1, 0, 1) - tz];
}

export async function wrappedRoute(req, env, path, url, user, h) {
  if (path !== "/api/wrapped") return null;
  if (req.method !== "GET") throw new h.HttpError(405, "Not allowed.");
  const now = new Date();
  const year = Math.min(now.getUTCFullYear(), Math.max(2024, Number(url.searchParams.get("year")) || now.getUTCFullYear()));
  const [from, to] = bounds(year);
  const uid = user.id;
  const team = `%@${env.MAIL_DOMAIN}`;
  const one = async (sql, ...args) => { try { return (await env.DB.prepare(sql).bind(...args).first()) || {}; } catch { return {}; } };
  const all = async (sql, ...args) => { try { return (await env.DB.prepare(sql).bind(...args).all()).results || []; } catch { return []; } };
  // Israel-time bucket expressions (SQLite works on seconds).
  const local = "(date / 1000 + 7200)";

  const [me, received, sent, starred, attach, senders, months, weekdays, hours, topDay, temp, site, drive, receipts, events, mochi, rank] = await Promise.all([
    one("SELECT created_at FROM users WHERE id = ?", uid),
    one("SELECT COUNT(*) AS n FROM messages WHERE user_id = ? AND folder != 'sent' AND date >= ? AND date < ?", uid, from, to),
    one("SELECT COUNT(*) AS n FROM messages WHERE user_id = ? AND folder = 'sent' AND date >= ? AND date < ?", uid, from, to),
    one("SELECT COUNT(*) AS n FROM messages WHERE user_id = ? AND starred = 1 AND date >= ? AND date < ?", uid, from, to),
    one(`SELECT COUNT(*) AS n, COALESCE(SUM(a.size), 0) AS bytes FROM attachments a JOIN messages m ON m.id = a.message_id
         WHERE a.user_id = ? AND m.date >= ? AND m.date < ?`, uid, from, to),
    all(`SELECT from_addr AS addr, MAX(from_name) AS name, COUNT(*) AS n FROM messages
         WHERE user_id = ? AND folder != 'sent' AND date >= ? AND date < ? AND from_addr != '' AND from_addr NOT LIKE ?
         GROUP BY lower(from_addr) ORDER BY n DESC LIMIT 3`, uid, from, to, team),
    all(`SELECT CAST(strftime('%m', ${local}, 'unixepoch') AS INTEGER) AS m, COUNT(*) AS n FROM messages
         WHERE user_id = ? AND date >= ? AND date < ? GROUP BY m`, uid, from, to),
    all(`SELECT CAST(strftime('%w', ${local}, 'unixepoch') AS INTEGER) AS d, COUNT(*) AS n FROM messages
         WHERE user_id = ? AND date >= ? AND date < ? GROUP BY d`, uid, from, to),
    all(`SELECT CAST(strftime('%H', ${local}, 'unixepoch') AS INTEGER) AS hr, COUNT(*) AS n FROM messages
         WHERE user_id = ? AND date >= ? AND date < ? GROUP BY hr`, uid, from, to),
    one(`SELECT strftime('%Y-%m-%d', ${local}, 'unixepoch') AS day, COUNT(*) AS n FROM messages
         WHERE user_id = ? AND date >= ? AND date < ? GROUP BY day ORDER BY n DESC LIMIT 1`, uid, from, to),
    one("SELECT COUNT(*) AS n, COALESCE(SUM(received), 0) AS caught FROM temp_addresses WHERE user_id = ? AND created_at >= ? AND created_at < ?", uid, from, to),
    one("SELECT COUNT(*) AS n, COALESCE(SUM(received), 0) AS caught FROM site_addresses WHERE user_id = ? AND created_at >= ? AND created_at < ?", uid, from, to),
    one("SELECT COUNT(*) AS n, COALESCE(SUM(size), 0) AS bytes, SUM(CASE WHEN share_token IS NOT NULL THEN 1 ELSE 0 END) AS shared FROM drive_files WHERE user_id = ? AND is_folder = 0 AND created_at >= ? AND created_at < ?", uid, from, to),
    one("SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN currency = 'ILS' THEN amount_cents ELSE 0 END), 0) AS ils FROM receipts WHERE user_id = ? AND hidden = 0 AND date >= ? AND date < ?", uid, from, to),
    one("SELECT COUNT(*) AS n FROM events WHERE user_id = ? AND starts_at >= ? AND starts_at < ?", uid, from, to),
    one("SELECT COUNT(*) AS n FROM ai_chat WHERE user_id = ? AND role = 'user' AND at >= ? AND at < ?", uid, from, to),
    // Share of Ranilix users who got less mail than you this year (for "top X%").
    one(`WITH c AS (SELECT u.id, (SELECT COUNT(*) FROM messages m WHERE m.user_id = u.id AND m.folder != 'sent' AND m.date >= ? AND m.date < ?) AS n FROM users u)
         SELECT (SELECT COUNT(*) FROM c) AS total, (SELECT COUNT(*) FROM c WHERE n < (SELECT n FROM c WHERE id = ?)) AS below`, from, to, uid),
  ]);

  const best = (rows, key) => rows.reduce((a, r) => (r.n > (a?.n || 0) ? r : a), null)?.[key] ?? null;
  const n = (r, k = "n") => Number(r?.[k] || 0);
  const total = n(rank, "total");
  const topPercent = total >= 5 && n(received) > 0 ? Math.max(1, Math.ceil(100 - (n(rank, "below") / total) * 100)) : null;
  const memberSince = me.created_at || null;

  return h.json({
    year,
    email: user.email,
    memberSince,
    daysWithUs: memberSince ? Math.max(1, Math.round((Math.min(Date.now(), to) - memberSince) / DAY)) : null,
    received: n(received),
    sent: n(sent),
    starred: n(starred),
    attachments: n(attach),
    attachmentBytes: n(attach, "bytes"),
    topSenders: senders.map((s) => ({ name: s.name || "", addr: s.addr, count: s.n })),
    months: Array.from({ length: 12 }, (_, i) => months.find((m) => m.m === i + 1)?.n || 0),
    busiestMonth: best(months, "m"),
    busiestWeekday: best(weekdays, "d"),
    busiestHour: best(hours, "hr"),
    busiestDay: topDay.day ? { day: topDay.day, count: topDay.n } : null,
    tempAddresses: n(temp),
    siteAddresses: n(site),
    shieldCaught: n(temp, "caught") + n(site, "caught"),
    driveFiles: n(drive),
    driveBytes: n(drive, "bytes"),
    driveShared: n(drive, "shared"),
    receipts: n(receipts),
    receiptsIls: Math.round(n(receipts, "ils") / 100),
    events: n(events),
    mochiChats: n(mochi),
    topPercent,
  });
}
