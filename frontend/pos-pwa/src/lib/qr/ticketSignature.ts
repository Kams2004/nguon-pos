// Client-side QR generation and verification — see docs/QR_TICKET_SPEC.md
// for the full design rationale. Both issuance (sign) and verification
// (verify) live here so they can never drift from each other.

export type TicketPayload = {
  v: 1;
  tid: string; // ticket id
  gw: string; // gate code — this ticket is exclusive to this gate
  tt: string; // ticket type id
  tx: string; // transaction id (= idempotency key)
  tn: string; // ticket number
  iat: string; // issued-at, client timestamp
};

function base64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const b of arr) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlToBytes(s: string): Uint8Array {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(s.length + ((4 - (s.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function importHmacKey(secretHex: string): Promise<CryptoKey> {
  const bytes = new Uint8Array(secretHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(secretHex.substring(i * 2, i * 2 + 2), 16);
  }
  return crypto.subtle.importKey("raw", bytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

/** Builds and HMAC-signs a ticket's QR content. Returns the full QR string: `<base64url(payload)>.<base64url(signature)>`. */
export async function signTicket(payload: TicketPayload, gateSigningSecretHex: string): Promise<string> {
  const key = await importHmacKey(gateSigningSecretHex);
  const payloadJson = JSON.stringify(payload);
  const payloadB64 = base64url(new TextEncoder().encode(payloadJson));
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64));
  return `${payloadB64}.${base64url(signature)}`;
}

export type VerifyResult =
  | { ok: true; payload: TicketPayload }
  | { ok: false; reason: "MALFORMED" | "INVALID_SIGNATURE" };

/** Verifies a scanned QR string's signature and decodes its payload. Does NOT check gate/ticket status — see scanTicket() in offline/scan.ts for the full offline verification flow. */
export async function verifyTicketSignature(qrContent: string, gateSigningSecretHex: string): Promise<VerifyResult> {
  const parts = qrContent.trim().split(".");
  if (parts.length !== 2) return { ok: false, reason: "MALFORMED" };
  const [payloadB64, signatureB64] = parts;

  let payload: TicketPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64urlToBytes(payloadB64)));
  } catch {
    return { ok: false, reason: "MALFORMED" };
  }

  const key = await importHmacKey(gateSigningSecretHex);
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    base64urlToBytes(signatureB64) as BufferSource,
    new TextEncoder().encode(payloadB64),
  );
  if (!valid) return { ok: false, reason: "INVALID_SIGNATURE" };
  return { ok: true, payload };
}
