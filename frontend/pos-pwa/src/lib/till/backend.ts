import type { PaymentMethod } from "../api/types";
import { getAllOutboxEntries, type OutboxEntry, type SaleOutboxPayload } from "../offline/db";
import { createSale, type CartLine, type IssuedTicket } from "../offline/sale";
import { scanTicket, type ScanOutcome } from "../offline/scan";
import type { GateSession } from "../offline/session";
import { isEdgeMode } from "../platform";
import { edge } from "./edgeClient";

/** A sale of today on this till, for the "Cette caisse aujourd'hui" panel. */
export type TodaySale = { id: string; at: string; total: number; tickets: number; synced: boolean; reference: string | null };

/** Everything needed to show and print a sale again ("Mes ventes"). */
export type ReprintableSale = {
  transactionId: string;
  tickets: IssuedTicket[];
  lines: { ticketTypeId: string; name: string; quantity: number; unitPrice: number }[];
  currency: string;
  paymentMethod: PaymentMethod;
  createdAtClient: string;
  reference: string | null;
};

/**
 * What the till screens need, whoever stores the data: the browser itself
 * (PWA) or the local server installed with the desktop app.
 */
export type TillBackend = {
  createSale(
    session: GateSession,
    cart: CartLine[],
    paymentMethod: PaymentMethod,
  ): Promise<{ transactionId: string; tickets: IssuedTicket[] }>;
  scan(session: GateSession, qrContent: string): Promise<ScanOutcome>;
  todaySales(session: GateSession): Promise<TodaySale[]>;
  /** The signed-in cashier's sales on this till, newest first (any day). */
  mySales(session: GateSession): Promise<TodaySale[]>;
  saleForReprint(session: GateSession, id: string): Promise<ReprintableSale | null>;
};

const ticketTypeName = (session: GateSession, id: string) => session.bootstrap.ticketTypes.find((t) => t.id === id)?.name ?? "—";

const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

function toSummary(e: OutboxEntry): TodaySale {
  const p = e.payload as SaleOutboxPayload;
  return {
    id: e.id,
    at: e.createdAtClient,
    total: p.lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0),
    tickets: p.tickets.length,
    synced: e.syncStatus === "SYNCED",
    reference: e.referenceNumber ?? null,
  };
}

const browserTill: TillBackend = {
  createSale,
  scan: scanTicket,
  async mySales(session) {
    const entries = await getAllOutboxEntries();
    return (
      entries
        // Sales made before the cashier was recorded stay listed: better reprintable than lost.
        .filter((e) => e.type === "SALE" && (!e.cashierUserId || e.cashierUserId === session.userId))
        .map(toSummary)
        .sort((a, b) => b.at.localeCompare(a.at))
    );
  },
  async saleForReprint(session, id) {
    const e = (await getAllOutboxEntries()).find((x) => x.type === "SALE" && x.id === id);
    if (!e) return null;
    const p = e.payload as SaleOutboxPayload;
    return {
      transactionId: e.id,
      tickets: p.tickets.map((t) => ({ id: t.id, ticketTypeId: t.ticketTypeId, ticketNumber: t.ticketNumber, qrContent: t.qrSignature })),
      lines: p.lines.map((l) => ({
        ticketTypeId: l.ticketTypeId,
        name: ticketTypeName(session, l.ticketTypeId),
        quantity: l.quantity,
        unitPrice: l.unitPrice,
      })),
      currency: session.bootstrap.ticketTypes[0]?.currency ?? "XAF",
      paymentMethod: p.paymentMethod,
      createdAtClient: p.createdAtClient,
      reference: e.referenceNumber ?? null,
    };
  },
  async todaySales() {
    const entries = await getAllOutboxEntries();
    return entries
      .filter((e) => e.type === "SALE" && isToday(e.createdAtClient))
      .map((e) => {
        const p = e.payload as SaleOutboxPayload;
        return {
          id: e.id,
          at: e.createdAtClient,
          total: p.lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0),
          tickets: p.tickets.length,
          synced: e.syncStatus === "SYNCED",
          reference: e.referenceNumber ?? null,
        };
      })
      .sort((a, b) => b.at.localeCompare(a.at));
  },
};

const edgeTill: TillBackend = {
  async createSale(session, cart, paymentMethod) {
    // Prices are the local server's (its catalog), not the screen's.
    const sale = await edge.sell(session.token, {
      clientRequestId: crypto.randomUUID(),
      paymentMethod,
      lines: cart.map((l) => ({ ticketTypeId: l.ticketTypeId, quantity: l.quantity })),
    });
    return {
      transactionId: sale.id,
      tickets: sale.tickets.map((t) => ({ id: t.id, ticketTypeId: t.ticketTypeId, ticketNumber: t.ticketNumber, qrContent: t.qrContent })),
    };
  },
  async scan(session, qrContent) {
    const r = await edge.scan(session.token, qrContent);
    switch (r.result) {
      case "ACCEPTED":
        return { kind: "ACCEPTED", ticketNumber: r.ticketNumber ?? "" };
      case "ALREADY_REDEEMED":
        return { kind: "REJECTED_ALREADY_REDEEMED", ticketNumber: r.ticketNumber ?? "" };
      case "VOIDED":
        return { kind: "REJECTED_VOIDED", ticketNumber: r.ticketNumber ?? "" };
      case "INVALID_SIGNATURE":
        return { kind: "REJECTED_INVALID_SIGNATURE" };
      case "WRONG_GATE":
        return { kind: "REJECTED_WRONG_GATE" };
      default:
        return { kind: "NOT_RECOGNIZED" };
    }
  },
  async mySales(session) {
    const sales = await edge.recentSales(session.token, 500, true);
    return sales.map((s) => ({
      id: s.id,
      at: s.createdAt,
      total: s.total,
      tickets: s.ticketCount,
      synced: s.synced,
      reference: s.centralReference ?? s.localReference,
    }));
  },
  async saleForReprint(session, id) {
    const s = await edge.sale(session.token, id);
    return {
      transactionId: s.id,
      tickets: s.tickets.map((t) => ({ id: t.id, ticketTypeId: t.ticketTypeId, ticketNumber: t.ticketNumber, qrContent: t.qrContent })),
      lines: s.lines.map((l) => ({ ticketTypeId: l.ticketTypeId, name: l.name, quantity: l.quantity, unitPrice: Number(l.unitPrice) })),
      currency: s.currency,
      paymentMethod: s.paymentMethod,
      createdAtClient: s.createdAt,
      reference: s.centralReference ?? s.localReference,
    };
  },
  async todaySales(session) {
    const sales = await edge.recentSales(session.token);
    return sales
      .filter((s) => isToday(s.createdAt))
      .map((s) => ({
        id: s.id,
        at: s.createdAt,
        total: s.total,
        tickets: s.ticketCount,
        synced: s.synced,
        // Printed on the receipt: central's number once synced, the till's own until then.
        reference: s.centralReference ?? s.localReference,
      }));
  },
};

export const till: TillBackend = isEdgeMode() ? edgeTill : browserTill;
