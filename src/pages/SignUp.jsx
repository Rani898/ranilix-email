import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, Check, CheckCircle2, Loader2, PartyPopper, X } from "lucide-react";
import AuthLayout from "../components/AuthLayout.jsx";
import FormField from "../components/FormField.jsx";
import { BRAND } from "../config.js";
import { PASSWORD_MIN, passwordChecks, sanitizeUsername, validateUsername } from "../lib/validation.js";
import { checkUsernameAvailable, signUp } from "../lib/api.js";

const strengthLabel = ["Too weak", "Weak", "Fair", "Good", "Strong"];
const strengthColor = ["bg-rose-500", "bg-rose-500", "bg-amber-500", "bg-lime-500", "bg-emerald-500"];

function PasswordStrength({ password }) {
  const { checks, score } = passwordChecks(password);
  if (!password) return null;
  return (
    <div className="mt-3">
      <div className="flex gap-1.5" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full ${i < score ? strengthColor[score] : "bg-slate-200"}`} />
        ))}
      </div>
      <p className="mt-2 text-xs font-semibold text-slate-600">Strength: {strengthLabel[score]}</p>
      <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
        {checks.map((c) => (
          <li key={c.label} className={`flex items-center gap-1.5 text-xs ${c.ok ? "text-emerald-700" : "text-slate-500"}`}>
            {c.ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />} {c.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Debounced availability check. status: idle | checking | available | taken */
function useAvailability(username) {
  const [status, setStatus] = useState("idle");
  useEffect(() => {
    if (validateUsername(username)) { setStatus("idle"); return; }
    let cancelled = false;
    setStatus("checking");
    const t = setTimeout(async () => {
      const ok = await checkUsernameAvailable(username);
      if (!cancelled) setStatus(ok ? "available" : "taken");
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [username]);
  return status;
}

export default function SignUp() {
  const [params] = useSearchParams();
  const [username, setUsername] = useState(sanitizeUsername(params.get("u") || ""));
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [agree, setAgree] = useState(false);
  const [touched, setTouched] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [created, setCreated] = useState(null);

  const availability = useAvailability(username);

  const errors = {
    username: validateUsername(username) || (availability === "taken" ? "Sorry, that name is taken. Try another." : ""),
    password: password.length < PASSWORD_MIN ? `Use at least ${PASSWORD_MIN} characters.` : passwordChecks(password).score < 3 ? "Add a mix of letters, numbers or symbols." : "",
    confirm: confirm !== password ? "Passwords don't match." : "",
    agree: agree ? "" : "Please accept the terms to continue.",
  };
  const isValid = Object.values(errors).every((e) => !e) && availability === "available";
  const show = (field) => (touched[field] || touched.submit) && errors[field];

  const onSubmit = async (e) => {
    e.preventDefault();
    setTouched((t) => ({ ...t, submit: true }));
    setFormError("");
    if (!isValid) return;
    setSubmitting(true);
    try {
      const res = await signUp({ username, password });
      setCreated(res.email);
    } catch (err) {
      setFormError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (created) {
    return (
      <AuthLayout title="You're all set!" subtitle="Your free inbox is ready to use.">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
          <PartyPopper className="mx-auto h-10 w-10 text-emerald-600" />
          <p className="mt-3 text-sm text-emerald-800">Your new address</p>
          <p className="mt-1 break-all text-xl font-extrabold text-slate-900">{created}</p>
        </div>
        <Link to="/login" className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-3.5 font-semibold text-white hover:bg-brand-700">
          Go to my inbox <ArrowRight className="h-4 w-4" />
        </Link>
      </AuthLayout>
    );
  }

  const usernameHint =
    availability === "checking" ? (
      <span className="inline-flex items-center gap-1.5"><Loader2 className="h-4 w-4 animate-spin" /> Checking availability…</span>
    ) : availability === "available" ? (
      <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700"><CheckCircle2 className="h-4 w-4" /> {username}@{BRAND.domain} is available!</span>
    ) : (
      "Letters, numbers, dots, dashes and underscores."
    );

  return (
    <AuthLayout
      title="Create your free email"
      subtitle="No credit card. Takes about a minute."
      footer={<>Already have an account? <Link to="/login" className="font-semibold text-brand-600 hover:text-brand-700">Log in</Link></>}
    >
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <FormField
          id="username"
          label="Choose your email address"
          placeholder="yourname"
          autoComplete="username"
          autoFocus
          suffix={`@${BRAND.domain}`}
          value={username}
          onChange={(e) => setUsername(sanitizeUsername(e.target.value))}
          onBlur={() => setTouched((t) => ({ ...t, username: true }))}
          error={(touched.username || touched.submit || availability === "taken") && errors.username}
          hint={usernameHint}
        />

        <div>
          <FormField
            id="password"
            type="password"
            label="Create a password"
            placeholder="At least 8 characters"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, password: true }))}
            error={show("password")}
          />
          <PasswordStrength password={password} />
        </div>

        <FormField
          id="confirm"
          type="password"
          label="Confirm password"
          placeholder="Type it again"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, confirm: true }))}
          error={show("confirm")}
        />

        <div>
          <label className="flex items-start gap-3 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-brand-600"
            />
            <span>
              I agree to the <a href="#" className="font-semibold text-brand-600 hover:underline">Terms</a> and{" "}
              <a href="#" className="font-semibold text-brand-600 hover:underline">Privacy Policy</a>.
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
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-3.5 font-semibold text-white shadow-lg shadow-brand-600/20 transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {submitting ? <><Loader2 className="h-5 w-5 animate-spin" /> Creating your inbox…</> : <>Create my free email <ArrowRight className="h-4 w-4" /></>}
        </button>

        <p className="text-center text-xs text-slate-500">Free forever · No credit card required</p>
      </form>
    </AuthLayout>
  );
}
