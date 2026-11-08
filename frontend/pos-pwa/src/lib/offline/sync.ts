import { api } from "../api/client";
import type { SaleSyncEntry, ScanSyncEntry } from "../api/types";
import { countPendingOutbox, getPendingOutboxEntries, updateOutboxEntry, type SaleOutboxPayload, type ScanOutboxPayload } from "./db";
import type { GateSession } from "./session";
import { translate } from "../../i18n";

const BATCH_SIZE = 25;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export type SyncSummary = { salesSynced: number; scansSynced: number; failed: number };

/** Pushes every PENDING outbox entry to the server, in capped batches, then
 * sends a heartbeat with whatever's still pending. Safe to call repeatedly
 * (e.g. on an interval, or on the browser's `online` event) — entries
 * already SYNCED are never re-sent, and a re-sent batch is a no-op on the
 * server thanks to the idempotency-key dedup (see docs/SYNC_PROTOCOL.md). */
export async function runSync(session: GateSession, terminalId: string): Promise<SyncSummary> {
  const summary: SyncSummary = { salesSynced: 0, scansSynced: 0, failed: 0 };
  const gateId = session.bootstrap.gate.id;

  const pendingSales = await getPendingOutboxEntries("SALE");
  for (const batch of chunk(pendingSales, BATCH_SIZE)) {
    for (const e of batch) await updateOutboxEntry(e.id, { syncStatus: "SYNCING" });
    const entries: SaleSyncEntry[] = batch.map((e) => {
      const p = e.payload as SaleOutboxPayload;
      return {
        idempotencyKey: e.id,
        paymentMethod: p.paymentMethod,
        createdAtClient: p.createdAtClient,
        lines: p.lines,
        tickets: p.tickets,
      };
    });
    try {
      const { results } = await api.syncTransactions(session.token, terminalId, gateId, entries);
      for (const r of results) {
        if (r.status === "REJECTED") {
          const entry = batch.find((e) => e.id === r.idempotencyKey)!;
          await updateOutboxEntry(r.idempotencyKey, {
            syncStatus: "FAILED_PERMANENT",
            lastError: r.reason,
            attemptCount: entry.attemptCount + 1,
            lastAttemptAt: new Date().toISOString(),
          });
          summary.failed++;
        } else {
          await updateOutboxEntry(r.idempotencyKey, { syncStatus: "SYNCED", referenceNumber: r.referenceNumber });
          summary.salesSynced++;
        }
      }
    } catch (err) {
      // Network/transient failure — revert the whole batch to PENDING so
      // the next sync pass retries it; never leave entries stuck SYNCING.
      for (const e of batch) {
        await updateOutboxEntry(e.id, {
          syncStatus: "PENDING",
          lastError: err instanceof Error ? err.message : translate("gate.sync.networkError"),
          attemptCount: e.attemptCount + 1,
          lastAttemptAt: new Date().toISOString(),
        });
      }
    }
  }

  const pendingScans = await getPendingOutboxEntries("SCAN");
  for (const batch of chunk(pendingScans, BATCH_SIZE)) {
    for (const e of batch) await updateOutboxEntry(e.id, { syncStatus: "SYNCING" });
    const entries: ScanSyncEntry[] = batch.map((e) => {
      const p = e.payload as ScanOutboxPayload;
      return { clientScanId: e.id, ticketId: p.ticketId, scannedAt: p.scannedAt };
    });
    try {
      const { results } = await api.syncScans(session.token, terminalId, gateId, entries);
      for (const r of results) {
        await updateOutboxEntry(r.clientScanId, { syncStatus: "SYNCED" });
        summary.scansSynced++;
      }
    } catch (err) {
      for (const e of batch) {
        await updateOutboxEntry(e.id, {
          syncStatus: "PENDING",
          lastError: err instanceof Error ? err.message : translate("gate.sync.networkError"),
          attemptCount: e.attemptCount + 1,
          lastAttemptAt: new Date().toISOString(),
        });
      }
    }
  }

  const stillPending = await countPendingOutbox();
  await api.heartbeat(session.token, terminalId, gateId, stillPending).catch(() => {
    // Heartbeat is best-effort status reporting, not load-bearing — a
    // failure here must never block or fail the sync pass itself.
  });

  return summary;
}
