import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ArrowLeft, Bell, Camera, Check, KeyRound, Loader2, Smartphone, Trash2, UserRound } from "lucide-react";
import { BRAND } from "../config.js";
import LogoMark from "../components/LogoMark.jsx";
import SenderAvatar from "../components/SenderAvatar.jsx";
import FormField from "../components/FormField.jsx";
import Preferences from "../components/Preferences.jsx";
import InstallDialog from "../components/InstallDialog.jsx";
import { Button, Modal } from "../components/ui.jsx";
import { endSession, getSession, useSessionVersion } from "../lib/session.js";
import { useErrorText, useI18n } from "../lib/i18n.jsx";
import { bumpAvatars } from "../lib/avatars.js";
import { enablePush, pushSupported, unlinkPush, useInstall } from "../lib/pwa.js";
import { passwordChecks, PASSWORD_MIN } from "../lib/validation.js";
import { AuthError, changePassword, deleteAccount, getMe, getProfile, logOut, removeAvatar, setAvatar, updateProfile } from "../lib/api.js";

/** Square-crop and shrink a picture to 256px JPEG in the browser (keeps uploads small). */
function toAvatarDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!/^image\//.test(file.type)) return reject(new Error("type"));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 256;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, 256, 256);
      ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 256, 256);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.86));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("type")); };
    img.src = url;
  });
}

