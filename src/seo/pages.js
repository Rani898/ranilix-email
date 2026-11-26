// Search pages: one page per thing people actually type into Google.
// Used by the React page (src/pages/SeoPage.jsx) and by scripts/seo-prerender.mjs, which writes a
// static HTML copy of every page (own title, description and text) so Google reads it without JS.
// Plain data only (no JSX) so Node can import it at build time.

export const SITE = "https://ranilix.com";

export const SEO_PAGES = [
  {
    slug: "free-email",
    kind: "landing",
    icon: "Mail",
    he: {
      title: "אימייל חינם בעברית · פתיחת תיבת מייל חינם | Ranilix",
      description: "פתחו אימייל חינם בכתובת @ranilix.com תוך דקה. בלי כרטיס אשראי, בלי מספר טלפון ובלי פרסומות. ממשק מלא בעברית, בטלפון ובמחשב.",
      h1: "אימייל חינם, באמת חינם",
      lead: "כתובת @ranilix.com משלכם תוך דקה. בוחרים שם וסיסמה, ונכנסים. בלי כרטיס אשראי, בלי מספר טלפון ובלי תקופת ניסיון שנגמרת.",
      sections: [
        { h: "מה מקבלים בחינם", p: ["תיבת דואר מלאה בכתובת שאתם בוחרים, עד 5 כתובות לכל אדם, דרייב לקבצים, יומן, סורק קבלות ועוזר AI שעונה בעברית. הכול באותו חשבון ובלי לשלם."] },
        { h: "בלי פרסומות ובלי מכירת מידע", p: ["אנחנו לא מציגים פרסומות בתיבה ולא קוראים את המיילים שלכם כדי לפרסם לכם. המידע שלכם נשאר שלכם, ואפשר למחוק את החשבון בכל רגע."] },
        { h: "עובד בכל מכשיר", p: ["התיבה נפתחת בכל דפדפן מודרני, בטלפון, בטאבלט ובמחשב. אפשר גם להתקין אותה כאפליקציה במסך הבית ולקבל התראות על מיילים חדשים."] },
        { h: "עברית מהיסוד", p: ["הממשק נבנה מימין לשמאל, עם תמיכה מלאה בעברית ובאנגלית ובמצב כהה. לא תרגום של ממשק זר."] },
      ],
      faq: [
        { q: "זה באמת בחינם לתמיד?", a: "כן. פתיחת החשבון והשימוש בו לא עולים כסף, ואין תקופת ניסיון. אנחנו אף פעם לא מבקשים כרטיס אשראי." },
        { q: "כמה זמן לוקח לפתוח תיבה?", a: "בערך דקה: בוחרים שם משתמש וסיסמה, מאשרים, והתיבה מוכנה." },
        { q: "איזו כתובת אקבל?", a: "שם שתבחרו, ואחריו @ranilix.com. למשל: dana@ranilix.com." },
      ],
    },
    en: {
      title: "Free email account in a minute | Ranilix",
      description: "Get a free @ranilix.com email in a minute. No credit card, no phone number, no ads. Works on phone and computer, in English and Hebrew.",
      h1: "Free email that's actually free",
      lead: "Your own @ranilix.com address in about a minute. Pick a name and a password and you're in. No credit card, no phone number, no trial that runs out.",
      sections: [
        { h: "What you get for free", p: ["A full inbox at the address you choose, up to 5 addresses per person, a Drive for files, a calendar, a receipts scanner and an AI helper. All in one account, at no cost."] },
        { h: "No ads, no selling your data", p: ["We don't show ads in your inbox and don't read your mail to target you. Your data stays yours, and you can delete the account at any time."] },
        { h: "Works on every device", p: ["Open your inbox in any modern browser on phone, tablet or computer. You can also install it as an app and get notified about new mail."] },
      ],
      faq: [
        { q: "Is it really free forever?", a: "Yes. Creating and using the account costs nothing and there's no trial period. We never ask for a credit card." },
        { q: "How long does sign-up take?", a: "About a minute: pick a username and a password, confirm, and your inbox is ready." },
        { q: "What address will I get?", a: "The name you choose followed by @ranilix.com, for example dana@ranilix.com." },
      ],
    },
  },
  {
    slug: "email-without-phone",
    kind: "landing",
    icon: "PhoneOff",
    he: {
      title: "פתיחת מייל בלי מספר טלפון · חינם | Ranilix",
      description: "צריכים כתובת מייל בלי למסור מספר טלפון? ב-Ranilix פותחים תיבה חינם עם שם וסיסמה בלבד. בלי SMS, בלי כרטיס אשראי, תוך דקה.",
      h1: "פתיחת מייל בלי מספר טלפון",
      lead: "ב-Ranilix לא מבקשים מספר טלפון כדי לפתוח תיבה. בוחרים שם משתמש וסיסמה, וזהו. בלי קוד ב-SMS ובלי כרטיס אשראי.",
      sections: [
        { h: "למה בכלל לא למסור טלפון?", p: ["הרבה אנשים לא רוצים לקשר את המספר הפרטי לכל חשבון ברשת, או פותחים מייל לילד, לעסק קטן או לפרויקט. כשהמספר לא נמסר, יש פחות מידע אישי שיכול לדלוף."] },
        { h: "איך פותחים", p: ["נכנסים לעמוד ההרשמה, בוחרים שם (הוא יהיה הכתובת שלכם), בוחרים סיסמה חזקה ומאשרים. התיבה נפתחת מיד, עם מייל ברוכים הבאים שמחכה בפנים."] },
        { h: "ומה אם אשכח את הסיסמה?", p: ["כיוון שאין טלפון לשחזור, חשוב לבחור סיסמה שתזכרו או לשמור אותה במנהל סיסמאות. אפשר גם להישאר מחוברים במכשיר הקבוע שלכם."] },
      ],
      faq: [
        { q: "באמת אין שום אימות טלפוני?", a: "נכון. ההרשמה דורשת רק שם משתמש וסיסמה." },
        { q: "אפשר לפתוח יותר מכתובת אחת?", a: "כן, עד 5 כתובות לכל אדם, ועוברים ביניהן בלחיצה." },
        { q: "זה חוקי ובטוח?", a: "כן. זו תיבת דואר רגילה לכל דבר. הגבלות שימוש נגד ספאם שומרות על השירות נקי." },
      ],
    },
    en: {
      title: "Create an email without a phone number · Free | Ranilix",
      description: "Need an email address without giving your phone number? Ranilix needs only a name and a password. No SMS code, no credit card, ready in a minute.",
      h1: "Create an email without a phone number",
      lead: "Ranilix doesn't ask for a phone number to open an inbox. Pick a username and a password and that's it. No SMS code, no credit card.",
      sections: [
        { h: "Why skip the phone number?", p: ["Many people don't want their private number tied to every online account, or open an email for a kid, a small business or a project. Less personal data means less that can leak."] },
        { h: "How to sign up", p: ["Open the sign-up page, choose a name (it becomes your address), pick a strong password and confirm. Your inbox opens right away."] },
        { h: "What if I forget my password?", p: ["Since there's no phone to recover with, choose a password you'll remember or keep it in a password manager. You can also stay signed in on your own device."] },
      ],
      faq: [
        { q: "Is there really no phone verification?", a: "Right. Sign-up needs only a username and a password." },
        { q: "Can I open more than one address?", a: "Yes, up to 5 addresses per person, and you switch between them in one tap." },
        { q: "Is it safe?", a: "Yes. It's a regular inbox in every way, with anti-spam limits that keep the service clean." },
      ],
    },
  },
  {
    slug: "temp-email",
    kind: "landing",
    icon: "Hourglass",
    he: {
      title: "מייל זמני להרשמות? יש דרך טובה יותר | Ranilix",
      description: "רוצים כתובת להרשמות לאתרים בלי להציף את המייל הראשי? פתחו כתובת נוספת חינם ב-Ranilix, שנשארת שלכם וגם מגינה מספאם.",
      h1: "מייל זמני להרשמות, בלי לאבד את החשבון",
      lead: "אתרי \"מייל זמני\" נוחים לרגע, אבל הכתובת נעלמת, ואם תצטרכו לשחזר סיסמה באתר שנרשמתם אליו, המייל כבר לא יגיע. ב-Ranilix אפשר לפתוח כתובת נוספת להרשמות, והיא נשארת שלכם.",
      sections: [
        { h: "הבעיה עם אתרי מייל זמני", p: ["הכתובות שם ציבוריות או נמחקות אחרי כמה דקות. כל אחד שמנחש את הכתובת יכול לקרוא את המיילים, ואתרים רבים חוסמים אותן בכלל."] },
        { h: "הפתרון: כתובת נפרדת להרשמות", p: ["פתחו כתובת שנייה בחשבון שלכם, למשל dana.shop@ranilix.com, והשתמשו בה לחנויות, למבצעים ולאתרים שאתם לא סומכים עליהם. המייל הראשי נשאר נקי, ואתם עדיין מקבלים קודי אימות ושחזורי סיסמה."] },
        { h: "כתובות מגן וכתובות זמניות", p: ["בחשבונות שהאפשרות פתוחה בהם אפשר גם ליצור כתובת מגן נפרדת לכל אתר, או כתובת זמנית שנמחקת לבד אחרי הזמן שבחרתם. אם אתר מתחיל לשלוח ספאם, פשוט מוחקים את הכתובת שלו."] },
      ],
      faq: [
        { q: "כמה כתובות אפשר לפתוח?", a: "עד 5 כתובות קבועות לכל אדם, בחינם." },
        { q: "המיילים מכל הכתובות מגיעים לאותו מקום?", a: "כל כתובת קבועה היא תיבה משלה, ועוברים ביניהן בלחיצה. כתובות מגן מגיעות ישר לתיבה הראשית." },
        { q: "זה עולה משהו?", a: "לא. הכול חינם." },
      ],
    },
    en: {
      title: "Temp email for sign-ups? There's a better way | Ranilix",
      description: "Want an address for website sign-ups without flooding your main inbox? Open an extra free Ranilix address that stays yours and keeps spam away.",
      h1: "A sign-up email that doesn't disappear",
      lead: "Temp-mail sites are handy for a minute, but the address vanishes, and when you need a password reset the mail never arrives. With Ranilix you open an extra address for sign-ups, and it stays yours.",
      sections: [
        { h: "The problem with temp-mail sites", p: ["Their addresses are public or deleted after minutes. Anyone who guesses the address can read the mail, and many sites block them outright."] },
        { h: "The fix: a separate sign-up address", p: ["Open a second address in your account, like dana.shop@ranilix.com, and use it for shops, deals and sites you don't trust. Your main inbox stays clean and you still get codes and resets."] },
        { h: "Shield and temporary addresses", p: ["Where it's enabled for your account you can also create a shield address per website, or a temporary address that deletes itself. If a site starts spamming, delete its address."] },
      ],
      faq: [
        { q: "How many addresses can I open?", a: "Up to 5 permanent addresses per person, free." },
        { q: "Does all the mail land in one place?", a: "Each permanent address is its own inbox and you switch in one tap. Shield addresses go straight to your main inbox." },
        { q: "Does it cost anything?", a: "No. Everything is free." },
      ],
    },
  },
  {
    slug: "gmail-alternative",
    kind: "landing",
    icon: "Repeat",
    he: {
      title: "אלטרנטיבה לג׳ימייל בעברית · מייל חינם ופרטי | Ranilix",
      description: "מחפשים חלופה לג׳ימייל? Ranilix הוא מייל חינם בעברית, בלי פרסומות ובלי מספר טלפון. השוואה הוגנת: מה יש כאן, מה יש שם, ולמי זה מתאים.",
      h1: "מחפשים אלטרנטיבה לג׳ימייל?",
      lead: "ג׳ימייל הוא שירות מצוין, אבל הוא לא מתאים לכולם. Ranilix הוא מייל חינם שנבנה בעברית מהיסוד, בלי פרסומות ובלי צורך במספר טלפון.",
      sections: [
        { h: "מה שונה ב-Ranilix", p: ["פתיחת חשבון עם שם וסיסמה בלבד, ממשק מימין לשמאל, בלי פרסומות בתיבה, עד 5 כתובות לאדם, ועוזר AI שמדבר עברית. השירות קטן וישראלי, ואפשר לדבר עם הצוות ישירות מתוך האתר."] },
        { h: "מה עדיין יותר טוב בג׳ימייל", p: ["בהגינות: לג׳ימייל יש נפח אחסון גדול בהרבה, חיבור לכל שירותי גוגל, ומערכת שקיימת שנים רבות. אם אתם עובדים כל היום עם Google Docs ו-Drive, כדאי להמשיך שם."] },
        { h: "אפשר גם וגם", p: ["הרבה משתמשים שומרים את ג׳ימייל לעבודה ופותחים Ranilix להרשמות, לפרויקטים או לילדים. כך המייל הראשי נשאר נקי מספאם."] },
      ],
      faq: [
        { q: "אפשר לראות את ג׳ימייל מתוך Ranilix?", a: "כן, אפשר לחבר חשבון גוגל ולקרוא את המיילים משם בתוך התיבה, אחרי שמאשרים זאת בגוגל." },
        { q: "אני צריך לעזוב את ג׳ימייל?", a: "לא. אפשר להשתמש בשניהם במקביל." },
        { q: "כמה זה עולה?", a: "כלום. Ranilix חינם." },
      ],
      note: "Gmail הוא סימן מסחרי של Google LLC. Ranilix אינו קשור ל-Google.",
    },
    en: {
      title: "A Gmail alternative: free, private email | Ranilix",
      description: "Looking for a Gmail alternative? Ranilix is free email with no ads and no phone number. A fair comparison: what's here, what's there, and who it fits.",
      h1: "Looking for a Gmail alternative?",
      lead: "Gmail is a great service, but it isn't for everyone. Ranilix is free email with no ads in your inbox and no phone number needed.",
      sections: [
        { h: "What's different at Ranilix", p: ["Sign up with just a name and a password, no ads in the inbox, up to 5 addresses per person, full Hebrew and English, and an AI helper. It's a small service where you can talk to the team right from the site."] },
        { h: "Where Gmail is still better", p: ["To be fair: Gmail has far more storage, ties into every Google service and has been around for many years. If you live in Google Docs and Drive, stay there."] },
        { h: "You can use both", p: ["Many people keep Gmail for work and open Ranilix for sign-ups, projects or their kids. That keeps the main inbox free of spam."] },
      ],
      faq: [
        { q: "Can I read Gmail inside Ranilix?", a: "Yes, you can connect a Google account and read its mail inside your inbox after approving it at Google." },
        { q: "Do I have to leave Gmail?", a: "No. Use both side by side." },
        { q: "How much does it cost?", a: "Nothing. Ranilix is free." },
      ],
      note: "Gmail is a trademark of Google LLC. Ranilix is not affiliated with Google.",
    },
  },
  {
    slug: "private-email",
    kind: "landing",
    icon: "ShieldCheck",
    he: {
      title: "מייל פרטי ומאובטח בלי פרסומות · חינם | Ranilix",
      description: "מייל פרטי בחינם: בלי פרסומות, בלי סריקת מיילים לפרסום ובלי מכירת מידע. התראות על כניסות חדשות, ניהול מכשירים ומחיקה מלאה בכל רגע.",
      h1: "מייל פרטי, בלי פרסומות",
      lead: "ב-Ranilix התיבה שלכם היא לא מוצר פרסומי. אנחנו לא סורקים את המיילים כדי להציג פרסומות ולא מוכרים מידע לאף אחד.",
      sections: [
        { h: "מה אנחנו עושים כדי לשמור עליכם", p: ["חיבור מוצפן (HTTPS) בכל עמוד, סיסמאות שנשמרות מוצפנות, הגבלות נגד ניחוש סיסמאות, ורשימת מכשירים מחוברים שאפשר לנתק מהם מרחוק."] },
        { h: "אתם בשליטה", p: ["רואים מאיפה התחברו לחשבון, מנתקים מכשירים שלא מכירים, ומוחקים את החשבון בלחיצה. מחיקה מסירה את התיבה ואת המידע האישי."] },
        { h: "פחות ספאם, פחות חשיפה", p: ["אפשר לפתוח כתובות נוספות להרשמות, וכך הכתובת הראשית לא מגיעה לרשימות תפוצה וללקוחות של אתרים."] },
      ],
      faq: [
        { q: "אתם קוראים את המיילים שלי?", a: "לא. אנחנו לא סורקים הודעות לצורך פרסום ולא מוכרים את המידע שלכם." },
        { q: "איך אני יודע מי מחובר לחשבון?", a: "בהגדרות יש רשימת מכשירים עם מיקום משוער וזמן כניסה, ואפשר לנתק כל אחד מהם." },
        { q: "יש מדיניות פרטיות?", a: "כן, היא מפורסמת באתר בעברית ובאנגלית." },
      ],
    },
    en: {
      title: "Private email with no ads · Free | Ranilix",
      description: "Free private email: no ads, no scanning your mail for ads, no selling data. Device list, remote sign-out and full deletion at any time.",
      h1: "Private email, no ads",
      lead: "At Ranilix your inbox isn't an ad product. We don't scan your mail to show ads and don't sell data to anyone.",
      sections: [
        { h: "How we protect you", p: ["HTTPS on every page, passwords stored hashed, limits against password guessing, and a list of signed-in devices you can sign out remotely."] },
        { h: "You're in control", p: ["See where your account was used, sign out devices you don't recognize, and delete the account in one step. Deletion removes the inbox and your personal data."] },
        { h: "Less spam, less exposure", p: ["Open extra addresses for sign-ups so your main address never ends up on mailing lists."] },
      ],
      faq: [
        { q: "Do you read my email?", a: "No. We don't scan messages for advertising and don't sell your data." },
        { q: "How do I know who is signed in?", a: "Settings shows your devices with rough location and time, and you can sign any of them out." },
        { q: "Is there a privacy policy?", a: "Yes, published on the site in English and Hebrew." },
      ],
    },
  },
  {
    slug: "hebrew-email",
    kind: "landing",
    icon: "Languages",
    he: {
      title: "מייל בעברית · תיבת דואר מימין לשמאל, חינם | Ranilix",
      description: "תיבת מייל שנבנתה בעברית: ממשק מימין לשמאל, עוזר AI שמדבר עברית, תמיכה בעברית ומצב כהה. פותחים חינם תוך דקה.",
      h1: "מייל שמדבר עברית",
      lead: "Ranilix נבנה מההתחלה בעברית ובאנגלית. הממשק מימין לשמאל, הטקסטים כתובים בעברית טבעית, והתמיכה עונה בעברית.",
      sections: [
        { h: "מימין לשמאל, באמת", p: ["תפריטים, כפתורים וחיצים מסודרים נכון בעברית, ומיילים בעברית ובאנגלית מוצגים כל אחד בכיוון הנכון שלו."] },
        { h: "עוזר AI בעברית", p: ["מוצ'י, העוזר של Ranilix, עוזר לנסח מיילים, לסכם הודעות ארוכות ולענות על שאלות על השירות, בעברית."] },
        { h: "עוד כלים בעברית", p: ["יומן, סורק קבלות שמסדר הוצאות, דרייב לקבצים וסיכום שנתי של התיבה. הכול באותו חשבון חינמי."] },
      ],
      faq: [
        { q: "אפשר לעבור לאנגלית?", a: "כן, בלחיצה אחת, וההגדרה נשמרת." },
        { q: "יש מצב כהה?", a: "כן, ואפשר גם לתת לו להתחלף לפי הגדרות המכשיר." },
        { q: "יש אפליקציה?", a: "אפשר להתקין את האתר כאפליקציה במסך הבית של הטלפון ובמחשב." },
      ],
    },
    en: {
      title: "Email in Hebrew and English, right-to-left done right | Ranilix",
      description: "An inbox built for Hebrew and English: proper right-to-left layout, an AI helper, support and dark mode. Free, ready in a minute.",
      h1: "Email that speaks Hebrew",
      lead: "Ranilix was built from day one in Hebrew and English. The layout flips properly right-to-left and support answers in both languages.",
      sections: [
        { h: "Real right-to-left", p: ["Menus, buttons and arrows are laid out correctly in Hebrew, and every message shows in its own direction."] },
        { h: "An AI helper", p: ["Mochi, the Ranilix helper, drafts emails, summarizes long messages and answers questions about the service."] },
        { h: "More tools", p: ["A calendar, a receipts scanner, a Drive and a yearly inbox recap. All in the same free account."] },
      ],
      faq: [
        { q: "Can I switch to English?", a: "Yes, in one tap, and it's remembered." },
        { q: "Is there a dark mode?", a: "Yes, and it can follow your device settings." },
        { q: "Is there an app?", a: "You can install the site as an app on your phone's home screen and on your computer." },
      ],
    },
  },
  {
    slug: "guides/open-free-email",
    kind: "guide",
    icon: "BookOpen",
    he: {
      title: "איך פותחים מייל חינם? מדריך קצר בעברית | Ranilix",
      description: "מדריך צעד אחר צעד לפתיחת תיבת מייל חינם: בחירת שם, סיסמה חזקה, ומה עושים אחרי. לוקח בערך דקה.",
      h1: "איך פותחים מייל חינם, צעד אחר צעד",
      lead: "פתיחת תיבת מייל לוקחת בערך דקה. כך עושים את זה נכון, כדי שהכתובת תהיה נוחה ושהחשבון יהיה מוגן.",
      steps: [
        { h: "בוחרים שם לכתובת", p: "השם הוא החלק שלפני @. כדאי לבחור משהו קצר שקל לאיית בטלפון, כמו שם פרטי ומשפחה או שם פרטי ומספר. בלי אותיות דומות שמתבלבלות." },
        { h: "בוחרים סיסמה חזקה", p: "לפחות 10 תווים, עם אותיות, מספרים וסימן. משפט קצר שרק אתם מכירים עובד מצוין. לא להשתמש באותה סיסמה של אתרים אחרים." },
        { h: "נרשמים", p: "בעמוד ההרשמה של Ranilix מקלידים את השם והסיסמה, מאשרים את התנאים, והתיבה נפתחת מיד." },
        { h: "מסדרים את החשבון", p: "מוסיפים שם תצוגה ותמונה, כותבים חתימה, ומתקינים את האתר כאפליקציה בטלפון כדי לקבל התראות." },
        { h: "שומרים על הכתובת נקייה", p: "להרשמות לחנויות ולמבצעים פותחים כתובת שנייה, וכך המייל הראשי נשאר לאנשים שחשובים לכם." },
      ],
      faq: [
        { q: "צריך מספר טלפון?", a: "ב-Ranilix לא. מספיקים שם משתמש וסיסמה." },
        { q: "אפשר לשנות את הכתובת אחר כך?", a: "את הכתובת עצמה לא, אבל אפשר לפתוח כתובת נוספת ולעבור אליה." },
      ],
    },
    en: {
      title: "How to create a free email account: a short guide | Ranilix",
      description: "A step-by-step guide to opening a free email: choosing a name, a strong password, and what to do next. Takes about a minute.",
      h1: "How to create a free email, step by step",
      lead: "Opening an inbox takes about a minute. Here's how to do it right so the address is easy to share and the account is protected.",
      steps: [
        { h: "Choose the name", p: "It's the part before @. Pick something short that's easy to spell out loud, like first and last name or a name and a number." },
        { h: "Choose a strong password", p: "At least 10 characters with letters, numbers and a symbol. A short sentence only you know works great. Don't reuse a password from other sites." },
        { h: "Sign up", p: "On the Ranilix sign-up page type the name and password, accept the terms, and your inbox opens right away." },
        { h: "Set up the account", p: "Add a display name and photo, write a signature, and install the site as an app to get notifications." },
        { h: "Keep the address clean", p: "Use a second address for shops and deals, so your main inbox stays for people who matter." },
      ],
      faq: [
        { q: "Do I need a phone number?", a: "Not at Ranilix. A username and a password are enough." },
        { q: "Can I change the address later?", a: "Not the address itself, but you can open another one and move to it." },
      ],
    },
  },
  {
    slug: "guides/stop-spam",
    kind: "guide",
    icon: "Ban",
    he: {
      title: "איך להפסיק לקבל ספאם במייל: 6 צעדים שעובדים | Ranilix",
      description: "נמאס מספאם? 6 צעדים פשוטים לניקוי תיבת המייל: הסרה מרשימות תפוצה, כתובת נפרדת להרשמות, דיווח וחסימה.",
      h1: "איך להפסיק לקבל ספאם במייל",
      lead: "ספאם מגיע כמעט תמיד מאותם מקומות: אתרים שנרשמתם אליהם ורשימות שהכתובת שלכם דלפה אליהן. ככה מצמצמים אותו.",
      steps: [
        { h: "מסירים את עצמכם מרשימות אמיתיות", p: "ניוזלטרים של חנויות מוכרות כוללים קישור \"הסרה\" בתחתית. הוא בטוח לשימוש אצל עסקים מוכרים." },
        { h: "לא לוחצים על קישורים במיילים חשודים", p: "בספאם אמיתי, לחיצה על \"הסרה\" רק מאשרת לשולח שהכתובת פעילה. מדווחים ומוחקים." },
        { h: "מדווחים לנו על ספאם", p: "ב-Ranilix אפשר לדווח לצוות דרך \"דיווח על בעיה\" בתפריט החשבון. הדיווחים עוזרים לנו לחסום שולחים בעייתיים." },
        { h: "פותחים כתובת נפרדת להרשמות", p: "הכתובת הראשית לאנשים, וכתובת שנייה לחנויות ולאתרים. כשהשנייה מתמלאת בספאם, הראשית לא נפגעת." },
        { h: "לא מפרסמים את הכתובת בגלוי", p: "כתובת שמופיעה כטקסט בפייסבוק או באתר נאספת על ידי בוטים. עדיף טופס יצירת קשר או כתיבה כמו dana [at] ranilix.com." },
        { h: "בודקים אם הכתובת דלפה", p: "אתר haveibeenpwned.com בודק אם הכתובת הופיעה בדליפת מידע. אם כן, מחליפים סיסמה באתרים שנפגעו." },
      ],
      faq: [
        { q: "למה פתאום אני מקבל הרבה ספאם?", a: "בדרך כלל כי הכתובת הופיעה בדליפה של אתר כלשהו או נמכרה ברשימת תפוצה." },
        { q: "כתובת נוספת עולה כסף?", a: "ב-Ranilix לא. אפשר עד 5 כתובות לאדם, בחינם." },
      ],
    },
    en: {
      title: "How to stop spam email: 6 steps that work | Ranilix",
      description: "Tired of spam? Six simple steps to clean up your inbox: leave real mailing lists, use a separate sign-up address, report and block.",
      h1: "How to stop getting spam email",
      lead: "Spam almost always comes from the same places: sites you signed up to and lists your address leaked into. Here's how to cut it down.",
      steps: [
        { h: "Leave real mailing lists", p: "Newsletters from known shops have an unsubscribe link at the bottom. It's safe to use with businesses you know." },
        { h: "Don't click links in suspicious mail", p: "With real spam, clicking unsubscribe only confirms your address is active. Report and delete instead." },
        { h: "Report spam to us", p: "In Ranilix you can tell the team through \"Report a problem\" in the account menu. Reports help us block bad senders." },
        { h: "Use a separate sign-up address", p: "Main address for people, a second one for shops and sites. When the second fills with spam, the main one is untouched." },
        { h: "Don't post your address in plain text", p: "Addresses shown as text on social media or sites get scraped by bots. Use a contact form or write dana [at] ranilix.com." },
        { h: "Check if your address leaked", p: "haveibeenpwned.com checks whether your address appeared in a data breach. If it did, change those passwords." },
      ],
      faq: [
        { q: "Why am I suddenly getting so much spam?", a: "Usually because the address appeared in a site's data breach or was sold on a mailing list." },
        { q: "Does an extra address cost money?", a: "Not at Ranilix. Up to 5 addresses per person, free." },
      ],
    },
  },
  {
    slug: "guides/strong-password",
    kind: "guide",
    icon: "KeyRound",
    he: {
      title: "איך לבחור סיסמה חזקה למייל (ולזכור אותה) | Ranilix",
      description: "סיסמה חזקה למייל בלי לשבור את הראש: שיטת המשפט, מנהל סיסמאות, ומה לעשות אם חושדים שמישהו נכנס לחשבון.",
      h1: "איך לבחור סיסמה חזקה למייל",
      lead: "המייל הוא המפתח לכל החשבונות האחרים: דרכו משחזרים סיסמאות לכל אתר. לכן הסיסמה שלו צריכה להיות הכי טובה שלכם.",
      steps: [
        { h: "משפט במקום מילה", p: "קחו משפט שרק אתם מכירים, למשל \"הכלב שלי אוכל פיצה ב-7\", וכתבו אותו באותיות לועזיות עם מספר וסימן. ארוך, קל לזכור וקשה לנחש." },
        { h: "סיסמה אחת לכל אתר", p: "אם אתר אחד דולף, כל החשבונות עם אותה סיסמה בסכנה. למייל תמיד סיסמה ייחודית." },
        { h: "מנהל סיסמאות", p: "מנהלי סיסמאות (כמו זה שמובנה בדפדפן או בטלפון) זוכרים בשבילכם וממלאים לבד." },
        { h: "בודקים מכשירים מחוברים", p: "ב-Ranilix, בהגדרות, יש רשימת מכשירים שמחוברים לחשבון. רואים מכשיר שלא מכירים? מנתקים אותו ומחליפים סיסמה." },
        { h: "לא מוסרים סיסמה לאף אחד", p: "אף צוות אמיתי לא יבקש את הסיסמה שלכם במייל או בטלפון, כולל אנחנו." },
      ],
      faq: [
        { q: "כמה ארוכה צריכה להיות סיסמה?", a: "לפחות 10 תווים, ועדיף יותר. אורך חשוב יותר מסימנים מסובכים." },
        { q: "כל כמה זמן להחליף?", a: "אין צורך להחליף סיסמה חזקה בלי סיבה. מחליפים מיד אם יש חשד לפריצה או דליפה." },
      ],
    },
    en: {
      title: "How to choose a strong email password (and remember it) | Ranilix",
      description: "A strong email password without the headache: the sentence method, password managers, and what to do if you think someone got in.",
      h1: "How to choose a strong email password",
      lead: "Your email is the key to every other account: it's where password resets go. So its password should be your best one.",
      steps: [
        { h: "A sentence, not a word", p: "Take a sentence only you know, like \"my dog eats pizza at 7\", and add a number and a symbol. Long, easy to remember and hard to guess." },
        { h: "One password per site", p: "If one site leaks, every account with the same password is at risk. Your email always gets a unique one." },
        { h: "Use a password manager", p: "Password managers (like the one built into your browser or phone) remember for you and fill in automatically." },
        { h: "Check signed-in devices", p: "In Ranilix settings there's a list of devices on your account. See one you don't know? Sign it out and change the password." },
        { h: "Never share your password", p: "No real team will ask for your password by email or phone, including us." },
      ],
      faq: [
        { q: "How long should it be?", a: "At least 10 characters, more is better. Length matters more than odd symbols." },
        { q: "How often should I change it?", a: "No need to change a strong password without reason. Change it right away if you suspect a breach." },
      ],
    },
  },
];

export const GUIDES_INDEX = {
  slug: "guides",
  he: { title: "מדריכים: מייל, ספאם ואבטחה בעברית | Ranilix", description: "מדריכים קצרים בעברית: איך לפתוח מייל חינם, איך להיפטר מספאם ואיך לבחור סיסמה חזקה.", h1: "מדריכים", lead: "תשובות קצרות וברורות לשאלות על מייל, ספאם ואבטחה." },
  en: { title: "Guides: email, spam and security | Ranilix", description: "Short guides: how to open a free email, how to stop spam and how to choose a strong password.", h1: "Guides", lead: "Short, clear answers about email, spam and security." },
};

export const pageBySlug = (slug) => SEO_PAGES.find((p) => p.slug === slug);
