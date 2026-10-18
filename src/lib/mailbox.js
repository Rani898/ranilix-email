import { BRAND } from "../config.js";

// Demo-mode mailbox kept in this browser (used only when no API server is configured).

const keyFor = (email) => `ranilix.mailbox.${email}`;

function currentLang() {
  try { return localStorage.getItem("ranilix.lang") || "en"; } catch { return "en"; }
}

const TEXT = {
  en: {
    welcomeSubject: "Welcome to your new inbox 🎉",
    welcomeBody: (email) => `Hi there,\n\nYour free address ${email} is ready to use.\n\nA few things you can do right now:\n• Write your first email with the Compose button\n• Reply to or forward any message\n• Attach photos and documents\n• Switch between light and dark mode, or English and Hebrew\n\nRanilix Email is free forever. No credit card, no hidden fees.\n\nEnjoy,\nThe Ranilix Team`,
    securitySubject: "Tips to keep your account safe",
    securityBody: "Hi,\n\nA strong, unique password is the best protection for your inbox.\n\n• Never share your password with anyone, including people who say they work for Ranilix.\n• Be careful with links in emails asking you to sign in.\n• Log out when you use a shared computer.\n\nStay safe,\nRanilix Security",
    tipsSubject: "Get the most out of Ranilix Email",
    tipsBody: "Hello!\n\nDid you know you can open your inbox from any phone, tablet or computer? Just go to the Ranilix site and log in.\n\nTurn on notifications in the sidebar to get a pop-up when new mail arrives.\n\nThe Ranilix Team",
  },
  he: {
    welcomeSubject: "ברוכים הבאים לתיבת הדואר החדשה 🎉",
    welcomeBody: (email) => `היי,\n\nהכתובת החינמית שלך ${email} מוכנה לשימוש.\n\nכמה דברים שאפשר לעשות כבר עכשיו:\n• לכתוב מייל ראשון עם הכפתור "כתיבת הודעה"\n• לענות או להעביר כל הודעה\n• לצרף תמונות ומסמכים\n• לעבור בין מצב בהיר לכהה, ובין עברית לאנגלית\n\nRanilix Email חינמי לתמיד. בלי כרטיס אשראי ובלי עלויות נסתרות.\n\nתהנו,\nצוות Ranilix`,
    securitySubject: "טיפים לשמירה על החשבון",
    securityBody: "היי,\n\nסיסמה חזקה וייחודית היא ההגנה הכי טובה על תיבת הדואר שלך.\n\n• אף פעם אל תמסרו את הסיסמה לאף אחד, גם לא למי שאומר שהוא עובד ב-Ranilix.\n• היזהרו מקישורים במיילים שמבקשים מכם להתחבר.\n• התנתקו כשאתם משתמשים במחשב משותף.\n\nשמרו על עצמכם,\nאבטחת Ranilix",
    tipsSubject: "איך להפיק את המקסימום מ-Ranilix",
    tipsBody: "שלום!\n\nידעתם שאפשר לפתוח את תיבת הדואר מכל טלפון, טאבלט או מחשב? פשוט נכנסים לאתר של Ranilix ומתחברים.\n\nהפעילו התראות בתפריט הצד כדי לקבל הודעה קופצת כשמגיע מייל חדש.\n\nצוות Ranilix",
  },
};

function welcomeMessages(email) {
  const tx = TEXT[currentLang()] || TEXT.en;
  const now = Date.now();
  const h = 3600 * 1000;
  return [
    { id: "welcome", folder: "inbox", from: { name: "Ranilix Team", email: `team@${BRAND.domain}` }, to: email, subject: tx.welcomeSubject, body: tx.welcomeBody(email), date: now - 2 * 60 * 1000, read: false, starred: true, attachments: [] },
    { id: "security", folder: "inbox", from: { name: "Ranilix Security", email: `security@${BRAND.domain}` }, to: email, subject: tx.securitySubject, body: tx.securityBody, date: now - h, read: false, starred: false, attachments: [] },
    { id: "tips", folder: "inbox", from: { name: "Ranilix Tips", email: `tips@${BRAND.domain}` }, to: email, subject: tx.tipsSubject, body: tx.tipsBody, date: now - 26 * h, read: true, starred: false, attachments: [] },
  ];
}

export function loadMailbox(email) {
  try {
    const raw = localStorage.getItem(keyFor(email));
    if (raw) return JSON.parse(raw);
  } catch { /* fall through */ }
  return welcomeMessages(email);
}

/** Saves the demo mailbox. With throwOnError, a full browser storage throws instead of failing silently. */
export function saveMailbox(email, messages, throwOnError = false) {
  try {
    localStorage.setItem(keyFor(email), JSON.stringify(messages));
  } catch (err) {
    if (throwOnError) throw err;
  }
}
