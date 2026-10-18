# הפעלת שרת המיילים של Ranilix

השרת רץ על Cloudflare Workers (חינם). הוא שומר משתמשים והודעות, ומקבל מיילים לכתובות `@ranilix.eu.org`.

> ב-PowerShell תכתוב `npm.cmd` ו-`npx.cmd` (ולא `npm` / `npx`).

## חלק א׳: אפשר לעשות כבר עכשיו

**1. התקנה**
```powershell
cd D:\ranilix-email\server
npm.cmd install
```

**2. התחברות ל-Cloudflare** (ייפתח דפדפן, תאשר שם)
```powershell
npx.cmd wrangler login
```

**3. יצירת מסד הנתונים**
```powershell
npx.cmd wrangler d1 create ranilix-email
```
יודפס `database_id = "..."`. פתח את `server\wrangler.toml` והחלף את `REPLACE_WITH_YOUR_DATABASE_ID` במספר הזה.

**4. יצירת הטבלאות**
```powershell
npx.cmd wrangler d1 execute ranilix-email --remote --file=schema.sql
```

**5. העלאת השרת**
```powershell
npx.cmd wrangler deploy
```
בסוף תופיע כתובת כמו `https://ranilix-email-api.SOMETHING.workers.dev`. פתח אותה בדפדפן. אמור להופיע `"ok":true`.

**6. חיבור האתר לשרת**
ב-GitHub: **Settings ← Secrets and variables ← Actions ← לשונית Variables ← New repository variable**
- Name: `API_URL`
- Value: הכתובת משלב 5 (בלי `/` בסוף)

אחר כך: **Actions ← Deploy to GitHub Pages ← Run workflow**.
מעכשיו ההרשמה וההתחברות באתר אמיתיות, ואפשר לשלוח מיילים בין משתמשי `@ranilix.eu.org`.

## חלק ב׳: אחרי ש-EU.org מאשר את הדומיין (ב-Cloudflare כתוב Active)

**7. הפעלת קבלת מיילים**
1. ב-https://dash.cloudflare.com ← `ranilix.eu.org` ← **Email** ← **Email Routing** ← **Get started / Enable**.
2. אם הוא מציע להוסיף רשומות MX ו-SPF, תאשר (**Add records and enable**).
3. אם הוא מבקש "destination address", אפשר לדלג, או להוסיף את המייל הרגיל שלך. זה לא משנה.
4. **Routing rules ← Catch-all address ← Edit**:
   - Action: **Send to a Worker**
   - Destination: **ranilix-email-api**
   - לשמור ולוודא שה-Catch-all **Enabled**.

**8. בדיקה**
הירשם באתר (למשל `rani`), ושלח מ-Gmail מייל ל-`rani@ranilix.eu.org`. תוך דקה הוא יופיע בתיבה (או בלחיצה על כפתור הרענון).

## מה עוד לא עובד
- **שליחה החוצה** (ל-Gmail וכו'): עוד לא. כרגע אפשר לשלוח רק לכתובות `@ranilix.eu.org`.
- **קבצים מצורפים**: לא נשמרים, מופיעה הודעה שהיו קבצים.
