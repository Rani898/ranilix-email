// A small calendar: events the person adds, or adds from an invitation that came by mail.

const COLORS = ["blue", "green", "amber", "pink", "violet", "slate"];
const MAX_EVENTS = 2000;

const clean = (v, n) => String(v ?? "").replace(/[\u0000-\u0008\u000b-\u001f]/g, " ").trim().slice(0, n);

function fromBody(body, HttpError) {
  const title = clean(body.title, 120);
  if (!title) throw new HttpError(400, "Give the event a name.", "event_title");
  const start = Number(body.start);
  let end = Number(body.end || 0);
  if (!Number.isFinite(start) || start < 0) throw new HttpError(400, "Pick a date.", "event_date");
  if (!Number.isFinite(end) || end < start) end = start;
  if (end - start > 60 * 24 * 3600 * 1000) throw new HttpError(400, "An event can be up to 60 days long.", "event_long");
  return {
    title, start, end, allDay: body.allDay ? 1 : 0,
    color: COLORS.includes(body.color) ? body.color : "blue",
    location: clean(body.location, 200) || null, notes: clean(body.notes, 2000) || null,
    rsvp: ["yes", "no"].includes(body.rsvp) ? body.rsvp : null,
  };
}

const toClient = (r) => ({
  id: String(r.id), title: r.title, start: r.starts_at, end: r.ends_at, allDay: !!r.all_day, color: r.color,
  location: r.location || "", notes: r.notes || "", rsvp: r.rsvp || null, source: r.source,
  messageId: r.message_id ? String(r.message_id) : null, uid: r.uid || null,
});

/** /api/events* for a logged-in user. */
export async function calendarRoute(req, env, path, url, user, h) {
  if (!path.startsWith("/api/events")) return null;
  const { HttpError, json, readJson } = h;

  if (path === "/api/events" && req.method === "GET") {
    const from = Number(url.searchParams.get("from")) || Date.now() - 45 * 24 * 3600 * 1000;
    const to = Number(url.searchParams.get("to")) || from + 100 * 24 * 3600 * 1000;
    const { results } = await env.DB.prepare("SELECT * FROM events WHERE user_id = ? AND ends_at >= ? AND starts_at < ? ORDER BY starts_at LIMIT 1000")
      .bind(user.id, from, to).all();
    return json({ events: results.map(toClient) });
  }

  if (path === "/api/events" && req.method === "POST") {
    const body = await readJson(req);
    const e = fromBody(body, HttpError);
    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM events WHERE user_id = ?").bind(user.id).first();
    if (count.n >= MAX_EVENTS) throw new HttpError(400, "Your calendar is full.", "events_full");
    // From an invitation: the same invitation (its UID) is added once.
    const uid = clean(body.uid, 200) || null;
    const messageId = Number(body.messageId) || null;
    if (uid) {
      const have = await env.DB.prepare("SELECT * FROM events WHERE user_id = ? AND uid = ?").bind(user.id, uid).first();
      if (have) {
        await env.DB.prepare("UPDATE events SET title = ?, starts_at = ?, ends_at = ?, all_day = ?, location = ?, rsvp = COALESCE(?, rsvp) WHERE id = ?")
          .bind(e.title, e.start, e.end, e.allDay, e.location, e.rsvp, have.id).run();
        return json(toClient({ ...have, title: e.title, starts_at: e.start, ends_at: e.end, all_day: e.allDay, location: e.location, rsvp: e.rsvp || have.rsvp }));
      }
    }
    const now = Date.now();
    const res = await env.DB.prepare(`INSERT INTO events (user_id, title, starts_at, ends_at, all_day, color, location, notes, rsvp, source, message_id, uid, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(user.id, e.title, e.start, e.end, e.allDay, e.color, e.location, e.notes, e.rsvp, messageId ? "email" : "manual", messageId, uid, now).run();
    const row = await env.DB.prepare("SELECT * FROM events WHERE id = ?").bind(res.meta.last_row_id).first();
    return json(toClient(row), 201);
  }

  const one = path.match(/^\/api\/events\/(\d+)$/);
  if (one) {
    const row = await env.DB.prepare("SELECT * FROM events WHERE id = ? AND user_id = ?").bind(Number(one[1]), user.id).first();
    if (!row) throw new HttpError(404, "Not found.", "not_found");
    if (req.method === "PATCH") {
      const e = fromBody({ ...toClient(row), ...(await readJson(req)) }, HttpError);
      await env.DB.prepare("UPDATE events SET title = ?, starts_at = ?, ends_at = ?, all_day = ?, color = ?, location = ?, notes = ?, rsvp = ? WHERE id = ?")
        .bind(e.title, e.start, e.end, e.allDay, e.color, e.location, e.notes, e.rsvp, row.id).run();
      return json(toClient({ ...row, title: e.title, starts_at: e.start, ends_at: e.end, all_day: e.allDay, color: e.color, location: e.location, notes: e.notes, rsvp: e.rsvp }));
    }
    if (req.method === "DELETE") {
      await env.DB.prepare("DELETE FROM events WHERE id = ?").bind(row.id).run();
      return json({ ok: true });
    }
  }

  throw new HttpError(404, "Not found.", "not_found");
}
