// All calls the site makes to the Ranilix server.
// With VITE_API_URL set, these talk to the real Cloudflare Worker.
// Without it (demo mode), they use a fake in-browser backend so the site still works.

import { API_URL, BRAND, DEMO_MODE } from "../config.js";
import { getAccounts, getSession } from "./session.js";
import { loadMailbox, saveMailbox } from "./mailbox.js";
import { formatBytes } from "./validation.js";
import * as supportDemo from "./supportDemo.js";

/** Error with a translation code (see errors.* in the i18n files). */
export class ApiError extends Error {
  constructor(message, code, params) {
    super(message);
    this.code = code;
    this.params = params;
  }
}
export class AuthError extends ApiError {}

// Attachment limits. Demo mode keeps files in browser storage, so it allows much less.
export const LIMITS = DEMO_MODE
  ? { maxFiles: 5, maxFile: 1024 * 1024, maxTotal: 3 * 1024 * 1024 }
  : { maxFiles: 10, maxFile: 10 * 1024 * 1024, maxTotal: 20 * 1024 * 1024 };

/** Returns an ApiError if the files break the limits, else null. */
export function checkFiles(files) {
  if (files.length > LIMITS.maxFiles) return new ApiError("", "too_many_files", { max: LIMITS.maxFiles });
  const big = files.find((f) => f.size > LIMITS.maxFile);
  if (big) return new ApiError("", "file_too_big", { name: big.name, max: formatBytes(LIMITS.maxFile) });
  if (files.reduce((s, f) => s + f.size, 0) > LIMITS.maxTotal) return new ApiError("", "total_too_big", { max: formatBytes(LIMITS.maxTotal) });
  return null;
}

export async function request(path, { method = "GET", body, form, auth = false, raw = false, headers: extra = {} } = {}) {
  const headers = { ...extra };
  if (body) headers["Content-Type"] = "application/json";
  if (auth) headers.Authorization = `Bearer ${getSession()?.token || ""}`;
  let res;
  try {
    res = await fetch(API_URL + path, { method, headers, body: form || (body ? JSON.stringify(body) : undefined) });
  } catch {
    throw new ApiError("Can't reach the server.", "network");
  }
  if (raw && res.ok) return res;
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && auth) throw new AuthError(data.error || "Please log in again.", "session");
  if (!res.ok) throw new ApiError(data.error || "Something went wrong.", data.code || "generic", data.params);
  return data;
}

/* ---------------- Demo backend ---------------- */

const RESERVED = new Set(["admin", "support", "help", "info", "root", "postmaster", "abuse", "noreply", "security", "ranilix", "team", "tips"]);
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const demoEmail = () => getSession()?.email;
const readAsDataUrl = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error);
  r.readAsDataURL(file);
});

const demo = {
  async checkUsernameAvailable(u) { await delay(300); return !RESERVED.has(u); },
  async signUp({ username }) {
    await delay(700);
    if (getAccounts().length >= 5) throw new ApiError("limit", "account_limit", { max: 5 });
    if (RESERVED.has(username)) throw new ApiError("taken", "name_taken");
    return { email: `${username}@${BRAND.domain}`, token: null };
  },
  async logIn({ email }) { await delay(600); return { email, token: null }; },
  async logOut() {},
  async listMessages() { await delay(150); return loadMailbox(demoEmail()); },
  async updateMessage(id, patch) {
    const email = demoEmail();
    saveMailbox(email, loadMailbox(email).map((m) => (m.id === id ? { ...m, ...patch } : m)));
  },
  async deleteMessage(id) {
    const email = demoEmail();
    saveMailbox(email, loadMailbox(email).filter((m) => m.id !== id));
  },
  async sendMessage({ to, subject, body, files = [], forwardAttachments = [] }) {
    const err = checkFiles(files);
    if (err) throw err;
    await delay(400);
    const email = demoEmail();
    const box = loadMailbox(email);
    const uploaded = await Promise.all(files.map(async (f, i) => ({
      id: `a${Date.now()}${i}`, filename: f.name, mime: f.type || "application/octet-stream", size: f.size, dataUrl: await readAsDataUrl(f),
    })));
    const fwd = forwardAttachments
      .map((id) => box.flatMap((m) => m.attachments || []).find((a) => a.id === id))
      .filter(Boolean)
      .map((a, i) => ({ ...a, id: `f${Date.now()}${i}` }));
    const attachments = [...uploaded, ...fwd];
    const msg = { id: `m${Date.now()}`, folder: "sent", from: { name: email.split("@")[0], email }, to, subject, body, date: Date.now(), read: true, starred: false, attachments };
    const self = to.split(", ").includes(email) ? [{ ...msg, id: msg.id + "i", folder: "inbox", read: false }] : [];
    try {
      saveMailbox(email, [msg, ...self, ...box], true);
    } catch {
      throw new ApiError("full", "total_too_big", { max: formatBytes(LIMITS.maxTotal) });
    }
  },
  async downloadAttachment(att) {
    const res = await fetch(att.dataUrl);
    return res.blob();
  },
};

