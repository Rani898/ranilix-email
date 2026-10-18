import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Loader2, LogIn } from "lucide-react";
import AuthLayout from "../components/AuthLayout.jsx";
import FormField from "../components/FormField.jsx";
import { BRAND } from "../config.js";
import { logIn } from "../lib/api.js";
import { getSession, startSession } from "../lib/session.js";

/** Accepts either "name" or "name@ranilix.com". */
function normalizeEmail(value) {
  const v = value.trim().toLowerCase();
  if (!v) return "";
  return v.includes("@") ? v : `${v}@${BRAND.domain}`;
}

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await logIn({ email: normalizeEmail(email), password, remember });
      startSession(res, remember);
      navigate("/inbox");
    } catch (err) {
      // Keep this message generic in production so it doesn't reveal which accounts exist.
      setError(err.message || "That email or password isn't right.");
    } finally {
      setSubmitting(false);
    }
  };

  if (getSession()) return <Navigate to="/inbox" replace />;

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to your free inbox."
      footer={<>New here? <Link to="/signup" className="font-semibold text-brand-600 hover:text-brand-700">Create a free email</Link></>}
    >
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <FormField
          id="email"
          label="Email address"
          placeholder={`yourname@${BRAND.domain}`}
          autoComplete="username"
          autoFocus
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          hint="You can type just your name — we'll add the rest."
        />
        <FormField
          id="password"
          type="password"
          label="Password"
          placeholder="Your password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          right={<a href="#" className="text-sm font-semibold text-brand-600 hover:text-brand-700">Forgot password?</a>}
        />

        <label className="flex items-center gap-3 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 accent-brand-600"
          />
          Keep me signed in on this device
        </label>

        {error && (
          <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-3.5 font-semibold text-white shadow-lg shadow-brand-600/20 transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {submitting ? <><Loader2 className="h-5 w-5 animate-spin" /> Logging in…</> : <><LogIn className="h-4 w-4" /> Log in</>}
        </button>
      </form>
    </AuthLayout>
  );
}
