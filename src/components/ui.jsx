import { useEffect, useRef } from "react";
import { AlertTriangle, Info, PartyPopper, X } from "lucide-react";

/* ---------- Announcement banner (inbox + admin preview) ---------- */

const BANNER = {
  info: { icon: Info, cls: "border-brand-200 bg-brand-50 text-brand-800" },
  warning: { icon: AlertTriangle, cls: "border-amber-300/60 bg-amber-50 text-amber-800" },
  success: { icon: PartyPopper, cls: "border-emerald-200 bg-emerald-50 text-emerald-800" },
};

export function AnnouncementBanner({ text, level = "info", onDismiss, dismissLabel }) {
  const { icon: Icon, cls } = BANNER[level] || BANNER.info;
  return (
    <div role="status" className={`flex items-start gap-3 border px-4 py-3 text-sm ${cls}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p dir="auto" className="min-w-0 flex-1 leading-relaxed">{text}</p>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="-m-1 rounded p-1 opacity-70 hover:opacity-100" aria-label={dismissLabel}>
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/* ---------- Modal dialog ---------- */

export function Modal({ title, children, onClose, footer, tone = "default", wide = false }) {
  const panel = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    panel.current?.querySelector("input, button, textarea, select")?.focus();
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); prev?.focus?.(); };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onClick={(e) => e.stopPropagation()}
        className={`w-full ${wide ? "max-w-3xl" : "max-w-md"} overflow-hidden rounded-t-2xl bg-surface shadow-2xl sm:rounded-2xl`}
      >
        <div className={`h-1 ${tone === "danger" ? "bg-rose-500" : "bg-brand-600"}`} />
        <div className="p-6">
          <h2 id="modal-title" className="text-lg font-bold text-slate-900">{title}</h2>
          <div className="mt-3 text-sm leading-relaxed text-slate-600">{children}</div>
        </div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------- Buttons ---------- */

const BTN = {
  primary: "bg-brand-600 text-white hover:bg-brand-500",
  danger: "bg-rose-600 text-white hover:bg-rose-500 dark:bg-rose-500 dark:text-[#2d1418]",
  ghost: "border border-slate-300 text-slate-700 hover:bg-slate-100",
};
export function Button({ variant = "primary", className = "", ...props }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${BTN[variant]} ${className}`}
      {...props}
    />
  );
}

/* ---------- On/off switch ---------- */

export function Toggle({ id, checked, onChange, label, description, disabled }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-semibold text-slate-800">{label}</label>
        {description && <p className="mt-1 text-sm leading-relaxed text-slate-500">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full transition disabled:opacity-60 ${checked ? "bg-brand-600" : "bg-slate-300"}`}
      >
        <span
          className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? "ltr:translate-x-6 rtl:-translate-x-6" : "ltr:translate-x-1 rtl:-translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}
