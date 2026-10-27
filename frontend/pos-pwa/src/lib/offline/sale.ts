import type { PaymentMethod } from "../api/types";
import { signTicket, type TicketPayload } from "../qr/ticketSignature";
import { cacheTicket, writeOutboxEntry, type SaleOutboxPayload } from "./db";
import type { Session } from "./session";

export type CartLine = { ticketTypeId: string; quantity: number; unitPrice: number };

export type IssuedTicket = {
  id: string;
  ticketTypeId: string;
  ticketNumber: string;
  qrContent: string;
};

export type SaleResult = {
  transactionId: string;
  tickets: IssuedTicket[];
};

/**
 * The full offline sale flow, in order:
 *   1. Generate the idempotency key client-side, before any I/O.
 *   2. Build every ticket + its signed QR, entirely client-side.
 *   3. Write to the outbox (IndexedDB) — AWAITED.
 *   4. Cache each ticket locally so it's immediately scannable at this gate
 *      — AWAITED.
 * Only after both writes resolve does this return — the caller must not
 * tell the cashier "Saved" before that. See docs/SYNC_PROTOCOL.md.
 */
export async function createSale(session: Session, cart: CartLine[], paymentMethod: PaymentMethod): Promise<SaleResult> {
  const transactionId = crypto.randomUUID();
  const createdAtClient = new Date().toISOString();
  const shortId = transactionId.split("-")[0];
  const gateCode = session.bootstrap.gate.code;
  const gateSigningSecret = session.bootstrap.gate.signingSecret;

  const tickets: IssuedTicket[] = [];
  const ticketPayloadEntries: { id: string; ticketTypeId: string; ticketNumber: string; qrSignature: string }[] = [];

  for (let lineIndex = 0; lineIndex < cart.length; lineIndex++) {
    const line = cart[lineIndex];
    for (let unitIndex = 0; unitIndex < line.quantity; unitIndex++) {
      const ticketId = crypto.randomUUID();
      const ticketNumber = `${gateCode}-${shortId}-${lineIndex}-${unitIndex}`;
      const payload: TicketPayload = {
        v: 1,
        tid: ticketId,
        gw: gateCode,
        tt: line.ticketTypeId,
        tx: transactionId,
        tn: ticketNumber,
        iat: createdAtClient,
      };
      const qrContent = await signTicket(payload, gateSigningSecret);
      tickets.push({ id: ticketId, ticketTypeId: line.ticketTypeId, ticketNumber, qrContent });
      ticketPayloadEntries.push({ id: ticketId, ticketTypeId: line.ticketTypeId, ticketNumber, qrSignature: qrContent });
    }
  }

  const outboxPayload: SaleOutboxPayload = {
    paymentMethod,
    createdAtClient,
    lines: cart,
    tickets: ticketPayloadEntries,
  };

  await writeOutboxEntry({
    id: transactionId,
    type: "SALE",
    payload: outboxPayload,
    createdAtClient,
    attemptCount: 0,
    lastAttemptAt: null,
    lastError: null,
    syncStatus: "PENDING",
  });

  for (const t of ticketPayloadEntries) {
    await cacheTicket({
      id: t.id,
      ticketTypeId: t.ticketTypeId,
      ticketNumber: t.ticketNumber,
      qrSignature: t.qrSignature,
      status: "ISSUED",
      transactionId,
    });
  }

  return { transactionId, tickets };
}
