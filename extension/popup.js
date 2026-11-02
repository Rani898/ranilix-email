// Ranilix extension popup: makes a site address + a strong password for the site in the current tab,
// copies them or fills them into the page, and shows the code the site sent.
const DEFAULT_API = "https://api.ranilix.com";
const $ = (id) => document.getElementById(id);
const store = {
  get: (keys) => chrome.storage.local.get(keys),
  set: (obj) => chrome.storage.local.set(obj),
};

const ERRORS = {
  bad_login: "האימייל או הסיסמה לא נכונים.",
  rate_limited: "יותר מדי ניסיונות. חכו קצת ונסו שוב.",
  session: "צריך להתחבר מחדש.",
  suspended: "החשבון מושעה.",
  temp_not_allowed: "כתובות נוספות לא מופעלות בחשבון שלך. מנהל האתר יכול להפעיל את זה.",
  site_limit: "הגעת למספר המקסימלי של כתובות לאתרים. מחק אחת קודם.",
  site_not_found: "הכתובת הזאת לא נמצאה.",
  network: "אין חיבור לשרת של Ranilix. בדקו את האינטרנט ונסו שוב.",
};
const errText = (e) => ERRORS[e?.code] || e?.message || ERRORS.network;

let state = { api: DEFAULT_API, token: "", me: "", saved: {} };
let tab = null;      // { id, url, host, site }
let current = null;  // { address, local, password, host, expiresAt }
let life = 0;        // hours the next address lives (0 = forever)

/** "לתמיד" / "פג תוקף" / "עוד 3 ימים" */
function lifeText(expiresAt) {
  if (!expiresAt) return { text: "לתמיד", gone: false };
  const left = expiresAt - Date.now();
  if (left <= 0) return { text: "פג תוקף (לא מקבלת מיילים)", gone: true };
  const min = Math.ceil(left / 60000), h = Math.round(left / 3600000), d = Math.round(left / 86400000);
  const t = min < 60 ? (min === 1 ? "עוד דקה" : `עוד ${min} דקות`)
    : h < 24 ? (h === 1 ? "עוד שעה" : h === 2 ? "עוד שעתיים" : `עוד ${h} שעות`)
    : d === 1 ? "עוד יום" : d === 2 ? "עוד יומיים" : `עוד ${d} ימים`;
  return { text: t, gone: false };
}
const LIFE_OPTIONS = [["", "שנה תוקף…"], ["0", "לתמיד"], ["1", "שעה מעכשיו"], ["24", "יום מעכשיו"], ["168", "שבוע מעכשיו"], ["720", "חודש מעכשיו"]];

