import { Languages, Monitor, Moon, Sun } from "lucide-react";
import { useI18n } from "../lib/i18n.jsx";
import { useTheme } from "../lib/theme.jsx";

const THEME_ICON = { light: Sun, dark: Moon, system: Monitor };

/** Language switch (עברית / English) and theme switch (system → light → dark). */
export default function Preferences({ className = "", compact = false }) {
  const { t, toggleLang } = useI18n();
  const { theme, cycleTheme } = useTheme();
  const ThemeIcon = THEME_ICON[theme];
  const nextTheme = { system: "light", light: "dark", dark: "system" }[theme];

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <button
        type="button"
        onClick={toggleLang}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
        aria-label={t("prefs.languageLabel")}
        title={t("prefs.languageLabel")}
      >
        <Languages className="h-4 w-4" aria-hidden="true" />
        {!compact && <span>{t("prefs.language")}</span>}
      </button>
      <button
        type="button"
        onClick={cycleTheme}
        className="grid h-9 w-9 place-items-center rounded-lg text-slate-700 transition hover:bg-slate-100"
        aria-label={`${t(`prefs.theme.${theme}`)} → ${t(`prefs.theme.${nextTheme}`)}`}
        title={t(`prefs.theme.${theme}`)}
      >
        <ThemeIcon className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
