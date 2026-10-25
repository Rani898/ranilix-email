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

## חיבור Gmail עם Google (חינם, עד 100 משתמשים)
כך משתמשים יכולים ללחוץ על **Gmail** בתיבת הדואר ולקרוא את ה-Gmail שלהם בתוך Ranilix (קריאה בלבד).
1. נכנסים ל-https://console.cloud.google.com ויוצרים פרויקט חדש (למשל `Ranilix`).
2. **APIs & Services ← Library** ← מחפשים **Gmail API** ← **Enable**.
3. **Google Auth Platform** (או **OAuth consent screen**) ← **Get started**:
   - App name: `Ranilix Email`, ‏User support email: המייל שלך.
   - Audience: **External**.
   - Contact: המייל שלך ← מסכימים ← **Create**.
4. **Data Access ← Add or remove scopes** ← מוסיפים את `.../auth/gmail.readonly` (וגם `openid` ו-`email`) ← **Save**.
5. **Audience ← Test users ← Add users** ← מוסיפים כל כתובת Gmail שמותר לה להתחבר (עד 100).
6. **Clients ← Create client**:
   - Application type: **Web application**
   - Authorized redirect URIs: `https://api.ranilix.com/api/google/callback`
   - **Create** ← מעתיקים את **Client ID** ואת **Client secret** (מתחיל ב-`GOCSPX-`).
7. ב-`server\wrangler.toml` מדביקים את ה-Client ID בשורה `GOOGLE_CLIENT_ID = "..."`.
8. מריצים `setup.bat`, ובשלב "Connect Gmail" מדביקים את ה-Client secret.
- במצב הבדיקה (Testing): רק כתובות שהוספת בשלב 5 יכולות להתחבר, Google מציגה אזהרה "האפליקציה לא אומתה" (לוחצים Continue), וכל 7 ימים צריך להתחבר מחדש.

## פאנל הניהול
- הכתובת: `https://rani898.github.io/ranilix-email/admin` (או הכפתור "פאנל ניהול" בתיבת הדואר, שמופיע רק לך).
- מי יכול להיכנס נקבע בשרת, בשורה `ADMIN_USERS = "rani,rani4"` (כמה שמות מפרידים בפסיק) בקובץ `server\wrangler.toml`. כדי להיכנס, **הירשם באתר עם השם `rani`** (אם תבחר שם אחר, שנה את השורה הזאת ותריץ שוב `npx.cmd wrangler deploy`).
- השרת בודק את ההרשאה בכל פעולה, ומשתמש רגיל שמנסה להיכנס יקבל "הדף לא זמין".
- **מגבלת כתובות:** כל אדם יכול לפתוח עד 5 כתובות (נספרות כתובות שנפתחו מדפדפן שכבר מחובר). בפאנל ← משתמשים ← עמודת "כתובות" (או הכפתור עם המעטפות) אפשר לקבוע לכל אחד מספר אחר, מ-1 עד 100. למנהלים אין מגבלה.
- שם כתובת חדש חייב לכלול לפחות 4 אותיות באנגלית או מספרים.
- **חשוב:** הירשם עם השם `rani` מיד אחרי העלאת השרת, לפני שמישהו אחר יתפוס אותו.

## העלאה אוטומטית של השרת מ-GitHub (במקום setup.bat)
מעכשיו כל שינוי בתיקייה `server` עולה לבד ל-Cloudflare. צריך להגדיר פעם אחת:

**1. יצירת מפתח ב-Cloudflare**
1. https://dash.cloudflare.com/profile/api-tokens ← **Create Token**.
2. ליד **Edit Cloudflare Workers** ← **Use template**.
3. ב-Permissions ← **+ Add more** ← `Account` · `D1` · `Edit`.
4. ב-Account Resources: החשבון שלך. ב-Zone Resources: **Specific zone ← ranilix.com**.
5. **Continue to summary ← Create Token ← Copy**. (לא שולחים לאף אחד.)

**2. שמירת המפתח ב-GitHub**
1. https://github.com/Rani898/ranilix-email/settings/secrets/actions ← **New repository secret**.
2. Name: `CLOUDFLARE_API_TOKEN` · Secret: המפתח שהעתקת ← **Add secret**.
3. (רשות) אפשר להוסיף כאן גם `DISCORD_BOT_TOKEN`, `RESEND_API_KEY`, `GOOGLE_CLIENT_SECRET`: הם יועתקו לשרת בכל העלאה.

**3. הפעלה ראשונה**
https://github.com/Rani898/ranilix-email/actions ← **Deploy server (Cloudflare Worker)** ← **Run workflow**. אחרי דקה-שתיים יופיע וי ירוק.

