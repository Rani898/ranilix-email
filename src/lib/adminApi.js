// Admin panel API. The server is what actually protects these routes:
// it answers "not found" to anyone who isn't listed in ADMIN_USERS.
// In demo mode (no server) everything runs on sample data kept in this browser.

import { BRAND, DEMO_MODE } from "../config.js";
import { ApiError, request } from "./api.js";
import { getSession } from "./session.js";
import { loadMailbox, saveMailbox } from "./mailbox.js";

/* ---------------- Live ---------------- */

const live = {
  stats: () => request("/api/admin/stats", { auth: true }),
  users: (q = "", offset = 0) => request(`/api/admin/users?q=${encodeURIComponent(q)}&offset=${offset}`, { auth: true }),
  setSuspended: (id, suspended) => request(`/api/admin/users/${id}/suspend`, { method: "POST", body: { suspended }, auth: true }),
  resetPassword: (id, password) => request(`/api/admin/users/${id}/password`, { method: "POST", body: { password }, auth: true }),
  deleteUser: (id, confirm) => request(`/api/admin/users/${id}`, { method: "DELETE", body: { confirm }, auth: true }),
  broadcasts: () => request("/api/admin/broadcasts", { auth: true }),
  sendBroadcast: (subject, body, test) => request("/api/admin/broadcasts", { method: "POST", body: { subject, body, test }, auth: true }),
  settings: () => request("/api/admin/settings", { auth: true }),
  saveSettings: (patch) => request("/api/admin/settings", { method: "PUT", body: patch, auth: true }),
};

/* ---------------- Demo (sample data) ---------------- */

const KEY = "ranilix.demo.admin";
const DAY = 24 * 3600 * 1000;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function seed() {
  const now = Date.now();
  const me = getSession()?.email || `rani@${BRAND.domain}`;
  const names = ["noa", "avi", "maya", "tal", "yossi", "dana", "omer", "shira", "eli", "lior", "nir", "gal"];
  const users = names.map((n, i) => ({
    id: String(i + 2),
    email: `${n}@${BRAND.domain}`,
    createdAt: now - (i * 1.3 + 0.2) * DAY,
    lastLoginAt: i % 4 === 3 ? null : now - (i * 0.7 + 0.1) * DAY,
    messages: 3 + ((i * 7) % 23),
    storageBytes: ((i * 389) % 2400) * 1024,
    suspended: n === "omer",
    admin: false,
  }));
  users.push({ id: "1", email: me, createdAt: now - 20 * DAY, lastLoginAt: now, messages: 9, storageBytes: 0, suspended: false, admin: true });
  return {
    users,
    broadcasts: [{ id: "b1", subject: "Dark mode is here 🌙", body: "Hi!\n\nRanilix now has dark mode.", createdAt: now - 3 * DAY, sentBy: "rani", recipients: 12, read: 8 }],
    settings: { signupsOpen: true, outboundEnabled: true, outboundConfigured: false, announcement: { enabled: false, text: "", level: "info" } },
  };
}
function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s?.users) return s; } catch { /* ignore */ }
  const s = seed(); save(s); return s;
}
function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ } }

const demo = {
  async stats() {
    await delay(250);
    const s = load();
    const now = Date.now();
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const from = start.getTime() - 13 * DAY;
    const sample = [2, 1, 3, 0, 4, 2, 5, 3, 2, 6, 4, 3, 7, 5];
    return {
      users: s.users.length,
      recipients: s.users.filter((u) => !u.suspended).length,
      newToday: s.users.filter((u) => u.createdAt > now - DAY).length,
      newWeek: s.users.filter((u) => u.createdAt > now - 7 * DAY).length,
      activeWeek: s.users.filter((u) => u.lastLoginAt && u.lastLoginAt > now - 7 * DAY).length,
      messages: s.users.reduce((n, u) => n + u.messages, 0),
      receivedToday: 14,
      storageBytes: s.users.reduce((n, u) => n + u.storageBytes, 0),
      files: 23,
      broadcasts: s.broadcasts.length,
      signups: sample.map((count, i) => ({ day: from + i * DAY, count })),
      signupsOpen: s.settings.signupsOpen,
    };
  },
  async users(q = "") {
    await delay(200);
    const list = load().users.filter((u) => u.email.includes(q.toLowerCase())).sort((a, b) => b.createdAt - a.createdAt);
    return { total: list.length, users: list };
  },
  async setSuspended(id, suspended) {
    const s = load();
    const u = s.users.find((x) => x.id === id);
    if (u?.admin) throw new ApiError("", "admin_protected");
    if (u) u.suspended = suspended;
    save(s);
  },
  async resetPassword() { await delay(300); },
  async deleteUser(id, confirm) {
    const s = load();
    const u = s.users.find((x) => x.id === id);
    if (u?.admin) throw new ApiError("", "admin_protected");
    if (!u || confirm.toLowerCase() !== u.email.split("@")[0]) throw new ApiError("", "confirm_mismatch");
    s.users = s.users.filter((x) => x.id !== id);
    save(s);
  },
  async broadcasts() { await delay(150); return { broadcasts: load().broadcasts }; },
  async sendBroadcast(subject, body, test) {
    await delay(500);
    if (!subject.trim() || !body.trim()) throw new ApiError("", "broadcast_empty");
    const email = getSession()?.email;
    // In demo mode the update lands in your own inbox so you can see it.
    const box = loadMailbox(email);
    saveMailbox(email, [{
      id: `bc${Date.now()}`, folder: "inbox", from: { name: "Ranilix Team", email: `team@${BRAND.domain}` }, to: email,
      subject: test ? `[Test] ${subject}` : subject, body, date: Date.now(), read: false, starred: false, attachments: [],
    }, ...box]);
    const s = load();
    const recipients = test ? 1 : s.users.filter((u) => !u.suspended).length;
    if (!test) {
      s.broadcasts.unshift({ id: `b${Date.now()}`, subject, body, createdAt: Date.now(), sentBy: email.split("@")[0], recipients, read: 0 });
      save(s);
    }
    return { ok: true, recipients, test: !!test };
  },
  async settings() { await delay(150); return load().settings; },
  async saveSettings(patch) {
    const s = load();
    if (typeof patch.signupsOpen === "boolean") s.settings.signupsOpen = patch.signupsOpen;
    if (typeof patch.outboundEnabled === "boolean") s.settings.outboundEnabled = patch.outboundEnabled;
    if (patch.announcement) s.settings.announcement = { ...s.settings.announcement, ...patch.announcement };
    save(s);
    return s.settings;
  },
};

export const adminApi = DEMO_MODE ? demo : live;
