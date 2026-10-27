import { verifyTicketSignature } from "../qr/ticketSignature";
import { getCachedTicket, markTicketRedeemed, writeOutboxEntry } from "./db";
import type { Session } from "./session";

export type ScanOutcome =
  | { kind: "ACCEPTED"; ticketNumber: string }
  | { kind: "REJECTED_ALREADY_REDEEMED"; ticketNumber: string }
  | { kind: "REJECTED_INVALID_SIGNATURE" }
  | { kind: "REJECTED_WRONG_GATE" }
  | { kind: "NOT_RECOGNIZED" };

/**
 * Fully offline verification, in the exact order specified in
 * docs/QR_TICKET_SPEC.md:
 *   1. Recompute HMAC, reject on mismatch — catches tampered/forged codes
 *      with zero lookups.
 *   2. Check the payload's gate code matches this gate — defense in depth,
 *      not just "not found".
 *   3. Look up the ticket in this gate's local cache.
 *   4/5. Accept (flip to REDEEMED) or reject as already-redeemed.
 *   6. Not found locally — ambiguous (forged, or a legitimate ticket from
 *      another not-yet-synced terminal at this gate); never claim certainty.
 * Only cases 4/5 (a real, locally-known ticket) are queued for server sync
 * — an invalid-signature or wrong-gate rejection has no verified ticket id
 * worth reporting; a "not recognized" case is a display state, not an
 * audit event, since there is nothing to usefully sync without a trusted id.
 */
export async function scanTicket(session: Session, qrContent: string): Promise<ScanOutcome> {
  const verified = await verifyTicketSignature(qrContent, session.bootstrap.gate.signingSecret);
  if (!verified.ok) {
    return { kind: "REJECTED_INVALID_SIGNATURE" };
  }

  const { payload } = verified;
  if (payload.gw !== session.bootstrap.gate.code) {
    return { kind: "REJECTED_WRONG_GATE" };
  }

  const ticket = await getCachedTicket(payload.tid);
  if (!ticket) {
    return { kind: "NOT_RECOGNIZED" };
  }

  if (ticket.status === "REDEEMED") {
    await queueScanEvent(ticket.id);
    return { kind: "REJECTED_ALREADY_REDEEMED", ticketNumber: ticket.ticketNumber };
  }

  await markTicketRedeemed(ticket.id);
  await queueScanEvent(ticket.id);
  return { kind: "ACCEPTED", ticketNumber: ticket.ticketNumber };
}

async function queueScanEvent(ticketId: string): Promise<void> {
  const clientScanId = crypto.randomUUID();
  const scannedAt = new Date().toISOString();
  await writeOutboxEntry({
    id: clientScanId,
    type: "SCAN",
    payload: { ticketId, scannedAt },
    createdAtClient: scannedAt,
    attemptCount: 0,
    lastAttemptAt: null,
    lastError: null,
    syncStatus: "PENDING",
  });
}
