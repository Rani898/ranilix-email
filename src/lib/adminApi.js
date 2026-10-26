// Admin panel API. The server is what actually protects these routes:
// it answers "not found" to anyone who isn't listed in ADMIN_USERS.
// In demo mode (no server) everything runs on sample data kept in this browser.

import { BRAND, DEMO_MODE } from "../config.js";
import { ApiError, request } from "./api.js";
import { getSession } from "./session.js";
import { loadMailbox, saveMailbox } from "./mailbox.js";
import * as supportDemo from "./supportDemo.js";

/* ---------------- Live ---------------- */

const live = {
  stats: () => request("/api/admin/stats", { auth: true }),
  users: (q = "", offset = 0) => request(`/api/admin/users?q=${encodeURIComponent(q)}&offset=${offset}`, { auth: true }),
  setSuspended: (id, suspended) => request(`/api/admin/users/${id}/suspend`, { method: "POST", body: { suspended }, auth: true }),
  resetPassword: (id, password) => request(`/api/admin/users/${id}/password`, { method: "POST", body: { password }, auth: true }),
  setAccountLimit: (id, max) => request(`/api/admin/users/${id}/accounts`, { method: "PUT", body: { max }, auth: true }),
  setStaff: (id, support) => request(`/api/admin/users/${id}/staff`, { method: "PUT", body: { support }, auth: true }),
  setDriveQuota: (id, quotaMb) => request(`/api/admin/users/${id}/drive`, { method: "PUT", body: { quotaMb }, auth: true }),
  setTempAccess: (id, allowed) => request(`/api/admin/users/${id}/temp`, { method: "PUT", body: { allowed }, auth: true }),
  deleteUser: (id, confirm) => request(`/api/admin/users/${id}`, { method: "DELETE", body: { confirm }, auth: true }),
  broadcasts: () => request("/api/admin/broadcasts", { auth: true }),
  discord: () => request("/api/admin/discord", { auth: true }),
  discordRegister: () => request("/api/admin/discord/register", { method: "POST", auth: true }),
  reports: (status = "open") => request(`/api/admin/reports?status=${status}`, { auth: true }),
  setReportStatus: (id, status) => request(`/api/admin/reports/${id}`, { method: "PUT", body: { status }, auth: true }),
  deleteReport: (id) => request(`/api/admin/reports/${id}`, { method: "DELETE", auth: true }),
  support: (status = "open") => request(`/api/admin/support?status=${status}`, { auth: true }),
  supportThread: (id) => request(`/api/admin/support/${id}`, { auth: true }),
  supportReply: (id, message) => request(`/api/admin/support/${id}/messages`, { method: "POST", body: { message }, auth: true }),
  supportStatus: (id, status) => request(`/api/admin/support/${id}`, { method: "PUT", body: { status }, auth: true }),
  supportDelete: (id) => request(`/api/admin/support/${id}`, { method: "DELETE", auth: true }),
  supportOnline: (online) => request("/api/admin/support-settings", { method: "PUT", body: { online }, auth: true }),
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
    accounts: { used: 1 + (i % 3), max: 5 },
    drive: { used: ((i * 7919) % 90) * 1024 * 1024, quota: 100 * 1024 * 1024, custom: false },
  }));
  users.push({ id: "1", email: me, createdAt: now - 20 * DAY, lastLoginAt: now, messages: 9, storageBytes: 0, suspended: false, admin: true, accounts: { used: 1, max: 5 } });
  // Demo: the first three addresses belong to the same person.
  const group = users.slice(0, 3).reverse().map((u, i) => ({ id: u.id, email: u.email, createdAt: u.createdAt, main: i === 0 }));
  for (const u of users) {
    const inGroup = group.some((g) => g.id === u.id);
    u.linked = inGroup ? group : [{ id: u.id, email: u.email, createdAt: u.createdAt, main: true }];
    u.accounts = { ...u.accounts, used: u.linked.length };
  }
  return {
    users,
    broadcasts: [{ id: "b1", subject: "Dark mode is here 🌙", body: "Hi!\n\nRanilix now has dark mode.", createdAt: now - 3 * DAY, sentBy: "rani", recipients: 12, read: 8 }],
    settings: { signupsOpen: true, outboundEnabled: true, outboundConfigured: false, announcement: { enabled: false, text: "", level: "info" } },
  };
}
function demoReports() {
  const s = load();
  if (!s.reports) {
    const now = Date.now();
    s.reports = [
      { id: "r1", email: `noa@${BRAND.domain}`, category: "bug", message: "I didn't get the code from Discord. I waited 10 minutes.", page: "/inbox", userAgent: "Chrome on Android", createdAt: now - 2 * 3600 * 1000, status: "open" },
      { id: "r2", email: `avi@${BRAND.domain}`, category: "idea", message: "It would be great to have folders for school and work.", page: "/inbox", userAgent: "Safari on iPhone", createdAt: now - 26 * 3600 * 1000, status: "open" },
      { id: "r3", email: `maya@${BRAND.domain}`, category: "spam", message: "I keep getting ads from the same address.", page: "/inbox", userAgent: "Edge on Windows", createdAt: now - 4 * DAY, status: "resolved" },
    ];
    save(s);
  }
  return s.reports;
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
      openReports: demoReports().filter((r) => r.status === "open").length,
      driveUsed: s.users.reduce((n, u) => n + (u.drive?.used || 0), 0), driveCapacity: 1024 * 1024 * 1024, driveBackend: "kv",
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
  async setAccountLimit(id, max) {
    await delay(250);
    const n = Math.floor(Number(max));
    if (!(n >= 1 && n <= 100)) throw new ApiError("", "accounts_range");
    const s = load();
    const u = s.users.find((x) => x.id === id);
    if (u) u.accounts = { used: u.accounts?.used || 1, max: n };
    save(s);
    return { ok: true, accounts: u?.accounts };
  },
  async deleteUser(id, confirm) {
    const s = load();
    const u = s.users.find((x) => x.id === id);
    if (u?.admin) throw new ApiError("", "admin_protected");
    if (!u || confirm.toLowerCase() !== u.email.split("@")[0]) throw new ApiError("", "confirm_mismatch");
    s.users = s.users.filter((x) => x.id !== id);
    save(s);
  },
  async broadcasts() { await delay(150); return { broadcasts: load().broadcasts }; },
  async discord() { await delay(150); return { appId: "", hasPublicKey: false, hasToken: false, linked: false, channels: {}, inviteUrl: "" }; },
  async discordRegister() { await delay(300); throw new ApiError("", "discord_no_token"); },
  async reports(status = "open") {
    await delay(150);
    const all = demoReports();
    const list = status === "all" ? all : all.filter((r) => r.status === status);
    return { open: all.filter((r) => r.status === "open").length, resolved: all.filter((r) => r.status === "resolved").length, reports: list };
  },
  async setReportStatus(id, status) { const s = load(); s.reports = demoReports().map((r) => (r.id === id ? { ...r, status } : r)); save(s); },
  support: (status) => supportDemo.adminList(status),
  supportThread: (id) => supportDemo.adminGet(id),
  supportReply: (id, message) => supportDemo.adminReply(id, message, (getSession()?.email || "admin").split("@")[0]),
  supportStatus: (id, status) => supportDemo.adminSetStatus(id, status),
  supportDelete: (id) => supportDemo.adminDelete(id),
  supportOnline: (online) => supportDemo.adminSetOnline(online),
  async deleteReport(id) { const s = load(); s.reports = demoReports().filter((r) => r.id !== id); save(s); },
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
  async settings() { await delay(150); return { tempMode: "chosen", driveDefaultMb: 100, drive: { backend: "kv", capacityMb: 1024, maxFileMb: 24 }, ...load().settings }; },
  async setStaff(id, support) { const s = load(); const u = s.users.find((x) => x.id === id); if (u) u.staff = !!support; save(s); return { ok: true, staff: !!support }; },
  async setDriveQuota(id, quotaMb) {
    if (quotaMb !== null && !(quotaMb >= 0 && quotaMb <= 1024)) throw new ApiError("", "drive_quota_range", { max: 1024 });
    const s = load(); const u = s.users.find((x) => x.id === id);
    if (u) u.drive = { used: u.drive?.used || 0, quota: (quotaMb ?? 100) * 1024 * 1024, custom: quotaMb !== null };
    save(s); return { ok: true };
  },
  async setTempAccess(id, allowed) { const s = load(); const u = s.users.find((x) => x.id === id); if (u) u.tempAccess = !!allowed; save(s); return { ok: true, tempAccess: !!allowed }; },
  async saveSettings(patch) {
    const s = load();
    if (typeof patch.signupsOpen === "boolean") s.settings.signupsOpen = patch.signupsOpen;
    if (typeof patch.outboundEnabled === "boolean") s.settings.outboundEnabled = patch.outboundEnabled;
    if (patch.announcement) s.settings.announcement = { ...s.settings.announcement, ...patch.announcement };
    if (["off", "chosen", "all"].includes(patch.tempMode)) s.settings.tempMode = patch.tempMode;
    if (patch.driveDefaultMb !== undefined) s.settings.driveDefaultMb = Number(patch.driveDefaultMb);
    save(s);
    return { tempMode: "chosen", ...s.settings };
  },
};

export const adminApi = DEMO_MODE ? demo : live;
