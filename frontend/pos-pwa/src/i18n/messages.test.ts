import { describe, expect, it } from "vitest";
import { ALL_MODULES } from "./index";

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("translations", () => {
  const keys = ALL_MODULES.flatMap((m) => Object.keys(m.fr));

  it("has no key defined in two areas", () => {
    const seen = new Set<string>();
    const dupes = keys.filter((k) => (seen.has(k) ? true : (seen.add(k), false)));
    expect(dupes).toEqual([]);
  });

  it("gives every message a non-empty French and English text with the same placeholders", () => {
    for (const m of ALL_MODULES) {
      for (const [key, fr] of Object.entries(m.fr) as [string, string][]) {
        const en = (m.en as Record<string, string>)[key];
        expect(fr.trim(), key).not.toBe("");
        expect(en?.trim(), key).toBeTruthy();
        expect(placeholders(en), key).toEqual(placeholders(fr));
      }
    }
  });
});
