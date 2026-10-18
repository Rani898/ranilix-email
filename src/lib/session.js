// Keeps the signed-in user's email and API token in the browser.
// "Remember me" → localStorage; otherwise sessionStorage (cleared when the tab closes).

const KEY = "ranilix.session";

function safeGet(storage) {
  try { return JSON.parse(storage.getItem(KEY)); } catch { return null; }
}

export function getSession() {
  return safeGet(localStorage) || safeGet(sessionStorage);
}

export function startSession({ email, token = null }, remember = true) {
  const data = JSON.stringify({ email, token, at: Date.now() });
  try {
    endSession();
    (remember ? localStorage : sessionStorage).setItem(KEY, data);
  } catch { /* storage blocked */ }
}

export function endSession() {
  try { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}
