import { describe, expect, it } from "vitest";
import type { TransactionSummary } from "./api/types";
import { byCashierAndGate } from "./stats";

let n = 0;
const sale = (cashier: string, gate: string, at: string, amount: number, qty: number, voided = false): TransactionSummary => ({
  id: `t${++n}`,
  referenceNumber: `NG-${n}`,
  status: voided ? "VOIDED" : "COMPLETED",
  paymentMethod: "CASH",
  totalAmount: amount,
  currency: "XAF",
  gateId: gate,
  terminalId: "till",
  cashierUserId: cashier,
  createdAtClient: at,
  syncedAt: at,
  voidedByUserId: null,
  voidedAt: null,
  voidReason: null,
  lines: [{ ticketTypeId: "tt", quantity: qty, unitPrice: amount / qty }],
});

describe("byCashierAndGate", () => {
  it("splits each cashier's sales by the gates they worked at, cancellations apart", () => {
    const report = byCashierAndGate([
      sale("awa", "A", "2026-11-25T09:00:00Z", 2000, 1),
      sale("awa", "B", "2026-11-25T14:00:00Z", 4000, 2),
      sale("awa", "A", "2026-11-25T11:30:00Z", 2000, 1),
      sale("awa", "B", "2026-11-25T15:00:00Z", 2000, 1, true),
      sale("paul", "A", "2026-11-25T10:00:00Z", 1500, 1),
    ]);
    expect(report.map((c) => c.cashierUserId)).toEqual(["awa", "paul"]); // by amount collected
    const awa = report[0];
    expect(awa).toMatchObject({ sales: 3, tickets: 4, amount: 8000, voided: 1, voidedAmount: 2000 });
    // Gates in the order they worked there, with when they started and stopped.
    expect(awa.gates.map((g) => g.gateId)).toEqual(["A", "B"]);
    expect(awa.gates[0]).toMatchObject({ sales: 2, tickets: 2, amount: 4000, first: "2026-11-25T09:00:00Z", last: "2026-11-25T11:30:00Z" });
    expect(awa.gates[1]).toMatchObject({ sales: 1, tickets: 2, amount: 4000, voided: 1, last: "2026-11-25T15:00:00Z" });
  });
});
