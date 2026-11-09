import type { BootstrapResponse, PaymentMethod, Role } from "../api/types";
import { EDGE_URL } from "../platform";

// Client for the till's local server (edge/edge-service, /local/v1).

/** An error from the local server: `code` is a stable reason ("FIRST_LOGIN_NEEDS_NETWORK", …). */
export class EdgeError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(code);
  }
}

export const EDGE_SESSION_EXPIRED = "nguon-edge-session-expired";

let uiTokenPromise: Promise<string> | null = null;

/**
 * The secret shared with the local server. In the desktop app it is read
 * from the installed token file through a Tauri command; in development it
 * comes from VITE_EDGE_UI_TOKEN (the content of <data-dir>/ui-token).
 */
function uiToken(): Promise<string> {
  uiTokenPromise ??= (async () => {
    const tauri = (window as unknown as { __TAURI_INTERNALS__?: { invoke: (cmd: string) => Promise<string> } }).__TAURI_INTERNALS__;
    if (tauri) return tauri.invoke("edge_ui_token");
    return import.meta.env.VITE_EDGE_UI_TOKEN ?? "";
  })();
  return uiTokenPromise;
}

async function call<T>(path: string, init: RequestInit & { session?: string } = {}): Promise<T> {
  const headers: Record<string, string> = { "X-Edge-Ui-Token": await uiToken() };
  if (init.body) headers["Content-Type"] = "application/json";
  if (init.session) headers.Authorization = `Bearer ${init.session}`;
  let res: Response;
  try {
    res = await fetch(`${EDGE_URL}/local/v1${path}`, { ...init, headers });
  } catch {
    throw new EdgeError(0, "EDGE_UNREACHABLE");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const code = body?.error ?? (res.status === 401 && init.session ? "SESSION_REQUIRED" : `HTTP_${res.status}`);
    // The local session expired (12 h) or the till was reset: back to the login screen.
    if (res.status === 401 && init.session) window.dispatchEvent(new Event(EDGE_SESSION_EXPIRED));
    throw new EdgeError(res.status, code);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export type EdgeStatus = {
  deviceId: string;
  deviceCode: string;
  gate: { id: string; name: string; code: string } | null;
  centralUrl: string;
  centralReachable: boolean;
  lastSyncAt: string | null;
  pending: number;
  enrolled: boolean;
  revoked: boolean;
  deviceNo: number | null;
  /** The till's name, given in the back office when its code was made. */
  deviceLabel: string | null;
  channelConnected: boolean;
  /** The installed version ("dev" from source) and the automatic update's progress. */
  appVersion: string;
  update: {
    state: "UP_TO_DATE" | "DOWNLOADING" | "READY" | "INSTALLING" | "FAILED" | "UNSUPPORTED";
    targetVersion: string | null;
    error: string | null;
  };
};

export type EdgeUser = { id: string; username: string; fullName: string; role: Role; assignedGateId: string };

export type EdgeTicket = {
  id: string;
  ticketTypeId: string;
  ticketTypeName: string;
  ticketNumber: string;
  qrContent: string;
  status: string;
};

export type EdgeSale = {
  id: string;
  localReference: string;
  centralReference: string | null;
  paymentMethod: PaymentMethod;
  total: number;
  currency: string;
  createdAt: string;
  tickets: EdgeTicket[];
};

export type EdgeSaleSummary = {
  id: string;
  localReference: string;
  centralReference: string | null;
  total: number;
  createdAt: string;
  ticketCount: number;
  synced: boolean;
};

export type EdgeScanResult = {
  result: "ACCEPTED" | "ALREADY_REDEEMED" | "VOIDED" | "INVALID_SIGNATURE" | "WRONG_GATE" | "NOT_RECOGNIZED";
  ticketNumber: string | null;
  redeemedAt: string | null;
};

/** Per-till printer settings, kept on the till itself. */
export type PrinterSettings = {
  printerName: string;
  paperWidth: 58 | 80;
  autoPrint: "NONE" | "RECEIPT" | "TICKETS" | "ALL";
  copies: number;
  offsetMm: number;
};

export const edge = {
  status: () => call<EdgeStatus>("/status"),
  enroll: (code: string, label: string) =>
    call<{ deviceNo: number; label: string; gateId: string }>("/enroll", { method: "POST", body: JSON.stringify({ code, label }) }),
  login: (username: string, password: string) =>
    call<{ token: string; user: EdgeUser; verifiedOnline: boolean }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: (session: string) => call<void>("/auth/logout", { method: "POST", session }),
  bootstrap: (session: string) => call<BootstrapResponse>("/bootstrap", { session }),
  sell: (
    session: string,
    req: { clientRequestId: string; paymentMethod: PaymentMethod; lines: { ticketTypeId: string; quantity: number }[] },
  ) => call<EdgeSale>("/sales", { method: "POST", session, body: JSON.stringify(req) }),
  recentSales: (session: string, limit = 200) => call<EdgeSaleSummary[]>(`/sales?limit=${limit}`, { session }),
  scan: (session: string, qrContent: string) =>
    call<EdgeScanResult>("/scans", { method: "POST", session, body: JSON.stringify({ qrContent }) }),
  printer: (session: string) => call<PrinterSettings>("/settings/printer", { session }),
  savePrinter: (session: string, s: PrinterSettings) =>
    call<PrinterSettings>("/settings/printer", { method: "PUT", session, body: JSON.stringify(s) }),

  /** Live events from the local server (SYNC_STATUS, SALE_CREATED…); reconnects by itself. Returns a closer. */
  events(session: string, onEvent: (e: { type: string; data?: unknown }) => void, onStatus: (open: boolean) => void): () => void {
    let stopped = false;
    let controller: AbortController | null = null;
    const run = async (delay: number) => {
      while (!stopped) {
        controller = new AbortController();
        try {
          const res = await fetch(`${EDGE_URL}/local/v1/events`, {
            headers: { "X-Edge-Ui-Token": await uiToken(), Authorization: `Bearer ${session}` },
            signal: controller.signal,
          });
          if (!res.ok || !res.body) throw new Error(String(res.status));
          onStatus(true);
          delay = 1000;
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let cut: number;
            while ((cut = buffer.indexOf("\n\n")) >= 0) {
              const frame = buffer.slice(0, cut);
              buffer = buffer.slice(cut + 2);
              const data = frame
                .split("\n")
                .filter((l) => l.startsWith("data:"))
                .map((l) => l.slice(5).trimStart())
                .join("\n");
              if (data) onEvent(JSON.parse(data));
            }
          }
        } catch {
          // fall through to the reconnect below
        }
        onStatus(false);
        if (stopped) return;
        await new Promise((r) => setTimeout(r, delay));
        delay = Math.min(delay * 2, 15_000);
      }
    };
    run(1000);
    return () => {
      stopped = true;
      controller?.abort();
    };
  },
};
