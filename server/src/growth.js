// Growth features: invite-a-friend (with Drive bonus) and the "Sent with Ranilix" mail footer.
const MB = 1024 * 1024;
export const REF_BONUS_MB = 100;      // for the person who invited, per friend who joined
export const REF_WELCOME_MB = 50;     // for the friend who joined through an invite
export const REF_MAX_REWARDS = 10;    // bonus stops growing after this many friends

/** Extra Drive bytes this user earned through invites. */
export async function referralBonusBytes(env, userId) {
  const n = (await env.DB.prepare("SELECT COUNT(*) AS n FROM referrals WHERE referrer_id = ?").bind(userId).first())?.n || 0;
  const joined = await env.DB.prepare("SELECT 1 FROM referrals WHERE referred_id = ?").bind(userId).first();
  return (Math.min(n, REF_MAX_REWARDS) * REF_BONUS_MB + (joined ? REF_WELCOME_MB : 0)) * MB;
}

/** Called after a brand-new (not "another address") sign-up. Returns the referrer's username or null. */
export async function recordReferral(env, newUserId, ref) {
  const name = String(ref || "").toLowerCase().replace(/@.*$/, "").trim();
  if (!name || !/^[a-z0-9._-]{1,40}$/.test(name)) return null;
  const row = await env.DB.prepare("SELECT id, username FROM users WHERE username = ?").bind(name).first();
  if (!row || row.id === newUserId) return null;
  await env.DB.prepare("INSERT OR IGNORE INTO referrals (referred_id, referrer_id, created_at) VALUES (?, ?, ?)").bind(newUserId, row.id, Date.now()).run();
  return row.username;
}

export async function inviteInfo(env, user) {
  const count = (await env.DB.prepare("SELECT COUNT(*) AS n FROM referrals WHERE referrer_id = ?").bind(user.id).first())?.n || 0;
  return {
    code: user.username,
    count,
    bonusMb: Math.min(count, REF_MAX_REWARDS) * REF_BONUS_MB,
    perFriendMb: REF_BONUS_MB,
    friendMb: REF_WELCOME_MB,
    maxRewards: REF_MAX_REWARDS,
  };
}

export async function promoFooterOn(env, userId) {
  return !(await env.DB.prepare("SELECT 1 FROM promo_footer_off WHERE user_id = ?").bind(userId).first());
}
export async function setPromoFooter(env, userId, on) {
  if (on) await env.DB.prepare("DELETE FROM promo_footer_off WHERE user_id = ?").bind(userId).run();
  else await env.DB.prepare("INSERT OR REPLACE INTO promo_footer_off (user_id, at) VALUES (?, ?)").bind(userId, Date.now()).run();
}

/** The line added under mail sent to other providers. Bilingual, plain text, carries the invite. */
export function promoFooter(env, username) {
  const site = env.SITE_URL || "https://ranilix.com";
  return `\n\n--\nנשלח מ-Ranilix · אימייל חינם לתמיד · Sent with Ranilix, free email forever\n${site}/signup?ref=${encodeURIComponent(username)}`;
}
