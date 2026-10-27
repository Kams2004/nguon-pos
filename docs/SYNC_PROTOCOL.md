# Offline Sync Protocol

Implemented in Milestone 1. This document specifies the contract so the PWA
client and `sales-service` are built against the same design from the start.

## Local queue (PWA, IndexedDB)

**`outbox` store** — one row per pending sale or scan:

```ts
type OutboxEntry = {
  id: string;                 // = idempotencyKey (sale) or clientScanId (scan)
  type: "SALE" | "SCAN";
  payload: unknown;           // full transaction or scan event, built client-side
  createdAtClient: string;    // ISO 8601
  attemptCount: number;
  lastAttemptAt: string | null;
  lastError: string | null;
  syncStatus: "PENDING" | "SYNCING" | "SYNCED" | "FAILED_PERMANENT";
};
```

**`local_cache` store** — the gate's own authoritative read model (its ticket
types, its own issued tickets, establishment branding). This — never the
outbox — is what offline scan validation checks against.

## The golden rule

The UI only confirms "Saved" to the cashier **after** the IndexedDB write for
step 3 below resolves. Printing reads from the local record, never blocks on
network.

1. Cashier confirms a sale.
2. Client generates `idempotencyKey = crypto.randomUUID()` — *before* any
   network call. This same UUID deterministically seeds every ticket
   number/QR payload in the sale, so a retried submission never produces
   different tickets.
3. Write to `outbox` (`PENDING`) and to `local_cache.ticket` (so these tickets
   are immediately scannable at this gate even before sync).
4. Confirm "Saved" to the cashier. Print.
5. A background sync worker posts `PENDING` entries when online.

## Sync API

`POST /api/sales/sync/transactions` — batched (cap ~25 entries/request), body:

```json
{ "terminalId": "...", "entries": [ { "idempotencyKey": "...", "...": "transaction payload" } ] }
```

Response — **per-entry** result, never all-or-nothing:

```json
{ "results": [
  { "idempotencyKey": "...", "status": "ACCEPTED|DUPLICATE_IGNORED|REJECTED",
    "referenceNumber": "...", "serverReceivedAt": "...", "reason": "..." }
] }
```

`POST /api/sales/sync/scans` — same idempotency pattern, smaller/more frequent
batches (scan reconciliation is latency-sensitive for "who's inside right
now").

`POST /api/sales/sync/heartbeat` — sent periodically while online even with
nothing to sync, including `localPendingCount`, so the admin dashboard can
distinguish "online but idle" from "offline."

## Server-side dedup

`transaction.idempotency_key` has a DB unique constraint. A conflicting insert
is **not** an error — the server looks up the existing row and returns
`DUPLICATE_IGNORED` with its original `referenceNumber`. This is what makes
blind retries safe after a timeout. `reference_number` itself is assigned
server-side on first successful insert (sequential/display value); the
idempotency key, not the reference number, is what prevents double-processing.

Payloads are validated against the claimed `establishment_id`/`gate_id`
relationships server-side — inconsistent payloads are `REJECTED` with a
reason and surfaced on the admin sync-status view for manual follow-up, not
retried forever.

## Backup/restore

Standard Postgres backups centrally (`./deploy.sh backup`). The honest caveat
to document for the client: a laptop lost/destroyed *before* syncing loses
only its own not-yet-synced sales; a mere internet outage loses nothing,
because nothing is ever only in memory on the terminal.
