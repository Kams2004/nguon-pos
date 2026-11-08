// Language state shared by React (I18nProvider) and plain modules (format.ts,
// api/client.ts…) that build text while a component renders.

export type Lang = "fr" | "en";
export const LANGS: Lang[] = ["fr", "en"];
/** Locale for dates and numbers. en-GB keeps day/month order and the 24 h clock used on site. */
export const LOCALES: Record<Lang, string> = { fr: "fr-FR", en: "en-GB" };

const STORAGE_KEY = "nguon-pos.lang";

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "fr" || saved === "en") return saved;
  } catch {
    // Storage unavailable (private mode): fall back to the default.
  }
  return "fr";
}

let current: Lang = initialLang();
const listeners = new Set<() => void>();
if (typeof document !== "undefined") document.documentElement.lang = current;

export function getLang(): Lang {
  return current;
}

export function locale(): string {
  return LOCALES[current];
}

export function setLang(lang: Lang): void {
  if (lang === current) return;
  current = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Not persisted; the choice still applies until reload.
  }
  document.documentElement.lang = lang;
  listeners.forEach((l) => l());
}

export function subscribeLang(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * One area's messages: French is the reference, and English must provide
 * exactly the same keys (a missing translation is a type error).
 * Keys are "<area>.<…>"; plural forms end in "_one" / "_other".
 */
export function defineMessages<const F extends Record<string, string>>(messages: { fr: F; en: { [K in keyof F]: string } }) {
  return messages;
}
