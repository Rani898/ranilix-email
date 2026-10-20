// Install-as-app support and push notifications ("new mail" even when the site is closed).
import { useEffect, useState } from "react";
import { DEMO_MODE } from "../config.js";
import { pushKey, pushSubscribe, pushUnsubscribe } from "./api.js";

const BASE = import.meta.env.BASE_URL;
const swSupported = typeof navigator !== "undefined" && "serviceWorker" in navigator;
export const pushSupported = swSupported && typeof window !== "undefined" && "PushManager" in window && "Notification" in window;

let deferredPrompt = null;
const listeners = new Set();
const notify = () => listeners.forEach((l) => l());

export function isStandalone() {
  try {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  } catch { return false; }
}
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/** Called once at startup. */
export function setupPwa() {
  if (typeof window === "undefined") return;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredPrompt = e; notify(); });
  window.addEventListener("appinstalled", () => { deferredPrompt = null; notify(); });
  if (swSupported && import.meta.env.PROD && !import.meta.env.VITE_MEMORY_ROUTER) {
    navigator.serviceWorker.register(`${BASE}sw.js`, { scope: BASE }).catch(() => {});
  }
}

/** Tell the service worker which language to use for notifications. */
export function shareLang(lang) {
  if (!swSupported) return;
  navigator.serviceWorker.ready.then((reg) => reg.active?.postMessage({ lang })).catch(() => {});
}

/** { canPrompt, installed, ios, install() } — canPrompt is true on Android/desktop Chrome & Edge. */
export function useInstall() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => listeners.delete(l);
  }, []);
  return {
    canPrompt: !!deferredPrompt,
    installed: isStandalone(),
    ios: isIOS(),
    async install() {
      if (!deferredPrompt) return false;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice.catch(() => ({ outcome: "dismissed" }));
      deferredPrompt = null;
      notify();
      return outcome === "accepted";
    },
  };
}

function keyBytes(base64url) {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function currentSubscription(create) {
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub && create) {
    const key = await pushKey();
    if (!key) return null;
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
  }
  return sub;
}

/** Ask for permission (if needed) and register this device for the signed-in account. Returns the permission. */
export async function enablePush() {
  if (!pushSupported || DEMO_MODE) return typeof Notification !== "undefined" ? Notification.permission : "unsupported";
  const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (permission !== "granted") return permission;
  try {
    const sub = await currentSubscription(true);
    if (sub) await pushSubscribe(sub.endpoint);
  } catch { /* the in-page notifications still work */ }
  return permission;
}

/** Re-link this device to the account in use (after switching accounts). Never prompts. */
export async function syncPush() {
  if (!pushSupported || DEMO_MODE || Notification.permission !== "granted") return;
  try {
    const sub = await currentSubscription(true);
    if (sub) await pushSubscribe(sub.endpoint);
  } catch { /* ignore */ }
}

/** Stop push for the signed-in account on this device (before logging out). */
export async function unlinkPush() {
  if (!pushSupported || DEMO_MODE) return;
  try {
    const sub = await currentSubscription(false);
    if (sub) await pushUnsubscribe(sub.endpoint);
  } catch { /* ignore */ }
}