function Section({ icon: Icon, title, desc, children, danger }) {
  return (
    <section className={`rounded-2xl border bg-surface p-5 sm:p-6 ${danger ? "border-rose-200" : "border-slate-200"}`}>
      <div className="flex items-start gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${danger ? "bg-rose-50 text-rose-600" : "bg-brand-50 text-brand-700"}`}><Icon className="h-5 w-5" /></span>
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          {desc && <p className="mt-0.5 text-sm leading-relaxed text-slate-500">{desc}</p>}
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function SavedNote({ show, text }) {
  if (!show) return null;
  return <span role="status" className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700"><Check className="h-4 w-4" /> {text}</span>;
}

/* ---------- Profile ---------- */

function ProfileSection({ email, profile, onChange, onAuth }) {
  const { t } = useI18n();
  const errorText = useErrorText();
  const fileRef = useRef(null);
  const [name, setName] = useState(profile.displayName);
  const [signature, setSignature] = useState(profile.signature);
  const [busy, setBusy] = useState(null); // "photo" | "save"
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const fail = (e) => { if (e instanceof AuthError) return onAuth(); setError(errorText(e)); };

  const pickPhoto = async (file) => {
    if (!file) return;
    setError("");
    setBusy("photo");
    try {
      const dataUrl = await toAvatarDataUrl(file);
      onChange(await setAvatar(dataUrl));
      bumpAvatars();
    } catch (e) {
      if (e.message === "type") setError(t("errors.avatar_type")); else fail(e);
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const dropPhoto = async () => {
    setBusy("photo");
    try { onChange(await removeAvatar()); bumpAvatars(); } catch (e) { fail(e); } finally { setBusy(null); }
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy("save");
    setError("");
    try {
      onChange(await updateProfile({ displayName: name, signature }));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) { fail(err); } finally { setBusy(null); }
  };

  return (
    <Section icon={UserRound} title={t("settings.profile")} desc={t("settings.profileDesc")}>
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative">
          <SenderAvatar name={name || email} email={email} size={84} />
          {busy === "photo" && <span className="absolute inset-0 grid place-items-center rounded-full bg-black/40"><Loader2 className="h-6 w-6 animate-spin text-white" /></span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <input ref={fileRef} id="avatar-file" type="file" accept="image/*" className="sr-only" onChange={(e) => pickPhoto(e.target.files?.[0])} />
          <Button variant="ghost" onClick={() => fileRef.current?.click()} disabled={!!busy}><Camera className="h-4 w-4" /> {profile.hasAvatar ? t("settings.changePhoto") : t("settings.addPhoto")}</Button>
          {profile.hasAvatar && <Button variant="ghost" onClick={dropPhoto} disabled={!!busy}>{t("settings.removePhoto")}</Button>}
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500">{t("settings.photoHint")}</p>

      <form onSubmit={save} className="mt-5 space-y-4">
        <FormField id="display-name" dir="auto" label={t("settings.displayName")} hint={t("settings.displayNameHint", { email })} placeholder={email.split("@")[0]} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        <div>
          <label htmlFor="signature" className="block text-sm font-semibold text-slate-800">{t("settings.signature")}</label>
          <textarea id="signature" dir="auto" rows={3} maxLength={1000} value={signature} onChange={(e) => setSignature(e.target.value)} placeholder={t("settings.signaturePlaceholder")}
            className="mt-1.5 w-full resize-y rounded-xl border border-slate-300 bg-surface px-4 py-3 text-sm leading-relaxed text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100" />
          <p className="mt-1 text-xs text-slate-500">{t("settings.signatureHint")}</p>
        </div>
        {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={!!busy}>{busy === "save" && <Loader2 className="h-4 w-4 animate-spin" />}{t("settings.save")}</Button>
          <SavedNote show={saved} text={t("settings.saved")} />
        </div>
      </form>
    </Section>
  );
}

/* ---------- App & notifications ---------- */

function AppSection() {
  const { t } = useI18n();
  const app = useInstall();
  const [permission, setPermission] = useState(typeof Notification !== "undefined" ? Notification.permission : "unsupported");
  const [busy, setBusy] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const turnOn = async () => { setBusy(true); setPermission(await enablePush()); setBusy(false); };
  const install = async () => { if (app.canPrompt) await app.install(); else setShowHelp(true); };

  return (
    <Section icon={Smartphone} title={t("settings.app")} desc={t("settings.appDesc")}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-4">
          <div className="flex items-center gap-3">
            <LogoMark size={40} />
            <div>
              <p className="font-semibold text-slate-900">{t("settings.installTitle")}</p>
              <p className="text-sm text-slate-500">{app.installed ? t("settings.installed") : t("settings.installHint")}</p>
            </div>
          </div>
          {!app.installed && <Button onClick={install}><Smartphone className="h-4 w-4" /> {t("install.menu")}</Button>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-surface text-brand-600"><Bell className="h-5 w-5" /></span>
            <div>
              <p className="font-semibold text-slate-900">{t("settings.pushTitle")}</p>
              <p className="text-sm text-slate-500">
                {permission === "granted" ? t("settings.pushOn") : permission === "denied" ? t("inbox.notifyBlocked") : !pushSupported ? t("settings.pushUnsupported") : t("settings.pushHint")}
              </p>
            </div>
          </div>
          {permission === "default" && pushSupported && <Button variant="ghost" onClick={turnOn} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{t("inbox.notifyOn")}</Button>}
        </div>
      </div>
      {showHelp && <InstallDialog ios={app.ios} onClose={() => setShowHelp(false)} />}
    </Section>
  );
}

/* ---------- Password ---------- */

function PasswordSection({ onAuth }) {
  const { t } = useI18n();
  const errorText = useErrorText();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const weak = next && (next.length < PASSWORD_MIN || passwordChecks(next).score < 3);
  const mismatch = confirm && confirm !== next;
  const ready = current && next && confirm && !weak && !mismatch;

  const submit = async (e) => {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError("");
    try {
      await changePassword(current, next);
      setCurrent(""); setNext(""); setConfirm("");
      setSaved(true);
      setTimeout(() => setSaved(false), 4000);
    } catch (err) {
      if (err instanceof AuthError) return onAuth();
      setError(errorText(err));
    } finally { setBusy(false); }
  };

  return (
    <Section icon={KeyRound} title={t("settings.password")} desc={t("settings.passwordDesc")}>
      <form onSubmit={submit} className="space-y-4">
        <FormField id="pw-current" type="password" dir="ltr" autoComplete="current-password" label={t("settings.currentPassword")} value={current} onChange={(e) => setCurrent(e.target.value)} />
        <FormField id="pw-new" type="password" dir="ltr" autoComplete="new-password" label={t("settings.newPassword")} value={next} onChange={(e) => setNext(e.target.value)}
          error={weak ? (next.length < PASSWORD_MIN ? t("validation.passwordShort", { n: PASSWORD_MIN }) : t("validation.passwordMix")) : ""} />
        <FormField id="pw-confirm" type="password" dir="ltr" autoComplete="new-password" label={t("settings.confirmPassword")} value={confirm} onChange={(e) => setConfirm(e.target.value)}
          error={mismatch ? t("validation.mismatch") : ""} />
        {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={busy || !ready}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{t("settings.changePassword")}</Button>
          <SavedNote show={saved} text={t("settings.passwordChanged")} />
        </div>
      </form>
    </Section>
  );
}

/* ---------- Delete account ---------- */

function DeleteSection({ email, isAdmin, onDeleted, onAuth }) {
  const { t } = useI18n();
  const errorText = useErrorText();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const name = email.split("@")[0];

  const run = async () => {
    setBusy(true);
    setError("");
    try {
      await deleteAccount(password);
      onDeleted();
    } catch (err) {
      if (err instanceof AuthError) return onAuth();
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <Section icon={Trash2} danger title={t("settings.delete")} desc={t("settings.deleteDesc")}>
      {isAdmin ? (
        <p className="text-sm text-slate-500">{t("settings.deleteAdmin")}</p>
      ) : (
        <Button variant="danger" onClick={() => setOpen(true)}><Trash2 className="h-4 w-4" /> {t("settings.deleteButton")}</Button>
      )}
      {open && (
        <Modal tone="danger" title={t("settings.deleteTitle", { email })} onClose={() => setOpen(false)}
          footer={<>
            <Button variant="ghost" onClick={() => setOpen(false)}>{t("admin.users.cancel")}</Button>
            <Button variant="danger" onClick={run} disabled={busy || !password || confirm.toLowerCase() !== name}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{t("settings.deleteForever")}</Button>
          </>}>
          <p>{t("settings.deleteText")}</p>
          <label htmlFor="del-confirm" className="mt-4 block text-sm font-semibold text-slate-800">{t("admin.users.deleteConfirm", { name: <code dir="ltr" className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-900">{name}</code> })}</label>
          <input id="del-confirm" dir="ltr" autoComplete="off" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-surface px-3 py-2.5 font-mono text-sm text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-4 focus:ring-rose-200" />
          <label htmlFor="del-password" className="mt-4 block text-sm font-semibold text-slate-800">{t("settings.currentPassword")}</label>
          <input id="del-password" type="password" dir="ltr" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-surface px-3 py-2.5 text-sm text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-4 focus:ring-rose-200" />
          {error && <p role="alert" className="mt-3 text-rose-600">{error}</p>}
        </Modal>
      )}
    </Section>
  );
}

/* ---------- Page ---------- */

export default function SettingsPage() {
  useSessionVersion();
  const email = getSession()?.email;
  if (!email) return <Navigate to="/login" replace />;
  return <Settings key={email} email={email} />;
}

function Settings({ email }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const onAuth = () => { endSession(email); navigate(getSession() ? "/inbox" : "/login", { replace: true }); };

  useEffect(() => {
    const original = document.title;
    document.title = `${t("settings.title")} · ${BRAND.short}`;
    return () => { document.title = original; };
  }, [t]);

  useEffect(() => {
    getProfile().then(setProfile).catch((e) => { if (e instanceof AuthError) onAuth(); else setProfile({ displayName: "", signature: "", hasAvatar: false }); });
    getMe().then((me) => setIsAdmin(!!me.isAdmin)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onDeleted = async () => {
    await unlinkPush();
    await logOut().catch(() => {});
    endSession(email);
    navigate(getSession() ? "/inbox" : "/", { replace: true });
  };

  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/inbox" className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100">
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {t("settings.back")}
          </Link>
          <Preferences compact />
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-5 px-4 py-8 sm:px-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">{t("settings.title")}</h1>
          <p dir="ltr" className="mt-1 text-slate-500 rtl:text-right">{email}</p>
        </div>
        {!profile ? (
          <div className="grid place-items-center py-16 text-slate-400"><Loader2 className="h-8 w-8 animate-spin" /></div>
        ) : (
          <>
            <ProfileSection email={email} profile={profile} onChange={setProfile} onAuth={onAuth} />
            <AppSection />
            <PasswordSection onAuth={onAuth} />
            <DeleteSection email={email} isAdmin={isAdmin} onDeleted={onDeleted} onAuth={onAuth} />
          </>
        )}
      </main>
    </div>
  );
}
