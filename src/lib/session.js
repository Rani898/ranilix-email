// Signed-in accounts kept in this browser, so people can switch between several addresses.
// "Remember me" accounts live in localStorage; the others in sessionStorage (gone when the tab closes).
// The active account is stored per tab (sessionStorage) and as the default for new tabs (localStorage).

import { useSyncExternalStore } from "react";

const LIST = "ranilix.accounts";
const ACTIVE = "ranilix.active";
const LEGACY = "ranilix.session";
const EVENT = "ranilix-session";

function read(storage, key) {
  try { return JSON.parse(storage.getItem(key)); } catch { return null; }
}
function write(storage, key, value) {
  try {
    if (value == null) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(value));
  } catch { /* storage blocked */ }
}

// One-time move from the old single-session format.
function migrate() {
  for (const storage of [localStorage, sessionStorage]) {
    try {
      const old = read(storage, LEGACY);
      if (!old?.email) continue;
      const list = read(storage, LIST) || [];
      if (!list.some((a) => a.email === old.email)) write(storage, LIST, [...list, old]);
      if (!read(sessionStorage, ACTIVE)) write(sessionStorage, ACTIVE, old.email);
      if (storage === localStorage && !read(localStorage, ACTIVE)) write(localStorage, ACTIVE, old.email);
      storage.removeItem(LEGACY);
    } catch { /* ignore */ }
  }
}
try { migrate(); } catch { /* ignore */ }

/** Every account signed in on this browser, without duplicates. */
export function getAccounts() {
  const seen = new Set();
  const out = [];
  for (const storage of [localStorage, sessionStorage]) {
    for (const a of read(storage, LIST) || []) {
      if (a?.email && !seen.has(a.email)) { seen.add(a.email); out.push(a); }
    }
  }
  return out;
}

/** The account in use in this tab (falls back to the first saved one). */
export function getSession() {
  const accounts = getAccounts();
  if (!accounts.length) return null;
  const active = read(sessionStorage, ACTIVE) || read(localStorage, ACTIVE);
  return accounts.find((a) => a.email === active) || accounts[0];
}

let version = 0;
function changed() {
  version++;
  try { window.dispatchEvent(new Event(EVENT)); } catch { /* ignore */ }
}

function setActive(email) {
  write(sessionStorage, ACTIVE, email);
  write(localStorage, ACTIVE, email);
}

/** Add (or refresh) an account and make it the active one. */
export function startSession({ email, token = null }, remember = true) {
  const entry = { email, token, at: Date.now() };
  for (const storage of [localStorage, sessionStorage]) {
    write(storage, LIST, (read(storage, LIST) || []).filter((a) => a.email !== email));
  }
  const storage = remember ? localStorage : sessionStorage;
  write(storage, LIST, [...(read(storage, LIST) || []), entry]);
  setActive(email);
  changed();
}

/** Switch this tab to another saved account. */
export function switchAccount(email) {
  if (!getAccounts().some((a) => a.email === email)) return;
  setActive(email);
  changed();
}

/** Remove one account (default: the active one). Another saved account, if any, becomes active. */
export function endSession(email = getSession()?.email) {
  for (const storage of [localStorage, sessionStorage]) {
    write(storage, LIST, (read(storage, LIST) || []).filter((a) => a.email !== email));
  }
  const next = getAccounts()[0];
  if (next) setActive(next.email);
  else { write(sessionStorage, ACTIVE, null); write(localStorage, ACTIVE, null); }
  changed();
}

function subscribe(cb) {
  const onStorage = (e) => { if (!e.key || e.key === LIST || e.key === ACTIVE) { version++; cb(); } };
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener("storage", onStorage); };
}

/** Re-renders when the active account or the account list changes. Returns a change counter. */
export function useSessionVersion() {
  return useSyncExternalStore(subscribe, () => version);
}
