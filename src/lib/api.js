// All calls the site makes to the Ranilix server.
// With VITE_API_URL set, these talk to the real Cloudflare Worker.
// Without it (demo mode), they use a fake in-browser backend so the site still works.

import { API_URL, BRAND, DEMO_MODE } from "../config.js";
import { getSession } from "./session.js";
import { loadMailbox, saveMailbox } from "./mailbox.js";
import { formatBytes } from "./validation.js";

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

export async function request(path, { method = "GET", body, form, auth = false, raw = false } = {}) {
  const headers = {};
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
  signUp: ({ username, password }) => request("/api/signup", { method: "POST", body: { username, password, lang: document.documentElement.lang || "en" } }),
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
  return { email, isAdmin: email?.split("@")[0] === "rani" };
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

const api = DEMO_MODE ? demo : live;

export const {
  checkUsernameAvailable, signUp, logIn, logOut,
  listMessages, updateMessage, deleteMessage, sendMessage, downloadAttachment,
  getMe, getAnnouncement, checkLatest,
  googleStatus, googleStart, googleDisconnect, gmailList, gmailGet,
} = api;