## עדכון שרת שכבר הועלה
אם כבר העלית את השרת לפני כן, אחרי כל עדכון מספיק:
```powershell
cd D:\ranilix-email\server
npx.cmd wrangler d1 execute ranilix-email --remote --file=schema.sql
npx.cmd wrangler deploy
```
(הפקודה הראשונה רק מוסיפה טבלאות חדשות, היא לא מוחקת משתמשים או הודעות.)

## הגדרות, דיווחים ואפליקציה
- **הגדרות** (תפריט העיגול ← הגדרות): תמונת פרופיל, שם, חתימה, החלפת סיסמה ומחיקת החשבון.
- **דיווח על בעיה** (תפריט העיגול): הדיווחים מגיעים לפאנל הניהול ← לשונית "דיווחים".
- **אפליקציה**: "התקנת האפליקציה" מוסיפה אייקון למסך הבית. התראות על מייל חדש מגיעות גם כשהאתר סגור (באייפון: רק אחרי שמוסיפים למסך הבית). מפתחות ההתראות נוצרים לבד בשרת, לא צריך להגדיר כלום.

## בוט דיסקורד (חינם, רץ בתוך השרת)
1. https://discord.com/developers/applications ← האפליקציה שלך (או New Application) ← **General Information**: מעתיקים את **Application ID** ואת **Public Key** ושולחים לי (הם לא סודיים), או מדביקים ב-`server\wrangler.toml` בשורות `DISCORD_APP_ID` ו-`DISCORD_PUBLIC_KEY`.
2. **Bot ← Reset Token ← Copy**. את הטוקן מדביקים רק ב-`setup.bat` (בשלב "Discord bot"). לא שולחים אותו לאף אחד.
3. מריצים `setup.bat`.
4. חוזרים ל-**General Information** ← **Interactions Endpoint URL** ← מדביקים `https://api.ranilix.com/api/discord/interactions` ← **Save**.
5. בפאנל הניהול ← הגדרות האתר ← "בוט דיסקורד" ← **רישום הפקודות**, ואז **קישור הזמנה** ← בוחרים את השרת ← Authorize.
6. בשרת הדיסקורד כותבים **/setup**. הבוט מוצא לבד את ערוץ העדכונים, ערוץ הלוגים והתפקיד 📧 משתמש Ranilix.
7. בהגדרות השרת ← תפקידים: גוררים את התפקיד של הבוט **מעל** 📧 משתמש Ranilix (אחרת הוא לא יכול לתת אותו).

8. **אימות עם כפתור:** בערוץ 👋│ברוכים-הבאים כותבים `/verify-panel` (עם `lock: True` כדי שמי שלא לחץ יראה רק את ערוצי המידע). הבוט יוצר את התפקיד ✅ מאומת ושולח הודעה עם כפתור.
- הבוט מופיע **אופליין** (עיגול אפור) וזה תקין: הוא לא "מחובר" כל הזמן, הוא מתעורר רק כשמישהו משתמש בפקודה או בכפתור.

- **לוגים:** `/setup` יוצר קטגוריה נסתרת "📊 לוגים" עם ערוץ לכל סוג: הרשמות, התחברויות, חשבונות, מיילים, אבטחה, ניהול, דיווחים, אימותים, פקודות בוט ושגיאות שרת. רק מנהלים ותפקידי צוות רואים אותה. אם כבר הרצת `/setup` בעבר, תריץ שוב כדי שהערוצים ייווצרו.

- **חסימת קישורים:** `/block-links` מפעיל את AutoMod של דיסקורד: הודעות עם קישורים לאתרים או הזמנות לשרתים אחרים נחסמות לפני שהן נשלחות (האתר של Ranilix וההזמנה לשרת מותרים, מנהלים וצוות פטורים). לכיבוי: `/block-links links:False invites:False`.

פקודות: `/site` `/check` `/status` `/help` `/report` `/verify start` `/verify code`, ולמנהלים `/stats` `/setup` `/verify-panel` `/block-links`.
עדכונים שנשלחים מהפאנל מתפרסמים גם בערוץ העדכונים, ודיווחים ומשתמשים חדשים מגיעים לערוץ הלוגים.

## מה עוד לא עובד
- **שליחה החוצה** (ל-Gmail וכו'): עובדת אחרי חיבור Resend (ראה למעלה).
- **קבצים מצורפים**: עד 10MB לקובץ, עד 10 קבצים ועד 20MB בסך הכול להודעה. האחסון החינמי של Cloudflare KV מוגבל ל-1GB ולכ-1,000 העלאות ביום.
- **התראות**: עובדות רק כשהאתר פתוח בלשונית כלשהי בדפדפן.
