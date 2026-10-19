# הפעלת שרת המיילים של Ranilix

השרת רץ על Cloudflare Workers (חינם). הוא שומר משתמשים והודעות, ומקבל מיילים לכתובות `@ranilix.com`.

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

**3ב. יצירת אחסון לקבצים מצורפים** (חינם, בלי כרטיס אשראי)
```powershell
npx.cmd wrangler kv namespace create FILES
```
יודפס `id = "..."`. פתח את `server\wrangler.toml` והחלף את `REPLACE_WITH_YOUR_KV_ID` במספר הזה.

**4. יצירת הטבלאות**
```powershell
npx.cmd wrangler d1 execute ranilix-email --remote --file=schema.sql
```

**5. העלאת השרת**
```powershell
npx.cmd wrangler deploy
```
בסוף יופיעו הכתובות של השרת, כולל `https://api.ranilix.com`. פתח אותה בדפדפן (לפעמים לוקח דקה-שתיים). אמור להופיע `"ok":true`.

**6. חיבור האתר לשרת**
ב-GitHub: **Settings ← Secrets and variables ← Actions ← לשונית Variables ← New repository variable**
- Name: `API_URL`
- Value: `https://api.ranilix.com`

אחר כך: **Actions ← Deploy to GitHub Pages ← Run workflow**.
מעכשיו ההרשמה וההתחברות באתר אמיתיות, ואפשר לשלוח מיילים בין משתמשי `@ranilix.com`.

## חלק ב׳: הפעלת קבלת מיילים (הדומיין ranilix.com כבר Active ב-Cloudflare)

**7. הפעלת קבלת מיילים**
1. ב-https://dash.cloudflare.com ← `ranilix.com` ← **Email** ← **Email Routing** ← **Get started / Enable**.
2. אם הוא מציע להוסיף רשומות MX ו-SPF, תאשר (**Add records and enable**).
3. אם הוא מבקש "destination address", אפשר לדלג, או להוסיף את המייל הרגיל שלך. זה לא משנה.
4. **Routing rules ← Catch-all address ← Edit**:
   - Action: **Send to a Worker**
   - Destination: **ranilix-email-api**
   - לשמור ולוודא שה-Catch-all **Enabled**.

**8. בדיקה**
הירשם באתר (למשל `rani`), ושלח מ-Gmail מייל ל-`rani@ranilix.com`. תוך דקה הוא יופיע בתיבה (או בלחיצה על כפתור הרענון).

## שליחה ל-Gmail ולספקים אחרים (Resend, חינם)
1. נרשמים ב-https://resend.com (אפשר עם Google או GitHub).
2. **Domains ← Add Domain** ← `ranilix.com` ← מוסיפים את רשומות ה-DNS שהוא מציג (יש כפתור חיבור אוטומטי ל-Cloudflare).
3. מחכים שהדומיין יהיה **Verified**.
4. **API Keys ← Create API Key** (הרשאה: Sending access) ומעתיקים את המפתח (מתחיל ב-`re_`).
5. מריצים שוב את `setup.bat`, ובשלב האחרון מדביקים את המפתח.
- מגבלות: 100 מיילים ביום לכל האתר (המסלול החינמי), וכל משתמש עד 20 ביום. אפשר לכבות/להדליק בפאנל הניהול ← הגדרות האתר.

## פאנל הניהול
- הכתובת: `https://rani898.github.io/ranilix-email/admin` (או הכפתור "פאנל ניהול" בתיבת הדואר, שמופיע רק לך).
- מי יכול להיכנס נקבע בשרת, בשורה `ADMIN_USERS = "rani,rani4"` (כמה שמות מפרידים בפסיק) בקובץ `server\wrangler.toml`. כדי להיכנס, **הירשם באתר עם השם `rani`** (אם תבחר שם אחר, שנה את השורה הזאת ותריץ שוב `npx.cmd wrangler deploy`).
- השרת בודק את ההרשאה בכל פעולה, ומשתמש רגיל שמנסה להיכנס יקבל "הדף לא זמין".
- **חשוב:** הירשם עם השם `rani` מיד אחרי העלאת השרת, לפני שמישהו אחר יתפוס אותו.

## עדכון שרת שכבר הועלה
אם כבר העלית את השרת לפני כן, אחרי כל עדכון מספיק:
```powershell
cd D:\ranilix-email\server
npx.cmd wrangler d1 execute ranilix-email --remote --file=schema.sql
npx.cmd wrangler deploy
```
(הפקודה הראשונה רק מוסיפה טבלאות חדשות, היא לא מוחקת משתמשים או הודעות.)

## מה עוד לא עובד
- **שליחה החוצה** (ל-Gmail וכו'): עובדת אחרי חיבור Resend (ראה למעלה).
- **קבצים מצורפים**: עד 10MB לקובץ, עד 10 קבצים ועד 20MB בסך הכול להודעה. האחסון החינמי של Cloudflare KV מוגבל ל-1GB ולכ-1,000 העלאות ביום.
- **התראות**: עובדות רק כשהאתר פתוח בלשונית כלשהי בדפדפן.
