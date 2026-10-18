// All calls the site makes to the Ranilix server.
// With VITE_API_URL set, these talk to the real Cloudflare Worker.
// Without it (demo mode), they use a fake in-browser backend so the site still works.

import { API_URL, BRAND, DEMO_MODE } from "../config.js";
import { getSession } from "./session.js";
import { loadMailbox, saveMailbox } from "./mailbox.js";

export class AuthError extends Error {}

async function request(path, { method = "GET", body, auth = false } = {}) {
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
  if (auth) headers.Authorization = `Bearer ${getSession()?.token || ""}`;
  let res;
  try {
    res = await fetch(API_URL + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error("Can't reach the server. Check your internet connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && auth) throw new AuthError(data.error || "Please log in again.");
  if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}

/* ---------------- Demo backend ---------------- */

const RESERVED = new Set(["admin", "support", "help", "info", "root", "postmaster", "abuse", "noreply", "security", "ranilix", "team", "tips"]);
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const demoEmail = () => getSession()?.email;

const demo = {
  async checkUsernameAvailable(u) { await delay(300); return !RESERVED.has(u); },
  async signUp({ username }) {
    await delay(700);
    if (RESERVED.has(username)) throw new Error("Sorry, that name is taken. Try another.");
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
  async sendMessage({ to, subject, body }) {
    await delay(400);
    const email = demoEmail();
    const msg = { id: `m${Date.now()}`, folder: "sent", from: { name: email.split("@")[0], email }, to, subject, body, date: Date.now(), read: true, starred: false };
    const extra = to.split(", ").includes(email) ? [{ ...msg, id: msg.id + "i", folder: "inbox", read: false }] : [];
    saveMailbox(email, [msg, ...extra, ...loadMailbox(email)]);
  },
};

/* ---------------- Real backend ---------------- */

const live = {
  async checkUsernameAvailable(u) {
    const { available } = await request(`/api/username-available?u=${encodeURIComponent(u)}`);
    return available;
  },
  signUp: ({ username, password }) => request("/api/signup", { method: "POST", body: { username, password } }),
  logIn: ({ email, password, remember }) => request("/api/login", { method: "POST", body: { email, password, remember } }),
  async logOut() { try { await request("/api/logout", { method: "POST", auth: true }); } catch { /* ignore */ } },
  async listMessages() { return (await request("/api/messages", { auth: true })).messages; },
  updateMessage: (id, patch) => request(`/api/messages/${id}`, { method: "PATCH", body: patch, auth: true }),
  deleteMessage: (id) => request(`/api/messages/${id}`, { method: "DELETE", auth: true }),
  sendMessage: (msg) => request("/api/send", { method: "POST", body: msg, auth: true }),
};

const api = DEMO_MODE ? demo : live;

export const {
  checkUsernameAvailable, signUp, logIn, logOut,
  listMessages, updateMessage, deleteMessage, sendMessage,
} = api;