/* ---------- helpers ---------- */
async function api(path, opts = {}) {
  let res;
  try {
    res = await fetch(state.api + path, {
      method: opts.method || "GET",
      headers: { "Content-Type": "application/json", ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch { throw { code: "network" }; }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && path !== "/api/login") { await logout(true); }
    throw { code: data.code, message: data.error };
  }
  return data;
}

function toast(text) {
  const t = $("toast");
  t.textContent = text; t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 1600);
}

async function copy(text, btn) {
  try { await navigator.clipboard.writeText(text); } catch {
    const ta = document.createElement("textarea"); ta.value = text; document.body.append(ta); ta.select(); document.execCommand("copy"); ta.remove();
  }
  if (btn) { const old = btn.textContent; btn.textContent = "הועתק ✓"; btn.classList.add("done"); setTimeout(() => { btn.textContent = old; btn.classList.remove("done"); }, 1300); }
  else toast("הועתק ✓");
}

/** Strong random password: 16 characters with lower, upper, digits and symbols. */
function makePassword(len = 16) {
  const sets = ["abcdefghijkmnpqrstuvwxyz", "ABCDEFGHJKLMNPQRSTUVWXYZ", "23456789", "!@#$%*?-_"];
  const all = sets.join("");
  const rnd = (n) => { const a = new Uint32Array(1); let x; do { crypto.getRandomValues(a); x = a[0]; } while (x >= Math.floor(2 ** 32 / n) * n); return x % n; };
  const out = sets.map((s) => s[rnd(s.length)]);
  while (out.length < len) out.push(all[rnd(all.length)]);
  for (let i = out.length - 1; i > 0; i--) { const j = rnd(i + 1); [out[i], out[j]] = [out[j], out[i]]; }
  return out.join("");
}

/** "accounts.netflix.co.il" → "netflix" */
function siteName(host) {
  const parts = host.replace(/^www\./, "").split(".");
  if (parts.length < 2) return parts[0] || "";
  const twoPart = /^(co|com|org|net|gov|ac|edu|or|muni)$/.test(parts[parts.length - 2]) && parts.length >= 3;
  return parts[parts.length - (twoPart ? 3 : 2)];
}
const logoOf = (host) => `https://icons.duckduckgo.com/ip3/${host.replace(/^www\./, "")}.ico`;
const baseHost = (host) => host.replace(/^www\./, "");

/* ---------- views ---------- */
async function show() {
  $("login").hidden = !!state.token;
  $("main").hidden = !state.token;
  $("logout").hidden = !state.token;
  $("me").textContent = state.me || "";
  if (state.token) await showHere();
}

async function showHere() {
  const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
  let url = null;
  try { url = new URL(t?.url || ""); } catch { /* chrome:// etc. */ }
  if (!url || !/^https?:$/.test(url.protocol)) {
    tab = null;
    $("site-host").textContent = "אין כאן אתר";
    $("site-note").textContent = "פתחו את דף ההרשמה של האתר, ואז לחצו שוב על התוסף.";
    $("site-logo").src = "icons/32.png";
    $("make").disabled = true;
    return;
  }
  tab = { id: t.id, url: url.href, host: url.hostname, site: siteName(url.hostname) };
  $("site-host").textContent = baseHost(tab.host);
  $("site-logo").src = logoOf(tab.host);
  $("site-logo").onerror = () => { $("site-logo").src = "icons/32.png"; };
  $("make").disabled = false;
  // Already made one for this site? Show the newest.
  const mine = Object.entries(state.saved)
    .filter(([, v]) => baseHost(v.host || "") === baseHost(tab.host))
    .sort((a, b) => b[1].createdAt - a[1].createdAt);
  if (mine.length) {
    const [local, v] = mine[0];
    setCurrent({ local, address: v.address, password: v.password, host: v.host, expiresAt: v.expiresAt || null });
    $("site-note").textContent = mine.length > 1 ? `יש לך ${mine.length} כתובות לאתר הזה. מוצגת האחרונה.` : "כבר יצרת כתובת לאתר הזה.";
    $("make").lastChild.textContent = " צור אימייל וסיסמה חדשים";
  } else {
    $("site-note").textContent = "לוחצים, ומקבלים כתובת וסיסמה רק לאתר הזה.";
  }
}

function setCurrent(c) {
  current = c;
  $("creds").hidden = false;
  $("c-email").textContent = c.address;
  $("c-pass").textContent = c.password;
  $("c-pass").dataset.real = c.password;
  hidePass(true);
  showLife();
  $("code-out").className = "muted";
  $("code-out").textContent = "אחרי ההרשמה לחצו \"בדוק מיילים\" כדי לראות את הקוד שהאתר שלח.";
}

function showLife() {
  const l = lifeText(current?.expiresAt);
  $("c-life").textContent = l.text;
  $("c-life").classList.toggle("gone", l.gone);
  $("c-life-set").value = "";
}

async function changeLife(local, hours) {
  const r = await api(`/api/sites/${local}`, { method: "PATCH", body: { hours: Number(hours) } });
  if (state.saved[local]) { state.saved[local].expiresAt = r.expiresAt; await store.set({ saved: state.saved }); }
  if (current?.local === local) { current.expiresAt = r.expiresAt; showLife(); }
  toast(r.expiresAt ? `התוקף עודכן: ${lifeText(r.expiresAt).text}` : "הכתובת תעבוד לתמיד");
  return r;
}

function hidePass(hide) {
  const el = $("c-pass");
  el.classList.toggle("hide", hide);
  el.textContent = hide ? "•".repeat(12) : el.dataset.real;
}

async function renderList() {
  const q = $("search").value.trim().toLowerCase();
  let server = [];
  try { server = (await api("/api/sites")).addresses; } catch (e) { toast(errText(e)); }
  // Keep the local list in step with the server (an address deleted elsewhere disappears here too).
  const keep = new Set(server.map((s) => s.local));
  let changed = false;
  for (const k of Object.keys(state.saved)) if (!keep.has(k)) { delete state.saved[k]; changed = true; }
  for (const s of server) if (state.saved[s.local] && state.saved[s.local].expiresAt !== s.expiresAt) { state.saved[s.local].expiresAt = s.expiresAt; changed = true; }
  if (changed) await store.set({ saved: state.saved });

  const items = server.filter((s) => !q || `${s.host} ${s.site} ${s.address}`.toLowerCase().includes(q));
  $("list").replaceChildren();
  $("list-empty").hidden = items.length > 0;
  for (const s of items) {
    const pw = state.saved[s.local]?.password;
    const li = document.createElement("li");
    li.className = "item";
    li.innerHTML = `
      <div class="head"><img width="20" height="20" alt=""><b></b>${s.off ? '<span class="badge">חסומה</span>' : ""}<span class="muted"></span></div>
      <div class="head"><div class="addr"></div><span class="exp"></span></div>
      <div class="acts">
        <button class="chip" data-a="email">העתק אימייל</button>
        ${pw ? '<button class="chip" data-a="pass">העתק סיסמה</button>' : ""}
        <button class="chip" data-a="off">${s.off ? "הפעל מחדש" : "חסום מיילים"}</button>
        <select data-a="life">${LIFE_OPTIONS.map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</select>
        <button class="chip warn" data-a="del">מחק</button>
      </div>`;
    const host = s.host || s.site;
    const img = li.querySelector("img"); img.src = s.host ? logoOf(s.host) : "icons/32.png"; img.onerror = () => { img.src = "icons/32.png"; };
    li.querySelector("b").textContent = baseHost(host);
    li.querySelector(".head .muted").textContent = s.received === 1 ? "מייל אחד" : s.received ? `${s.received} מיילים` : "";
    li.querySelector(".addr").textContent = s.address;
    const lt = lifeText(s.expiresAt);
    li.querySelector(".exp").textContent = s.expiresAt ? lt.text : "";
    li.querySelector(".exp").classList.toggle("gone", lt.gone);
    li.querySelector("select").addEventListener("change", async (ev) => {
      if (ev.target.value === "") return;
      try { await changeLife(s.local, ev.target.value); renderList(); } catch (e) { toast(errText(e)); }
    });
    li.querySelector(".acts").addEventListener("click", async (ev) => {
      const b = ev.target.closest("button"); if (!b) return;
      const a = b.dataset.a;
      if (a === "email") copy(s.address, b);
      if (a === "pass") copy(pw, b);
      if (a === "off") {
        try { await api(`/api/sites/${s.local}`, { method: "PATCH", body: { off: !s.off } }); toast(s.off ? "הכתובת פעילה שוב" : "מיילים לכתובת הזאת ייחסמו"); renderList(); }
        catch (e) { toast(errText(e)); }
      }
      if (a === "del") {
        if (b.dataset.sure !== "1") { b.dataset.sure = "1"; b.textContent = "בטוח? לחץ שוב"; return; }
        try {
          await api(`/api/sites/${s.local}`, { method: "DELETE" });
          delete state.saved[s.local]; await store.set({ saved: state.saved });
          if (current?.local === s.local) { current = null; $("creds").hidden = true; }
          toast("נמחק"); renderList();
        } catch (e) { toast(errText(e)); }
      }
    });
    $("list").append(li);
  }
}

/* ---------- fill into the page ---------- */
function fillPage(email, password) {
  const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && !el.disabled && !el.readOnly; };
  const setVal = (el, v) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    el.focus(); setter.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.blur();
  };
  const inputs = [...document.querySelectorAll("input")].filter(visible);
  const mailRe = /mail|e-mail|אימייל|דוא"?ל|דואר/i;
  const userRe = /user|login|account|identifier|שם משתמש/i;
  const hint = (el) => `${el.name} ${el.id} ${el.placeholder} ${el.autocomplete} ${el.getAttribute("aria-label") || ""}`;
  let emailEl = inputs.find((el) => el.type === "email")
    || inputs.find((el) => ["text", ""].includes(el.type) && mailRe.test(hint(el)))
    || inputs.find((el) => ["text", ""].includes(el.type) && userRe.test(hint(el)));
  const passEls = inputs.filter((el) => el.type === "password");
  if (emailEl) setVal(emailEl, email);
  passEls.forEach((el) => setVal(el, password));
  return { email: !!emailEl, passwords: passEls.length };
}

