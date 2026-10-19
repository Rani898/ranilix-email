import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, LogIn } from "lucide-react";
import AuthLayout from "../components/AuthLayout.jsx";
import FormField from "../components/FormField.jsx";
import { BRAND } from "../config.js";
import { logIn } from "../lib/api.js";
import { getSession, startSession } from "../lib/session.js";
import { useErrorText, useI18n } from "../lib/i18n.jsx";

/** Accepts either "name" or "name@ranilix.com". */
function normalizeEmail(value) {
  const v = value.trim().toLowerCase();
  if (!v) return "";
  return v.includes("@") ? v : `${v}@${BRAND.domain}`;
}

export default function Login() {
  const { t } = useI18n();
  const errorText = useErrorText();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  // "?add=1": signing in to one more account while another is already open.
  const [params] = useSearchParams();
  const adding = params.has("add") && !!getSession();

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password) {
      setError(t("validation.fillBoth"));
      return;
    }
    setSubmitting(true);
    try {
      const res = await logIn({ email: normalizeEmail(email), password, remember });
      startSession(res, remember);
      navigate("/inbox");
    } catch (err) {
      setError(errorText(err));
      setSubmitting(false);
    }
  };

  if (getSession() && !adding) return <Navigate to="/inbox" replace />;

  return (
    <AuthLayout
      title={adding ? t("accounts.addTitle") : t("login.title")}
      subtitle={adding ? t("accounts.addSubtitle") : t("login.subtitle")}
      footer={<>
        {t("login.newHere")} <Link to="/signup" className="font-semibold text-brand-600 hover:text-brand-700">{t("login.create")}</Link>
        {adding && <span className="mt-3 block"><Link to="/inbox" className="font-semibold text-slate-600 hover:text-slate-900">{t("accounts.back")}</Link></span>}
      </>}
    >
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <FormField
          id="email"
          dir="ltr"
          label={t("login.email")}
          placeholder={`yourname@${BRAND.domain}`}
          autoComplete="username"
          autoFocus
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          hint={t("login.emailHint")}
        />
        <FormField
          id="password"
          type="password"
          dir="ltr"
          label={t("login.password")}
          placeholder={t("login.passwordPlaceholder")}
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          right={<a href="#" className="text-sm font-semibold text-brand-600 hover:text-brand-700">{t("login.forgot")}</a>}
        />

        <label className="flex items-center gap-3 text-sm text-slate-600">
          <input
            id="remember"
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 accent-brand-600"
          />
          {t("login.remember")}
        </label>

        {error && (
          <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-3.5 font-semibold text-white shadow-lg shadow-brand-600/20 transition hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {submitting ? <><Loader2 className="h-5 w-5 animate-spin" /> {t("login.submitting")}</> : <><LogIn className="h-4 w-4 rtl:rotate-180" /> {t("login.submit")}</>}
        </button>
      </form>
    </AuthLayout>
  );
}
