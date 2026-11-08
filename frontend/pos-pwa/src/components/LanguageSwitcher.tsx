import { LANGS, useI18n, type Lang } from "../i18n";

const NAMES: Record<Lang, string> = { fr: "Français", en: "English" };

/** FR | EN toggle. `tone="dark"` for light backgrounds, `"light"` on the royal-blue headers. */
export function LanguageSwitcher({ tone = "dark" }: { tone?: "dark" | "light" }) {
  const { lang, setLang, t } = useI18n();
  const idle = tone === "light" ? "text-white/80 hover:text-white" : "text-muted-foreground hover:text-foreground";
  const active = tone === "light" ? "bg-white text-royal shadow-sm" : "bg-secondary text-white shadow-sm";
  return (
    <div
      role="group"
      aria-label={t("common.language")}
      className={`inline-flex rounded-lg p-0.5 ${tone === "light" ? "bg-white/15" : "bg-muted"}`}
    >
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          title={NAMES[l]}
          lang={l}
          className={`rounded-md px-2 py-1 text-[11px] font-bold uppercase transition-colors ${lang === l ? active : idle}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