/* ---------- events ---------- */
$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("l-err").hidden = true; $("l-btn").disabled = true;
  try {
    const r = await api("/api/login", { method: "POST", body: { email: $("l-email").value.trim(), password: $("l-pass").value, remember: true } });
    state.token = r.token; state.me = r.email;
    await store.set({ token: r.token, me: r.email });
    $("l-pass").value = "";
    await show();
  } catch (err) { $("l-err").textContent = errText(err); $("l-err").hidden = false; }
  $("l-btn").disabled = false;
});

async function logout(silent) {
  if (!silent) { try { await api("/api/logout", { method: "POST" }); } catch { /* fine */ } }
  state.token = ""; state.me = "";
  await store.set({ token: "", me: "" });
  await show();
}
$("logout").addEventListener("click", () => logout(false));

$("make").addEventListener("click", async () => {
  if (!tab) return;
  $("make-err").hidden = true; $("make").disabled = true;
  try {
    const r = await api("/api/sites", { method: "POST", body: { site: tab.site, host: baseHost(tab.host), hours: life } });
    const password = makePassword();
    state.saved[r.local] = { address: r.address, password, host: baseHost(tab.host), createdAt: Date.now(), expiresAt: r.expiresAt || null };
    await store.set({ saved: state.saved });
    setCurrent({ local: r.local, address: r.address, password, host: baseHost(tab.host), expiresAt: r.expiresAt || null });
    $("site-note").textContent = "מוכן! העתיקו או מלאו בדף.";
    $("make").lastChild.textContent = " צור אימייל וסיסמה חדשים";
  } catch (e) { $("make-err").textContent = errText(e); $("make-err").hidden = false; }
  $("make").disabled = !tab;
});

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-copy]");
  if (!b) return;
  const el = $(b.dataset.copy);
  copy(el.dataset.real || el.textContent, b);
});
function pickLife(h) {
  life = Number(h) || 0;
  document.querySelectorAll("#life button").forEach((b) => b.classList.toggle("on", Number(b.dataset.h) === life));
}
$("life").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  pickLife(b.dataset.h); store.set({ life });
});
$("c-life-set").addEventListener("change", async (e) => {
  if (!current || e.target.value === "") return;
  try { await changeLife(current.local, e.target.value); } catch (err) { toast(errText(err)); showLife(); }
});