/* ---------------- Real backend ---------------- */

const live = {
  async checkUsernameAvailable(u) {
    const { available } = await request(`/api/username-available?u=${encodeURIComponent(u)}`);
    return available;
  },
  // accountTokens: addresses already signed in on this browser, so the new one joins the same person (max 5 by default).
  signUp: ({ username, password }) => request("/api/signup", {
    method: "POST",
    body: { username, password, lang: document.documentElement.lang || "en", accountTokens: getAccounts().map((a) => a.token).filter(Boolean) },
  }),
  logIn: ({ email, password, remember }) => request("/api/login", { method: "POST", body: { email, password, remember } }),
  async logOut() { try { await request("/api/logout", { method: "POST", auth: true }); } catch { /* ignore */ } },
  async listMessages() { return (await request("/api/messages", { auth: true })).messages; },
  updateMessage: (id, patch) => request(`/api/messages/${id}`, { method: "PATCH", body: patch, auth: true }),
  deleteMessage: (id) => request(`/api/messages/${id}`, { method: "DELETE", auth: true }),
  async sendMessage({ to, subject, body, files = [], forwardAttachments = [] }) {
    const err = checkFiles(files);
    if (err) throw err;
    const form = new FormData();
    form.set("to", to);
    form.set("subject", subject);
    form.set("body", body);
    for (const id of forwardAttachments) form.append("forward", id);
    for (const f of files) form.append("files", f, f.name);
    return request("/api/send", { method: "POST", form, auth: true });
  },
  async downloadAttachment(att) {
    const res = await request(`/api/attachments/${att.id}`, { auth: true, raw: true });
    return res.blob();
  },
};

// Account info + site announcement
demo.getMe = async () => {
  const email = demoEmail();
  const ar = await demo.getAutoReply();
  const now = Date.now();
  return {
    email, isAdmin: email?.split("@")[0] === "rani", isStaff: false, accounts: { used: getAccounts().length, max: 5 }, profile: await demo.getProfile(),
    tempAllowed: true, autoReplyOn: !!(ar.enabled && ar.body && (!ar.startsAt || ar.startsAt <= now) && (!ar.endsAt || ar.endsAt > now)),
  };
};
demo.getAnnouncement = async () => {
  try {
    const a = JSON.parse(localStorage.getItem("ranilix.demo.admin") || "{}").settings?.announcement;
    return a?.enabled && a.text ? a : { enabled: false };
  } catch { return { enabled: false }; }
};
live.getMe = () => request("/api/me", { auth: true });
live.getAnnouncement = () => request("/api/announcement");
// Cheap "is there new mail?" check: returns the id of the newest message.
live.checkLatest = async () => (await request("/api/check", { auth: true })).latest;
demo.checkLatest = async () => {
  const box = loadMailbox(demoEmail());
  return box.length ? String(box.reduce((a, m) => (m.date > a.date ? m : a)).id) : null;
};

// "Connect Google": read the user's Gmail inside Ranilix (needs the live server).
live.googleStatus = () => request("/api/google/status", { auth: true });
live.googleStart = (returnTo) => request("/api/google/start", { method: "POST", body: { returnTo }, auth: true });
live.googleDisconnect = () => request("/api/google/disconnect", { method: "POST", auth: true });
live.gmailList = ({ q = "", pageToken = "" } = {}) =>
  request(`/api/google/messages?${new URLSearchParams({ ...(q && { q }), ...(pageToken && { pageToken }) })}`, { auth: true });
live.gmailGet = (id) => request(`/api/google/messages/${encodeURIComponent(id)}`, { auth: true });
demo.googleStatus = async () => ({ configured: false, connected: false, email: "", demo: true });
demo.googleStart = async () => { throw new ApiError("", "google_not_configured"); };
demo.googleDisconnect = async () => ({ ok: true });
demo.gmailList = async () => ({ messages: [], nextPageToken: null });
demo.gmailGet = async () => { throw new ApiError("", "google_not_connected"); };

