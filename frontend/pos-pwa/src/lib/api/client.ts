import type {
  BootstrapResponse,
  LoginResponse,
  SaleSyncEntry,
  SaleSyncResult,
  ScanSyncEntry,
  ScanSyncResult,
  TransactionSummary,
} from "./types";

// nginx routes by path prefix — /api/auth -> auth-service's own /auth/**,
// /api/catalog -> catalog-service's /catalog/**, /api/sales -> sales-service's
// /sales/**. The service's own @RequestMapping base stays in the URL (hence
// the doubled "auth"/"sales" segments below) — nginx only strips the
// routing prefix, not the controller's own path.
const AUTH_BASE = "/api/auth";
const CATALOG_BASE = "/api/catalog";
const SALES_BASE = "/api/sales";

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ApiError(body || `Request failed (${res.status})`, res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export const api = {
  login(username: string, password: string): Promise<LoginResponse> {
    return request(`${AUTH_BASE}/auth/login`, {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },

  bootstrap(token: string): Promise<BootstrapResponse> {
    return request(`${CATALOG_BASE}/catalog/bootstrap`, {
      headers: authHeader(token),
    });
  },

  syncTransactions(
    token: string,
    terminalId: string,
    gateId: string,
    entries: SaleSyncEntry[],
  ): Promise<{ results: SaleSyncResult[] }> {
    return request(`${SALES_BASE}/sales/sync/transactions`, {
      method: "POST",
      headers: authHeader(token),
      body: JSON.stringify({ terminalId, gateId, entries }),
    });
  },

  syncScans(
    token: string,
    terminalId: string,
    gateId: string,
    entries: ScanSyncEntry[],
  ): Promise<{ results: ScanSyncResult[] }> {
    return request(`${SALES_BASE}/sales/sync/scans`, {
      method: "POST",
      headers: authHeader(token),
      body: JSON.stringify({ terminalId, gateId, entries }),
    });
  },

  heartbeat(token: string, terminalId: string, gateId: string, localPendingCount: number): Promise<void> {
    return request(`${SALES_BASE}/sales/sync/heartbeat`, {
      method: "POST",
      headers: authHeader(token),
      body: JSON.stringify({ terminalId, gateId, localPendingCount }),
    });
  },

  listTransactions(token: string): Promise<{ content: TransactionSummary[]; totalElements: number }> {
    return request(`${SALES_BASE}/sales/transactions`, {
      headers: authHeader(token),
    });
  },
};

export { ApiError };
