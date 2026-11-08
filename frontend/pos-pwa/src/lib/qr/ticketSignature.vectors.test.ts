import { describe, expect, it } from "vitest";
import vectors from "../../../../../docs/test-vectors/qr-v1.json";
import { signTicket, verifyTicketSignature, type TicketPayload } from "./ticketSignature";

// Shared with shared/sync-core (JUnit): browser tills and desktop tills must
// produce and accept exactly the same QR codes.
describe("shared QR vectors (docs/test-vectors/qr-v1.json)", () => {
  it.each(vectors.valid.map((c) => [c.payload.tn, c] as const))("signs and verifies %s", async (_, c) => {
    expect(JSON.stringify(c.payload)).toBe(c.payloadJson);
    expect(await signTicket(c.payload as TicketPayload, c.secretHex)).toBe(c.qr);
    expect(await verifyTicketSignature(c.qr, c.secretHex)).toEqual({ ok: true, payload: c.payload });
  });

  it.each(vectors.invalid.map((c) => [c.name, c] as const))("rejects %s", async (_, c) => {
    expect(await verifyTicketSignature(c.qr, c.secretHex)).toEqual({ ok: false, reason: c.reason });
  });
});
