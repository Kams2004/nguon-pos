import { describe, expect, it } from "vitest";
import { signTicket, verifyTicketSignature, type TicketPayload } from "./ticketSignature";

const SECRET = "a1".repeat(32);
const OTHER_GATE_SECRET = "b2".repeat(32);
const PAYLOAD: TicketPayload = {
  v: 1,
  tid: "8f8c2b9e-6a3f-4d61-9a47-2f3a1c0d9e11",
  gw: "PORTE-A",
  tt: "4b1c7e52-0d0a-4f7e-8f55-0b1e2c3d4e5f",
  tx: "0e9a7c1d-2b3c-4d5e-8f90-a1b2c3d4e5f6",
  tn: "A-000123",
  iat: "2026-10-28T10:00:00.000Z",
};

function b64url(s: string): string {
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

describe("ticket QR signature", () => {
  it("accepts a ticket signed with the gate's key", async () => {
    const qr = await signTicket(PAYLOAD, SECRET);
    const res = await verifyTicketSignature(qr, SECRET);
    expect(res).toEqual({ ok: true, payload: PAYLOAD });
  });

  it("rejects a ticket whose payload was edited after signing", async () => {
    const [, sig] = (await signTicket(PAYLOAD, SECRET)).split(".");
    // Same signature, but the ticket now claims another ticket type.
    const forged = b64url(JSON.stringify({ ...PAYLOAD, tt: "vip" }));
    expect(await verifyTicketSignature(`${forged}.${sig}`, SECRET)).toEqual({ ok: false, reason: "INVALID_SIGNATURE" });
  });

  it("rejects a ticket whose signature was altered", async () => {
    const [payload, sig] = (await signTicket(PAYLOAD, SECRET)).split(".");
    const flipped = (sig[0] === "A" ? "B" : "A") + sig.slice(1);
    expect(await verifyTicketSignature(`${payload}.${flipped}`, SECRET)).toEqual({ ok: false, reason: "INVALID_SIGNATURE" });
  });

  it("rejects a ticket signed by another gate", async () => {
    const qr = await signTicket(PAYLOAD, OTHER_GATE_SECRET);
    expect(await verifyTicketSignature(qr, SECRET)).toEqual({ ok: false, reason: "INVALID_SIGNATURE" });
  });

  it("rejects a self-made ticket with no valid signature", async () => {
    const homemade = `${b64url(JSON.stringify(PAYLOAD))}.${b64url("not-a-signature")}`;
    expect(await verifyTicketSignature(homemade, SECRET)).toEqual({ ok: false, reason: "INVALID_SIGNATURE" });
  });

  it.each(["", "no-dot", "a.b.c", "%%%.###", "e30.", "not base64 at all.x"])("rejects malformed content %j", async (qr) => {
    const res = await verifyTicketSignature(qr, SECRET);
    expect(res.ok).toBe(false);
  });
});
