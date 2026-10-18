// TEMPORARY client-side session for the demo. A real backend will replace this with
// an HttpOnly session cookie — never trust client storage for real authentication.

const KEY = "ranilix.session";

function safeGet(storage) {
  try { return JSON.parse(storage.getItem(KEY)); } catch { return null; }
}

export function getSession() {
  return safeGet(localStorage) || safeGet(sessionStorage);
}

export function startSession(email, remember = true) {
  const data = JSON.stringify({ email, at: Date.now() });
  try {
    (remember ? localStorage : sessionStorage).setItem(KEY, data);
  } catch { /* storage blocked — session lasts until refresh */ }
}

export function endSession() {
  try { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}
