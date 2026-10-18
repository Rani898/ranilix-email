import { Fragment, createContext, isValidElement, useCallback, useContext, useEffect, useMemo, useState } from "react";
import en from "../i18n/en.js";
import he from "../i18n/he.js";

const DICTS = { en, he };
const KEY = "ranilix.lang";
const I18nContext = createContext(null);

function initialLang() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && DICTS[saved]) return saved;
  } catch { /* ignore */ }
  return "en"; // English by default; visitors can switch to Hebrew and the choice is remembered
}

function lookup(dict, key) {
  return key.split(".").reduce((o, k) => (o == null ? undefined : o[k]), dict);
}

/** Fill {name} placeholders. If any value is a React element, returns an array of nodes. */
export function format(str, vars) {
  if (typeof str !== "string" || !vars) return str;
  const parts = str.split(/\{(\w+)\}/);
  const hasNode = parts.some((p, i) => i % 2 === 1 && isValidElement(vars[p]));
  if (!hasNode) return parts.map((p, i) => (i % 2 === 1 ? (vars[p] ?? `{${p}}`) : p)).join("");
  return parts.map((p, i) => <Fragment key={i}>{i % 2 === 1 ? vars[p] : p}</Fragment>);
}

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(initialLang);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "he" ? "rtl" : "ltr";
    try { localStorage.setItem(KEY, lang); } catch { /* ignore */ }
  }, [lang]);

  const t = useCallback((key, vars) => {
    const value = lookup(DICTS[lang], key) ?? lookup(en, key);
    if (value === undefined) return key;
    return format(value, vars);
  }, [lang]);

  const value = useMemo(() => ({
    lang,
    dir: lang === "he" ? "rtl" : "ltr",
    locale: lang === "he" ? "he-IL" : "en-US",
    setLang: setLangState,
    toggleLang: () => setLangState((l) => (l === "he" ? "en" : "he")),
    t,
  }), [lang, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}

/** Translate an error thrown by the API layer (which carries a code + params). */
export function useErrorText() {
  const { t } = useI18n();
  return useCallback((err) => {
    if (err?.code) {
      const text = t(`errors.${err.code}`, err.params || {});
      if (text !== `errors.${err.code}`) return text;
    }
    return err?.message || t("errors.generic");
  }, [t]);
}