$("eye").addEventListener("click", () => hidePass(!$("c-pass").classList.contains("hide")));

$("fill").addEventListener("click", async () => {
  if (!tab || !current) return;
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: fillPage, args: [current.address, current.password] });
    const r = res?.result || {};
    if (!r.email && !r.passwords) toast("לא מצאתי שדות הרשמה בדף. אפשר להעתיק ולהדביק.");
    else if (!r.email) toast("הסיסמה מולאה. את האימייל תדביקו בעצמכם.");
    else if (!r.passwords) toast("האימייל מולא. את הסיסמה תדביקו כשתגיעו לשדה שלה.");
    else toast("מולא ✓");
  } catch { toast("אי אפשר למלא בדף הזה. אפשר להעתיק ולהדביק."); }
});

$("check").addEventListener("click", async () => {
  if (!current) return;
  const out = $("code-out");
  out.className = "muted"; out.textContent = "בודק…";
  try {
    const { messages } = await api(`/api/sites/${current.local}/latest`);
    if (!messages.length) { out.textContent = "עוד לא הגיע מייל לכתובת הזאת. נסו שוב בעוד כמה שניות."; return; }
    out.className = ""; out.replaceChildren();
    for (const m of messages.slice(0, 3)) {
      const d = document.createElement("div"); d.className = "msg";
      const s = document.createElement("div"); s.className = "subj"; s.textContent = m.subject; s.title = `${m.from} · ${new Date(m.date).toLocaleString("he-IL")}`;
      d.append(s);
      if (m.code) {
        const c = document.createElement("div"); c.className = "code";
        const code = document.createElement("code"); code.textContent = m.code;
        const b = document.createElement("button"); b.className = "copy"; b.textContent = "העתק קוד"; b.onclick = () => copy(m.code, b);
        c.append(code, b); d.append(c);
      }
      if (m.link) {
        const a = document.createElement("a"); a.href = m.link; a.target = "_blank"; a.rel = "noopener noreferrer"; a.textContent = "פתח את קישור האישור ←";
        d.append(a);
      }
      out.append(d);
    }
  } catch (e) { out.className = "err"; out.textContent = errText(e); }
});

document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => {
  document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("on", x === b));
  $("tab-here").hidden = b.dataset.tab !== "here";
  $("tab-all").hidden = b.dataset.tab !== "all";
  if (b.dataset.tab === "all") renderList();
}));
let searchTimer;
$("search").addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(renderList, 200); });

/* ---------- start ---------- */
(async () => {
  const s = await store.get(["api", "token", "me", "saved", "life"]);
  state = { api: s.api || DEFAULT_API, token: s.token || "", me: s.me || "", saved: s.saved || {} };
  pickLife(s.life || 0);
  await show();
})();
