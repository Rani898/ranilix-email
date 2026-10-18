// Shared form rules. Keep these in sync with the backend when you build it (Step 2+).

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;
export const PASSWORD_MIN = 8;

/** Lowercase and strip anything that isn't a valid address character. */
export function sanitizeUsername(value) {
  return value.toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, USERNAME_MAX);
}

/** Returns an error string, or "" when valid. */
export function validateUsername(u) {
  if (!u) return "Pick a name for your address.";
  if (u.length < USERNAME_MIN) return `Use at least ${USERNAME_MIN} characters.`;
  if (!/^[a-z0-9]/.test(u) || !/[a-z0-9]$/.test(u)) return "Start and end with a letter or number.";
  if (/[._-]{2,}/.test(u)) return "Avoid two symbols in a row.";
  return "";
}

/** Password strength 0–4 plus the checklist used in the UI. */
export function passwordChecks(pw) {
  const checks = [
    { label: `At least ${PASSWORD_MIN} characters`, ok: pw.length >= PASSWORD_MIN },
    { label: "Upper & lowercase letters", ok: /[a-z]/.test(pw) && /[A-Z]/.test(pw) },
    { label: "A number", ok: /\d/.test(pw) },
    { label: "A symbol (e.g. ! @ #)", ok: /[^A-Za-z0-9]/.test(pw) },
  ];
  const score = checks.filter((c) => c.ok).length;
  return { checks, score };
}
