import { useState } from "react";
import { AlertCircle, Eye, EyeOff } from "lucide-react";

/** Labeled input with error/hint text, optional suffix (e.g. "@ranilix.com") and password show/hide. */
export default function FormField({ id, label, error, hint, suffix, type = "text", right, ...props }) {
  const [show, setShow] = useState(false);
  const isPassword = type === "password";
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="block text-sm font-semibold text-slate-800">{label}</label>
        {right}
      </div>
      <div
        className={`mt-1.5 flex items-center rounded-xl border bg-white transition focus-within:ring-4 ${
          error ? "border-rose-400 focus-within:ring-rose-100" : "border-slate-300 focus-within:border-brand-500 focus-within:ring-brand-100"
        }`}
      >
        <input
          id={id}
          type={isPassword && show ? "text" : type}
          aria-invalid={!!error}
          aria-describedby={describedBy}
          className="w-full min-w-0 rounded-xl bg-transparent px-4 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none"
          {...props}
        />
        {suffix && <span className="shrink-0 pr-4 text-base font-medium text-slate-500">{suffix}</span>}
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="mr-2 rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            aria-label={show ? "Hide password" : "Show password"}
          >
            {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        )}
      </div>
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 flex items-center gap-1.5 text-sm text-rose-600">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </p>
      ) : hint ? (
        <div id={`${id}-hint`} className="mt-1.5 text-sm text-slate-500">{hint}</div>
      ) : null}
    </div>
  );
}
