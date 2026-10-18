// TEMPORARY mock API for Step 1 — lets the forms work end-to-end in the browser.
// Replace each function with a real fetch() to your backend in a later step.
// Never do real auth on the client: the server must hash passwords and issue sessions.

const RESERVED = new Set(["admin", "support", "help", "info", "root", "postmaster", "abuse", "noreply", "security", "ranilix"]);
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

export async function checkUsernameAvailable(username) {
  await delay(400);
  return !RESERVED.has(username);
}

export async function signUp({ username, password }) {
  await delay(900);
  if (RESERVED.has(username)) throw new Error("That address was just taken. Try another one.");
  // Real version: POST /api/auth/signup  { username, password }
  return { email: `${username}@ranilix.com` };
}

export async function logIn({ email, password }) {
  await delay(800);
  // Real version: POST /api/auth/login  { email, password }
  if (!email || !password) throw new Error("Please fill in both fields.");
  return { email };
}
