// A personal look for the site ("skin"). Saved on the server for the account, and kept on this
// device too so the look is there right away (also on pages before logging in).
import { useEffect, useState } from "react";
import { API_URL } from "../config.js";

// The server gives the picture as "/api/...": it lives on the API, not on the site.
export const skinImage = (src) => (src && src.startsWith("/api/") ? `${API_URL}${src}` : src);

const KEY = "ranilix.skin";
const DEFAULT = { skin: "default", nickname: "", background: null, sticker: null };
let current = read();
const listeners = new Set();

function read() {
  try { return { ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return { ...DEFAULT }; }
}

function loadFont() {
  if (document.getElementById("skin-font")) return;
  const l = document.createElement("link");
  l.id = "skin-font"; l.rel = "stylesheet";
  l.href = "https://fonts.googleapis.com/css2?family=Varela+Round&display=swap";
  document.head.appendChild(l);
}

function paint(s) {
  const root = document.documentElement;
  if (s.skin === "noya") loadFont();
  if (s.skin && s.skin !== "default") root.dataset.skin = s.skin;
  else delete root.dataset.skin;
  if (s.background) root.style.setProperty("--skin-bg", `url("${String(skinImage(s.background)).replace(/"/g, "%22")}")`);
  else root.style.removeProperty("--skin-bg");
  root.toggleAttribute("data-skin-photo", !!s.background);
  if (s.sticker) root.style.setProperty("--skin-sticker", `url("${String(skinImage(s.sticker)).replace(/"/g, "%22")}")`);
  else root.style.removeProperty("--skin-sticker");
}

/** Use the look from the server (or reset it with null). */
export function applySkin(s) {
  current = { ...DEFAULT, ...(s || {}) };
  try {
    if (current.skin === "default" && !current.background && !current.sticker) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(current));
  } catch { /* ignore */ }
  paint(current);
  listeners.forEach((fn) => fn(current));
}

export function bootSkin() { paint(current); }

export function useSkin() {
  const [s, setS] = useState(current);
  useEffect(() => { listeners.add(setS); setS(current); return () => listeners.delete(setS); }, []);
  return s;
}
