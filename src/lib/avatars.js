// Profile photos of Ranilix users. Live: served by the API at /api/avatar/<name>.
// Demo: only your own photo, kept in this browser.
import { useSyncExternalStore } from "react";
import { API_URL, BRAND, DEMO_MODE } from "../config.js";

let version = Date.now();
const missing = new Set(); // names with no photo (avoids asking again while the page is open)
const listeners = new Set();

/** Call after the user changes their photo so every avatar on the page reloads. */
export function bumpAvatars() {
  version = Date.now();
  missing.clear();
  listeners.forEach((l) => l());
}
export function markMissing(name) { missing.add(name); }

export function useAvatarVersion() {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => version);
}

/** Photo URL for a Ranilix address, or null. */
export function avatarUrl(email) {
  const [local, domain] = String(email || "").toLowerCase().split("@");
  if (domain !== BRAND.domain || !local || missing.has(local)) return null;
  if (DEMO_MODE) {
    try { return JSON.parse(localStorage.getItem(`ranilix.demo.profile.${local}@${domain}`) || "{}").avatar || null; } catch { return null; }
  }
  return `${API_URL}/api/avatar/${encodeURIComponent(local)}?v=${version}`;
}
