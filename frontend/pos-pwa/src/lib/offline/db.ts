import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { PaymentMethod } from "../api/types";

export type SaleOutboxPayload = {
  paymentMethod: PaymentMethod;
  createdAtClient: string;
  lines: { ticketTypeId: string; quantity: number; unitPrice: number }[];
  tickets: { id: string; ticketTypeId: string; ticketNumber: string; qrSignature: string }[];
};

export type ScanOutboxPayload = {
  ticketId: string;
  scannedAt: string;
};

export type OutboxEntry = {
  id: string; // SALE: idempotencyKey (= transaction id). SCAN: clientScanId.
  type: "SALE" | "SCAN";
  payload: SaleOutboxPayload | ScanOutboxPayload;
  createdAtClient: string;
  attemptCount: number;
  lastAttemptAt: string | null;
  lastError: string | null;
  syncStatus: "PENDING" | "SYNCING" | "SYNCED" | "FAILED_PERMANENT";
  referenceNumber?: string | null; // SALE only, filled in once synced
};

export type CachedTicket = {
  id: string;
  ticketTypeId: string;
  ticketNumber: string;
  qrSignature: string;
  status: "ISSUED" | "REDEEMED";
  transactionId: string;
};

interface NguonPosDB extends DBSchema {
  outbox: {
    key: string;
    value: OutboxEntry;
    indexes: { "by-sync-status": string };
  };
  tickets: {
    key: string;
    value: CachedTicket;
  };
}

let dbPromise: Promise<IDBPDatabase<NguonPosDB>> | null = null;

function getDb(): Promise<IDBPDatabase<NguonPosDB>> {
  if (!dbPromise) {
    dbPromise = openDB<NguonPosDB>("nguon-pos", 1, {
      upgrade(db) {
        const outbox = db.createObjectStore("outbox", { keyPath: "id" });
        outbox.createIndex("by-sync-status", "syncStatus");
        db.createObjectStore("tickets", { keyPath: "id" });
      },
    });
  }
  return dbPromise;
}

// ── Outbox ──────────────────────────────────────────────────────────────

/** Writes an outbox entry. The caller MUST await this before confirming
 * anything to the cashier — see docs/SYNC_PROTOCOL.md's "golden rule". */
export async function writeOutboxEntry(entry: OutboxEntry): Promise<void> {
  const db = await getDb();
  await db.put("outbox", entry);
}

export async function getPendingOutboxEntries(type?: "SALE" | "SCAN"): Promise<OutboxEntry[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex("outbox", "by-sync-status", "PENDING");
  return type ? all.filter((e) => e.type === type) : all;
}

export async function getAllOutboxEntries(): Promise<OutboxEntry[]> {
  const db = await getDb();
  return db.getAll("outbox");
}

export async function updateOutboxEntry(id: string, patch: Partial<OutboxEntry>): Promise<void> {
  const db = await getDb();
  const existing = await db.get("outbox", id);
  if (!existing) return;
  await db.put("outbox", { ...existing, ...patch });
}

export async function countPendingOutbox(): Promise<number> {
  const db = await getDb();
  return db.countFromIndex("outbox", "by-sync-status", "PENDING");
}

// ── Local ticket cache (this gate's own issued tickets) ────────────────

export async function cacheTicket(ticket: CachedTicket): Promise<void> {
  const db = await getDb();
  await db.put("tickets", ticket);
}

export async function getCachedTicket(id: string): Promise<CachedTicket | undefined> {
  const db = await getDb();
  return db.get("tickets", id);
}

export async function markTicketRedeemed(id: string): Promise<void> {
  const db = await getDb();
  const ticket = await db.get("tickets", id);
  if (!ticket) return;
  await db.put("tickets", { ...ticket, status: "REDEEMED" });
}

export async function getAllCachedTickets(): Promise<CachedTicket[]> {
  const db = await getDb();
  return db.getAll("tickets");
}
