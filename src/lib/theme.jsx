import { createContext, useContext, useEffect, useMemo, useState } from "react";

// theme: "light" | "dark" | "system". The <html> element gets class "dark" when dark applies.
// index.html runs the same logic before React loads, so there's no white flash.
const KEY = "ranilix.theme";
const ThemeContext = createContext(null);
const ORDER = ["system", "light", "dark"];

function initialTheme() {
  try {
    const saved = localStorage.getItem(KEY);
    if (ORDER.includes(saved)) return saved;
  } catch { /* ignore */ }
  return "system";
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(initialTheme);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false);

  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const onChange = (e) => setSystemDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const dark = theme === "dark" || (theme === "system" && systemDark);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try { localStorage.setItem(KEY, theme); } catch { /* ignore */ }
  }, [dark, theme]);

  const value = useMemo(() => ({
    theme,
    dark,
    setTheme,
    cycleTheme: () => setTheme((t) => ORDER[(ORDER.indexOf(t) + 1) % ORDER.length]),
  }), [theme, dark]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
