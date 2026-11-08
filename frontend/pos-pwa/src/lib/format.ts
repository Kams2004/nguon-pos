import type { PaymentMethod } from "./api/types";

// XAF is shown as "FCFA" everywhere in the UI — that's how prices are
// written on the ground in Cameroon, and how the client's mockup shows them.
export function formatMoney(amount: number, currency = "XAF"): string {
  const unit = currency === "XAF" ? "FCFA" : currency;
  return `${Math.round(amount).toLocaleString("fr-FR")} ${unit}`;
}

/** Compact axis label: 12 580 000 -> "12,6M", 45 000 -> "45k". */
export function formatCompact(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })}M`;
  if (amount >= 1_000) return `${(amount / 1_000).toLocaleString("fr-FR", { maximumFractionDigits: 0 })}k`;
  return String(amount);
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export function formatDayLabel(d: Date): string {
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  CASH: "Espèces",
  MOBILE_MONEY: "Mobile Money",
  CARD: "Carte bancaire",
  OTHER: "Autre",
};

export const ROLE_LABELS = {
  CASHIER: "Caissier",
  COORDINATOR: "Coordonnateur",
  SUPER_ADMIN: "Super administrateur",
} as const;

/** Local-calendar day key (YYYY-MM-DD) — reports group by the gate's own day, not UTC. */
export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}
