import type { PaymentMethod, TransactionSummary } from "./api/types";
import type { DailyPoint, HistogramBin } from "../components/charts";
import { PAYMENT_LABELS, addDays, dayKey, formatDayLabel, startOfDay } from "./format";

// Dashboard and reports aggregate client-side over the establishment's
// synced transactions. Fine at festival scale (thousands of sales); a
// server-side summary endpoint is the next step if volumes grow well past
// that. Only synced sales are counted — a terminal still offline hasn't
// reported yet, which the sync-status page makes visible.
export const ALL_TRANSACTIONS_PAGE_SIZE = 5000;

export type PeriodStats = {
  revenue: number;
  count: number;
  average: number;
  voidedCount: number;
  voidedAmount: number;
  byDay: DailyPoint[];
  byPayment: { key: string; label: string; value: number; count: number }[];
  byGate: { key: string; value: number; count: number }[];
  byTerminal: { key: string; value: number; count: number; lastAt: string }[];
  byCashier: { key: string; value: number; count: number }[];
};

/** `from` inclusive, `to` exclusive, both local-midnight dates. */
export function computeStats(transactions: TransactionSummary[], from: Date, to: Date, gateId?: string, cashierUserId?: string): PeriodStats {
  const inRange = transactions.filter((t) => {
    const d = new Date(t.createdAtClient);
    return d >= from && d < to && (!gateId || t.gateId === gateId) && (!cashierUserId || t.cashierUserId === cashierUserId);
  });
  const completed = inRange.filter((t) => t.status === "COMPLETED");
  const voided = inRange.filter((t) => t.status === "VOIDED");
  const revenue = completed.reduce((s, t) => s + t.totalAmount, 0);

  const days = new Map<string, DailyPoint>();
  for (let d = startOfDay(from); d < to; d = addDays(d, 1)) {
    days.set(dayKey(d), { label: formatDayLabel(d), value: 0, count: 0 });
  }
  const payments = new Map<PaymentMethod, { value: number; count: number }>();
  const gates = new Map<string, { value: number; count: number }>();
  const terminals = new Map<string, { value: number; count: number; lastAt: string }>();
  const cashiers = new Map<string, { value: number; count: number }>();
  for (const t of completed) {
    const p = days.get(dayKey(new Date(t.createdAtClient)));
    if (p) {
      p.value += t.totalAmount;
      p.count += 1;
    }
    const pm = payments.get(t.paymentMethod) ?? { value: 0, count: 0 };
    pm.value += t.totalAmount;
    pm.count += 1;
    payments.set(t.paymentMethod, pm);
    const g = gates.get(t.gateId) ?? { value: 0, count: 0 };
    g.value += t.totalAmount;
    g.count += 1;
    gates.set(t.gateId, g);
    const term = terminals.get(t.terminalId) ?? { value: 0, count: 0, lastAt: t.createdAtClient };
    term.value += t.totalAmount;
    term.count += 1;
    if (t.createdAtClient > term.lastAt) term.lastAt = t.createdAtClient;
    terminals.set(t.terminalId, term);
    const c = cashiers.get(t.cashierUserId) ?? { value: 0, count: 0 };
    c.value += t.totalAmount;
    c.count += 1;
    cashiers.set(t.cashierUserId, c);
  }

  return {
    revenue,
    count: completed.length,
    average: completed.length ? revenue / completed.length : 0,
    voidedCount: voided.length,
    voidedAmount: voided.reduce((s, t) => s + t.totalAmount, 0),
    byDay: [...days.values()],
    byPayment: [...payments.entries()]
      .map(([key, v]) => ({ key, label: PAYMENT_LABELS[key], ...v }))
      .sort((a, b) => b.value - a.value),
    byGate: [...gates.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.value - a.value),
    byTerminal: [...terminals.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.value - a.value),
    byCashier: [...cashiers.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.value - a.value),
  };
}

export type HourPoint = { hour: number; today: number | null; yesterday: number };

/**
 * Cumulative revenue hour by hour, today against the same hours yesterday —
 * "are we ahead of yesterday at this time of day?". Today stops at the
 * current hour (no flat line into the future).
 */
export function hourlyProgression(transactions: TransactionSummary[], now = new Date()): HourPoint[] {
  const today = startOfDay(now);
  const yesterday = addDays(today, -1);
  const perHour = (day: Date) => {
    const buckets = new Array<number>(24).fill(0);
    const next = addDays(day, 1);
    for (const t of transactions) {
      if (t.status !== "COMPLETED") continue;
      const d = new Date(t.createdAtClient);
      if (d >= day && d < next) buckets[d.getHours()] += t.totalAmount;
    }
    let run = 0;
    return buckets.map((v) => (run += v));
  };
  const t = perHour(today);
  const y = perHour(yesterday);
  return t.map((v, hour) => ({ hour, today: hour <= now.getHours() ? v : null, yesterday: y[hour] }));
}


/** Sales per hour of the day over a set of sales — when the rush happens. */
export function hourHistogram(transactions: TransactionSummary[]): HistogramBin[] {
  const counts = new Array<number>(24).fill(0);
  const amounts = new Array<number>(24).fill(0);
  for (const t of transactions) {
    if (t.status !== "COMPLETED") continue;
    const h = new Date(t.createdAtClient).getHours();
    counts[h] += 1;
    amounts[h] += t.totalAmount;
  }
  return counts.map((count, h) => ({
    label: `${h}h`,
    count,
    detail: `${Math.round(amounts[h]).toLocaleString("fr-FR")} FCFA`,
  }));
}

// Basket-size buckets, in FCFA.
const AMOUNT_EDGES = [0, 2_000, 5_000, 10_000, 20_000, 50_000, 100_000];

/** How many sales fall in each amount range — the shape of the average basket. */
export function amountHistogram(transactions: TransactionSummary[]): HistogramBin[] {
  const fmt = (v: number) => (v >= 1000 ? `${v / 1000}k` : String(v));
  const bins: HistogramBin[] = AMOUNT_EDGES.map((lo, i) => {
    const hi = AMOUNT_EDGES[i + 1];
    return { label: hi ? `${fmt(lo)}–${fmt(hi)}` : `${fmt(lo)}+`, count: 0 };
  });
  for (const t of transactions) {
    if (t.status !== "COMPLETED") continue;
    let i = AMOUNT_EDGES.findIndex((lo, k) => t.totalAmount >= lo && (AMOUNT_EDGES[k + 1] === undefined || t.totalAmount < AMOUNT_EDGES[k + 1]));
    if (i < 0) i = 0;
    bins[i].count += 1;
  }
  return bins;
}
