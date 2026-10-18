import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Check, CheckCircle2, Loader2, PartyPopper, X } from "lucide-react";
import AuthLayout from "../components/AuthLayout.jsx";
import FormField from "../components/FormField.jsx";
import { BRAND } from "../config.js";
import { PASSWORD_MIN, passwordChecks, sanitizeUsername, validateUsername } from "../lib/validation.js";
import { checkUsernameAvailable, signUp } from "../lib/api.js";
import { startSession } from "../lib/session.js";
import { useErrorText, useI18n } from "../lib/i18n.jsx";

const strengthColor = ["bg-rose-500", "bg-rose-500", "bg-amber-500", "bg-lime-500", "bg-emerald-500"];

function PasswordStrength({ password }) {
  const { t } = useI18n();
  const { checks, score } = passwordChecks(password);
  if (!password) return null;
  const labels = t("signup.checks");
  return (
    <div className="mt-3">
      <div className="flex gap-1.5" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full ${i < score ? strengthColor[score] : "bg-slate-200"}`} />
        ))}
      </div>
      <p className="mt-2 text-xs font-semibold text-slate-600">{t("signup.strength", { label: t("signup.strengthLabels")[score] })}</p>
      <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
        {checks.map((ok, i) => (
          <li key={i} className={`flex items-center gap-1.5 text-xs ${ok ? "text-emerald-700" : "text-slate-500"}`}>
            {ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />} {labels[i].replace("{n}", PASSWORD_MIN)}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Debounced availability check. status: idle | checking | available | taken | unknown */
function useAvailability(username) {
  const [status, setStatus] = useState("idle");
  useEffect(() => {
    if (validateUsername(username)) { setStatus("idle"); return; }
    let cancelled = false;
    setStatus("checking");
    const timer = setTimeout(async () => {
      try {
        const ok = await checkUsernameAvailable(username);
        if (!cancelled) setStatus(ok ? "available" : "taken");
      } catch {
        if (!cancelled) setStatus("unknown"); // server unreachable: let the sign-up request decide
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [username]);
  return status;
}

export default function SignUp() {
  const { t } = useI18n();
  const errorText = useErrorText();
  const [params] = useSearchParams();
  const [username, setUsername] = useState(sanitizeUsername(params.get("u") || ""));
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [agree, setAgree] = useState(false);
  const [touched, setTouched] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [created, setCreated] = useState(null);
  const navigate = useNavigate();

  const availability = useAvailability(username);
  const uErr = validateUsername(username);

  const errors = {
    username: uErr ? t(uErr.key, uErr.vars) : availability === "taken" ? t("validation.taken") : "",
    password: password.length < PASSWORD_MIN
      ? t("validation.passwordShort", { n: PASSWORD_MIN })
      : passwordChecks(password).score < 3 ? t("validation.passwordMix") : "",
    confirm: confirm !== password ? t("validation.mismatch") : "",
    agree: agree ? "" : t("validation.acceptTerms"),
  };
  const isValid = Object.values(errors).every((e) => !e) && (availability === "available" || availability === "unknown");
  const show = (field) => ((touched[field] || touched.submit) && errors[field]) || "";

  const onSubmit = async (e) => {
    e.preventDefault();
    setTouched((tt) => ({ ...tt, submit: true }));
    setFormError("");
    if (!isValid) return;
    setSubmitting(true);
    try {
      const res = await signUp({ username, password });
      startSession(res);
      setCreated(res.email);
    } catch (err) {
      setFormError(errorText(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (created) {
    return (
      <AuthLayout title={t("signup.doneTitle")} subtitle={t("signup.doneSubtitle")}>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
          <PartyPopper className="mx-auto h-10 w-10 text-emerald-600" />
          <p className="mt-3 text-sm text-emerald-800">{t("signup.yourAddress")}</p>
          <p dir="ltr" className="mt-1 break-all text-xl font-extrabold text-slate-900">{created}</p>
        </div>
        <button onClick={() => navigate("/inbox")} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-3.5 font-semibold text-white hover:bg-brand-500">
          {t("signup.openInbox")} <ArrowRight className="h-4 w-4 rtl:rotate-180" />
        </button>
      </AuthLayout>
    );
  }

  const usernameHint =
    availability === "checking" ? (
      <span className="inline-flex items-center gap-1.5"><Loader2 className="h-4 w-4 animate-spin" /> {t("signup.checking")}</span>
    ) : availability === "available" ? (
      <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
        <CheckCircle2 className="h-4 w-4" /> {t("signup.available", { address: <bdi dir="ltr">{username}@{BRAND.domain}</bdi> })}
      </span>
    ) : (
      t("signup.hint")
    );

  return (
    <AuthLayout
      title={t("signup.title")}
      subtitle={t("signup.subtitle")}
      footer={<>{t("signup.haveAccount")} <Link to="/login" className="font-semibold text-brand-600 hover:text-brand-700">{t("signup.login")}</Link></>}
    >
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <FormField
          id="username"
          dir="ltr"
          label={t("signup.address")}
          placeholder="yourname"
          autoComplete="username"
          autoFocus
          suffix={`@${BRAND.domain}`}
          value={username}
          onChange={(e) => setUsername(sanitizeUsername(e.target.value))}
          onBlur={() => setTouched((tt) => ({ ...tt, username: true }))}
          error={((touched.username || touched.submit || availability === "taken") && errors.username) || ""}
          hint={usernameHint}
        />

        <div>
          <FormField
            id="password"
            type="password"
            dir="ltr"
            label={t("signup.password")}
            placeholder={t("signup.passwordPlaceholder")}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onBlur={() => setTouched((tt) => ({ ...tt, password: true }))}
            error={show("password")}
          />
          <PasswordStrength password={password} />
        </div>

        <FormField
          id="confirm"
          type="password"
          dir="ltr"
          label={t("signup.confirm")}
          placeholder={t("signup.confirmPlaceholder")}
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          onBlur={() => setTouched((tt) => ({ ...tt, confirm: true }))}
          error={show("confirm")}
        />

        <div>
          <label className="flex items-start gap-3 text-sm text-slate-600">
            <input
              id="agree"
              type="checkbox"
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-brand-600"
            />
            <span>
              {t("signup.agree", {
                terms: <a href="#" className="font-semibold text-brand-600 hover:underline">{t("signup.terms")}</a>,
                privacy: <a href="#" className="font-semibold text-brand-600 hover:underline">{t("signup.privacyPolicy")}</a>,
              })}
            </span>
          </label>
          {show("agree") && <p className="mt-1.5 text-sm text-rose-600">{errors.agree}</p>}
        </div>

        {formError && (
          <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{formError}</p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-3.5 font-semibold text-white shadow-lg shadow-brand-600/20 transition hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {submitting
            ? <><Loader2 className="h-5 w-5 animate-spin" /> {t("signup.submitting")}</>
            : <>{t("signup.submit")} <ArrowRight className="h-4 w-4 rtl:rotate-180" /></>}
        </button>

        <p className="text-center text-xs text-slate-500">{t("signup.footnote")}</p>
      </form>
    </AuthLayout>
  );
}
