# Ticket QR Spec

Implemented in Milestone 1. This document specifies the contract so ticket
generation (PWA, at sale time) and verification (PWA, at scan time) agree on
the exact same payload shape from the start — they are two independent code
paths (`frontend/pos-pwa/src/lib/qr/ticketSignature.ts`) that must never drift.

## Why HMAC, not asymmetric signing

Issuer and verifier are the same trust boundary: a gate's laptop(s) issue
tickets for that gate and also verify scans for that gate, using a secret only
that establishment holds. There is no party that needs to verify a ticket
without holding the signing secret (that would only be true if tickets had to
be valid across gates — explicitly ruled out, see `ARCHITECTURE.md`). HMAC is
simpler and sufficient for this trust model.

## Payload

Generated **entirely client-side**, at the moment of sale, no server round
trip required:

```ts
type TicketPayload = {
  v: 1;              // schema version
  tid: string;        // ticket.id (uuid)
  gw: string;          // gate.code — this ticket is exclusive to this gate
  tt: string;          // ticket_type.id
  tx: string;          // transaction.id (= idempotencyKey)
  tn: string;          // ticket_number
  iat: string;         // issued_at, client timestamp
};

// qrContent = base64url(JSON(payload)) + "." + signature
// signature = HMAC-SHA256(base64url(JSON(payload)), gateSigningSecret)
```

`gateSigningSecret` is per-establishment (per-gate is also fine — revisit if
isolation across gates of the same establishment ever matters), provisioned to
the PWA at login/gate-provisioning and cached locally. No network call is
needed to issue or verify a ticket.

## Offline verification order (at the gate)

1. Decode QR, split payload/signature, recompute HMAC with the locally-cached
   secret. **Reject on mismatch** (`REJECTED_INVALID_SIGNATURE`) — catches
   tampered/forged codes with zero lookups.
2. Check `payload.gw === thisGate.code`. **Reject if not**
   (`REJECTED_WRONG_GATE`) — content-level check, not just "not found," so a
   QR presented at the wrong gate gets a clear, specific error.
3. Look up `payload.tid` in `local_cache.ticket` (this gate's full issued-ticket
   list, kept current at issuance and refreshed by sync).
4. Found + `status === ISSUED`: mark `REDEEMED` locally, append `entry_scan`
   (`ACCEPTED`), queue for sync, show green "Entry OK".
5. Found + `status === REDEEMED`: **reject** (`REJECTED_ALREADY_REDEEMED`).
6. Not found locally: ambiguous — could be forged, or a legitimate ticket sold
   at this gate on a laptop that hasn't synced to this one yet. Show "Not
   recognized on this device" (not a hard "invalid"), log it, surface for
   manual resolution. Do not claim certainty either way.

## Same-gate multi-till race (2 laptops at one gate)

The one real edge case left after gate-exclusivity removes the cross-gate
problem — handled explicitly, not ignored:

- Both laptops accept optimistically from their own local cache (required for
  offline operation — this means a brief false-negative window is possible if
  both are offline from each other, not just from the internet).
- Both queue their `entry_scan` with distinct `clientScanId`s and sync
  independently — no peer-to-peer sync between laptops at one gate, by design.
- Server-side on scan sync: **first scan to reach the server, with
  `ticket.status == ISSUED`, wins** — flips status, records as canonical
  `ACCEPTED`. Any later-arriving scan for the same ticket is recorded as
  `REJECTED_ALREADY_REDEEMED`, **not silently dropped** — full audit trail for
  a coordinator to investigate the race after the fact.
- Operational recommendation: one laptop per gate. The protocol doesn't forbid
  two, but this is the right-sized answer for an edge case, not a reason to
  build a consensus protocol.
