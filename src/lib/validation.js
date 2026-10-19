// Shared form rules (the server checks the same ones).
// Validators return { key, vars } for the translation, or null when valid.

export const USERNAME_MIN = 4;
export const USERNAME_MAX = 30;
export const PASSWORD_MIN = 8;

/** Lowercase and strip anything that isn't a valid address character. */
export function sanitizeUsername(value) {
  return value.toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, USERNAME_MAX);
}

export function validateUsername(u) {
  if (!u) return { key: "validation.pickName" };
  if (u.length < USERNAME_MIN) return { key: "validation.minChars", vars: { n: USERNAME_MIN } };
  if ((u.match(/[a-z0-9]/g) || []).length < USERNAME_MIN) return { key: "validation.minAlnum", vars: { n: USERNAME_MIN } };
  if (!/^[a-z0-9]/.test(u) || !/[a-z0-9]$/.test(u)) return { key: "validation.startEnd" };
  if (/[._-]{2,}/.test(u)) return { key: "validation.doubleSymbol" };
  return null;
}

/** Password strength 0–4 plus which of the four checks pass (labels come from signup.checks). */
export function passwordChecks(pw) {
  const checks = [
    pw.length >= PASSWORD_MIN,
    /[a-z]/.test(pw) && /[A-Z]/.test(pw),
    /\d/.test(pw),
    /[^A-Za-z0-9]/.test(pw),
  ];
  return { checks, score: checks.filter(Boolean).length };
}

export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}
