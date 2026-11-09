import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { getLang, locale, setLang, subscribeLang, type Lang } from "./core";
import common from "./messages/common";
import shell from "./messages/shell";
import gate from "./messages/gate";
import reports from "./messages/reports";
import settings from "./messages/settings";
import guide from "./messages/guide";

export { LANGS, getLang, locale, setLang, type Lang } from "./core";

// One module per area of the app; each owns its own key prefix.
const MODULES = [common, shell, gate, reports, settings, guide];

const fr = Object.assign({}, ...MODULES.map((m) => m.fr)) as typeof common.fr &
  typeof shell.fr &
  typeof gate.fr &
  typeof reports.fr &
  typeof settings.fr &
  typeof guide.fr;
const DICTIONARIES: Record<Lang, Record<string, string>> = {
  fr,
  en: Object.assign({}, ...MODULES.map((m) => m.en)),
};

type AllKeys = keyof typeof fr & string;
/** "sales.count" for keys defined as "sales.count_one" / "sales.count_other". */
type PluralBase<K> = K extends `${infer B}_${"one" | "other"}` ? B : never;
export type MessageKey = AllKeys | PluralBase<AllKeys>;
export type MessageVars = Record<string, string | number>;

const pluralRules: Partial<Record<Lang, Intl.PluralRules>> = {};

/**
 * Text for `key` in the current language. `{name}` placeholders are filled
 * from `vars` (numbers formatted for the language); when `vars.count` is set
 * and the key has `_one`/`_other` forms, the right one is picked (French
 * counts 0 and 1 as singular, English only 1).
 */
export function translate(key: MessageKey, vars?: MessageVars): string {
  const lang = getLang();
  const dict = DICTIONARIES[lang];
  let text = dict[key];
  if (text === undefined && vars && typeof vars.count === "number") {
    const rules = (pluralRules[lang] ??= new Intl.PluralRules(locale()));
    text = dict[`${key}_${rules.select(vars.count)}`] ?? dict[`${key}_other`];
  }
  if (text === undefined) return key;
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => {
    const v = vars[name];
    if (v === undefined) return match;
    return typeof v === "number" ? v.toLocaleString(locale()) : v;
  });
}

type I18n = { lang: Lang; t: typeof translate; setLang: (lang: Lang) => void };
const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const lang = useSyncExternalStore(subscribeLang, getLang);
  // A new `t` per language so every consumer re-renders on a switch.
  const value = useMemo<I18n>(() => ({ lang, t: (key, vars) => translate(key, vars), setLang }), [lang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** `const { t } = useI18n()` in any component that shows text. */
export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}

/** For tests: every module's messages, to check them for consistency. */
export const ALL_MODULES = MODULES;