// Account settings, reports and push notifications
live.getProfile = () => request("/api/profile", { auth: true });
live.updateProfile = (patch) => request("/api/profile", { method: "PUT", body: patch, auth: true });
live.setAvatar = (dataUrl) => request("/api/profile/avatar", { method: "PUT", body: { dataUrl }, auth: true });
live.removeAvatar = () => request("/api/profile/avatar", { method: "DELETE", auth: true });
live.changePassword = (current, next) => request("/api/account/password", { method: "POST", body: { current, next }, auth: true });
live.deleteAccount = (password) => request("/api/account/delete", { method: "POST", body: { password }, auth: true });
live.sendReport = (report) => request("/api/reports", { method: "POST", body: report, auth: true });
live.pushKey = async () => (await request("/api/push/key")).publicKey;
live.pushSubscribe = (endpoint) => request("/api/push/subscribe", { method: "POST", body: { endpoint }, auth: true });
live.pushUnsubscribe = (endpoint) => request("/api/push/unsubscribe", { method: "POST", body: { endpoint }, auth: true });

// Demo: settings live in this browser.
const DEMO_PROFILE = (email) => `ranilix.demo.profile.${email}`;
const demoProfile = () => {
  try { return { displayName: "", signature: "", avatar: null, ...JSON.parse(localStorage.getItem(DEMO_PROFILE(demoEmail())) || "{}") }; } catch { return { displayName: "", signature: "", avatar: null }; }
};
const saveDemoProfile = (p) => { try { localStorage.setItem(DEMO_PROFILE(demoEmail()), JSON.stringify(p)); } catch { /* ignore */ } };
const publicProfile = (p) => ({ displayName: p.displayName, signature: p.signature, hasAvatar: !!p.avatar, updatedAt: p.updatedAt || 0, avatar: p.avatar || null });
demo.getProfile = async () => publicProfile(demoProfile());
demo.updateProfile = async (patch) => { const p = { ...demoProfile(), ...patch, updatedAt: Date.now() }; saveDemoProfile(p); return publicProfile(p); };
demo.setAvatar = async (dataUrl) => { const p = { ...demoProfile(), avatar: dataUrl, updatedAt: Date.now() }; saveDemoProfile(p); return publicProfile(p); };
demo.removeAvatar = async () => { const p = { ...demoProfile(), avatar: null, updatedAt: Date.now() }; saveDemoProfile(p); return publicProfile(p); };
demo.changePassword = async (current, next) => { await delay(400); if (!current) throw new ApiError("", "wrong_password"); if (!next || next.length < 8) throw new ApiError("", "weak_password"); return { ok: true }; };
demo.deleteAccount = async (password) => { await delay(400); if (!password) throw new ApiError("", "wrong_password"); try { localStorage.removeItem(DEMO_PROFILE(demoEmail())); } catch { /* ignore */ } return { ok: true }; };
demo.sendReport = async ({ message }) => { await delay(400); if (String(message || "").trim().length < 5) throw new ApiError("", "report_short"); return { ok: true }; };
demo.pushKey = async () => null;
demo.pushSubscribe = async () => ({ ok: true });
demo.pushUnsubscribe = async () => ({ ok: true });

// Help window chat. Visitors who aren't logged in get a key from the server the first time they write.
const SUPPORT_KEY = "ranilix.support.key";
const supportOpts = () => {
  const headers = {};
  try { const k = localStorage.getItem(SUPPORT_KEY); if (k) headers["X-Support-Key"] = k; } catch { /* ignore */ }
  return { headers, auth: !!getSession()?.token };
};
live.supportInfo = () => request("/api/support/info");
live.supportThreads = () => request("/api/support/threads", supportOpts());
live.supportThread = (id, after = 0) => request(`/api/support/threads/${id}${after ? `?after=${after}` : ""}`, supportOpts());
live.supportStart = async (payload) => {
  const res = await request("/api/support/threads", { ...supportOpts(), method: "POST", body: payload });
  if (res.guestKey) { try { localStorage.setItem(SUPPORT_KEY, res.guestKey); } catch { /* ignore */ } }
  return res;
};
live.supportSend = (id, message) => request(`/api/support/threads/${id}/messages`, { ...supportOpts(), method: "POST", body: { message } });
live.supportRate = (id, rating) => request(`/api/support/threads/${id}/rate`, { ...supportOpts(), method: "POST", body: { rating } });
demo.supportInfo = supportDemo.info;
demo.supportThreads = async () => supportDemo.userThreads(demoEmail());
demo.supportThread = async (id) => supportDemo.userThread(demoEmail(), id);
demo.supportStart = async (payload) => supportDemo.start(demoEmail(), payload);
demo.supportSend = async (id, message) => supportDemo.send(demoEmail(), id, message);
demo.supportRate = async (id, rating) => supportDemo.rate(demoEmail(), id, rating);

