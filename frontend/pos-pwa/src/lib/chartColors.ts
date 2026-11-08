import type { PaymentMethod } from "./api/types";

// Categorical colours for portion charts. Each entity keeps its colour
// whatever its rank or the filters, so "Mobile Money" is amber everywhere.
export const PAYMENT_COLORS: Record<PaymentMethod, string> = {
  CASH: "#059669",
  MOBILE_MONEY: "#f59e0b",
  CARD: "#2563eb",
  OTHER: "#7c3aed",
};

// Gates / tills: fixed order, assigned by the entity's position in its own
// (stable, name-sorted) list — never by how much it sold.
export const SERIES_COLORS = ["#2563eb", "#f59e0b", "#0d9488", "#7c3aed", "#e11d48", "#ea580c", "#475569", "#db2777"];

export function seriesColor(index: number): string {
  return SERIES_COLORS[index % SERIES_COLORS.length];
}
