import { Check } from "lucide-react";
import { useI18n } from "../i18n";
import type { AdminGate } from "../lib/api/types";

/**
 * Pick gates: "Toutes les portes" (none chosen — new gates included) or
 * any number of them. Used for where a ticket is sold and where a cashier
 * may work.
 */
export function GateChips({
  gates,
  value,
  onChange,
  label,
  hint,
}: {
  gates: AdminGate[];
  /** Chosen gate ids; empty = every gate. */
  value: string[];
  onChange: (ids: string[]) => void;
  label: string;
  hint?: string;
}) {
  const { t } = useI18n();
  const chip = (on: boolean) =>
    `flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold ring-1 transition-colors ${
      on ? "bg-secondary text-white ring-secondary" : "bg-card text-muted-foreground ring-border hover:text-foreground"
    }`;
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((g) => g !== id) : [...value, id]);
  return (
    <fieldset>
      <legend className="field-label">{label}</legend>
      <div className="flex flex-wrap gap-2">
        <button type="button" aria-pressed={value.length === 0} onClick={() => onChange([])} className={chip(value.length === 0)}>
          {value.length === 0 && <Check className="h-3.5 w-3.5" />} {t("settings.allGates")}
        </button>
        {gates
          // An inactive gate stays visible while it is still chosen, so it can be unticked.
          .filter((g) => g.active || value.includes(g.id))
          .map((g) => {
            const on = value.includes(g.id);
            return (
              <button key={g.id} type="button" aria-pressed={on} onClick={() => toggle(g.id)} className={chip(on)}>
                {on && <Check className="h-3.5 w-3.5" />} {g.name}
              </button>
            );
          })}
      </div>
      {hint && <p className="mt-1.5 text-[11px] text-muted-foreground">{hint}</p>}
    </fieldset>
  );
}

/** "Porte A, Porte C", or "Toutes les portes" when none is chosen. */
export function gateNamesOf(ids: string[], gates: AdminGate[], all: string): string {
  if (ids.length === 0) return all;
  return (
    gates
      .filter((g) => ids.includes(g.id))
      .map((g) => g.name)
      .join(", ") || "?"
  );
}