// Auto-reply and temporary addresses
live.getAutoReply = () => request("/api/auto-reply", { auth: true });
live.saveAutoReply = (data) => request("/api/auto-reply", { method: "PUT", body: data, auth: true });
live.tempList = () => request("/api/temp", { auth: true });
live.tempCreate = (hours, label) => request("/api/temp", { method: "POST", body: { hours, label }, auth: true });
live.tempExtend = (address, hours) => request(`/api/temp/${encodeURIComponent(address.split("@")[0])}/extend`, { method: "POST", body: { hours }, auth: true });
live.tempDelete = (address) => request(`/api/temp/${encodeURIComponent(address.split("@")[0])}`, { method: "DELETE", auth: true });

const demoKey = (k) => `ranilix.demo.${k}.${demoEmail()}`;
const demoRead = (k, fallback) => { try { return JSON.parse(localStorage.getItem(demoKey(k)) || "null") ?? fallback; } catch { return fallback; } };
const demoWrite = (k, v) => { try { localStorage.setItem(demoKey(k), JSON.stringify(v)); } catch { /* ignore */ } };
demo.getAutoReply = async () => demoRead("autoreply", { enabled: false, subject: "", body: "", startsAt: null, endsAt: null, updatedAt: 0 });
demo.saveAutoReply = async (d) => {
  await delay(300);
  if (d.enabled && String(d.body || "").trim().length < 2) throw new ApiError("", "autoreply_empty");
  if (d.startsAt && d.endsAt && d.endsAt <= d.startsAt) throw new ApiError("", "autoreply_dates");
  const v = { enabled: !!d.enabled, subject: String(d.subject || ""), body: String(d.body || "").trim(), startsAt: d.startsAt || null, endsAt: d.endsAt || null, updatedAt: Date.now() };
  demoWrite("autoreply", v);
  return v;
};
const demoTemps = () => demoRead("temp", []).filter((a) => a.expiresAt > Date.now());
demo.tempList = async () => ({ allowed: true, max: 5, addresses: demoTemps().sort((a, b) => b.createdAt - a.createdAt) });
demo.tempCreate = async (hours, label) => {
  await delay(300);
  const list = demoTemps();
  if (list.length >= 5) throw new ApiError("", "temp_limit", { max: 5 });
  const abc = "abcdefghijkmnpqrstuvwxyz23456789";
  const local = `tmp-${Array.from({ length: 8 }, () => abc[Math.floor(Math.random() * abc.length)]).join("")}`;
  const now = Date.now();
  const a = { address: `${local}@${BRAND.domain}`, label: String(label || "").slice(0, 40), createdAt: now, expiresAt: now + hours * 3600 * 1000, received: 0 };
  demoWrite("temp", [a, ...list]);
  return a;
};
demo.tempExtend = async (address, hours) => {
  const list = demoTemps();
  const a = list.find((x) => x.address === address);
  if (!a) throw new ApiError("", "temp_not_found");
  a.expiresAt = Math.min(Math.max(Date.now(), a.expiresAt) + hours * 3600 * 1000, Date.now() + 30 * 24 * 3600 * 1000);
  demoWrite("temp", list);
  return a;
};
demo.tempDelete = async (address) => { demoWrite("temp", demoTemps().filter((x) => x.address !== address)); return { ok: true }; };

const api = DEMO_MODE ? demo : live;

export const {
  checkUsernameAvailable, signUp, logIn, logOut,
  listMessages, updateMessage, deleteMessage, sendMessage, downloadAttachment,
  getMe, getAnnouncement, checkLatest,
  googleStatus, googleStart, googleDisconnect, gmailList, gmailGet,
  getProfile, updateProfile, setAvatar, removeAvatar, changePassword, deleteAccount, sendReport,
  pushKey, pushSubscribe, pushUnsubscribe,
  supportInfo, supportThreads, supportThread, supportStart, supportSend, supportRate,
  getAutoReply, saveAutoReply, tempList, tempCreate, tempExtend, tempDelete,
} = api;
