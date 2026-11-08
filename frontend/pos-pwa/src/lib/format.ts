import type { PaymentMethod, Role } from "./api/types";
import { locale, translate } from "../i18n";

// XAF is shown as "FCFA" everywhere in the UI — that's how prices are
// written on the ground in Cameroon, and how the client's mockup shows them.
export function formatMoney(amount: number, currency = "XAF"): string {
  const unit = currency === "XAF" ? "FCFA" : currency;
  return `${Math.round(amount).toLocaleString(locale())} ${unit}`;
}

/** Compact axis label: 12 580 000 -> "12,6M", 45 000 -> "45k". */
export function formatCompact(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toLocaleString(locale(), { maximumFractionDigits: 1 })}M`;
  if (amount >= 1_000) return `${(amount / 1_000).toLocaleString(locale(), { maximumFractionDigits: 0 })}k`;
  return String(amount);
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(locale(), { dateStyle: "short", timeStyle: "short" });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" });
}

export function formatDayLabel(d: Date): string {
  return d.toLocaleDateString(locale(), { day: "numeric", month: "short" });
}

/** Read at use time, so they follow the current language. */
function translatedLabels<K extends string>(keys: readonly K[], label: (k: K) => string): Record<K, string> {
  const out = {} as Record<K, string>;
  for (const k of keys) Object.defineProperty(out, k, { get: () => label(k), enumerable: true });
  return out;
}

export const PAYMENT_LABELS = translatedLabels<PaymentMethod>(["CASH", "MOBILE_MONEY", "CARD", "OTHER"], (k) => translate(`payment.${k}`));

export const ROLE_LABELS = translatedLabels<Role>(["CASHIER", "COORDINATOR", "SUPER_ADMIN"], (k) => translate(`role.${k}`));

/** Hour of day as two digits ("09"), for hour labels in both languages. */
export function hh(hour: number): string {
  return String(hour % 24).padStart(2, "0");
}

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
