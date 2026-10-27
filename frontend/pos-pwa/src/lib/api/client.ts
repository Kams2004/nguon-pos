import type {
  AdminEstablishment,
  AdminGate,
  AdminTicketType,
  AdminUser,
  BootstrapResponse,
  LoginResponse,
  PrintMode,
  ReceiptMode,
  Role,
  SaleSyncEntry,
  SaleSyncResult,
  ScanSyncEntry,
  ScanSyncResult,
  TerminalStatus,
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

  listTransactions(
    token: string,
    page = 0,
    size = 25,
  ): Promise<{ content: TransactionSummary[]; totalElements: number; totalPages: number }> {
    return request(`${SALES_BASE}/sales/transactions?page=${page}&size=${size}`, {
      headers: authHeader(token),
    });
  },

  voidTransaction(token: string, id: string, reason: string): Promise<TransactionSummary> {
    return request(`${SALES_BASE}/sales/transactions/${id}/void`, {
      method: "POST",
      headers: authHeader(token),
      body: JSON.stringify({ reason }),
    });
  },

  syncStatus(token: string): Promise<TerminalStatus[]> {
    return request(`${SALES_BASE}/sales/admin/sync-status`, {
      headers: authHeader(token),
    });
  },

  // ── Admin: catalog ──────────────────────────────────────────────────

  listGates(token: string): Promise<AdminGate[]> {
    return request(`${CATALOG_BASE}/catalog/admin/gates`, { headers: authHeader(token) });
  },

  createGate(token: string, name: string, code: string): Promise<AdminGate> {
    return request(`${CATALOG_BASE}/catalog/admin/gates`, {
      method: "POST",
      headers: authHeader(token),
      body: JSON.stringify({ name, code }),
    });
  },

  updateGate(token: string, id: string, name: string, active: boolean): Promise<AdminGate> {
    return request(`${CATALOG_BASE}/catalog/admin/gates/${id}`, {
      method: "PUT",
      headers: authHeader(token),
      body: JSON.stringify({ name, active }),
    });
  },

  listTicketTypesAdmin(token: string): Promise<AdminTicketType[]> {
    return request(`${CATALOG_BASE}/catalog/admin/ticket-types`, { headers: authHeader(token) });
  },

  createTicketType(
    token: string,
    data: { gateId: string | null; name: string; price: number; currency: string; printMode: PrintMode },
  ): Promise<AdminTicketType> {
    return request(`${CATALOG_BASE}/catalog/admin/ticket-types`, {
      method: "POST",
      headers: authHeader(token),
      body: JSON.stringify(data),
    });
  },

  updateTicketType(
    token: string,
    id: string,
    data: { gateId: string | null; name: string; price: number; currency: string; printMode: PrintMode },
  ): Promise<AdminTicketType> {
    return request(`${CATALOG_BASE}/catalog/admin/ticket-types/${id}`, {
      method: "PUT",
      headers: authHeader(token),
      body: JSON.stringify(data),
    });
  },

  setTicketTypeActive(token: string, id: string, active: boolean): Promise<AdminTicketType> {
    return request(`${CATALOG_BASE}/catalog/admin/ticket-types/${id}/active`, {
      method: "PUT",
      headers: authHeader(token),
      body: JSON.stringify({ active }),
    });
  },

  getEstablishment(token: string): Promise<AdminEstablishment> {
    return request(`${CATALOG_BASE}/catalog/admin/establishment`, { headers: authHeader(token) });
  },

  updateEstablishment(
    token: string,
    data: { name: string; logoUrl: string | null; brandPrimaryColor: string | null; brandSecondaryColor: string | null; receiptMode: ReceiptMode },
  ): Promise<AdminEstablishment> {
    return request(`${CATALOG_BASE}/catalog/admin/establishment`, {
      method: "PUT",
      headers: authHeader(token),
      body: JSON.stringify(data),
    });
  },

  // ── Admin: users ─────────────────────────────────────────────────────

  listUsers(token: string): Promise<AdminUser[]> {
    return request(`${AUTH_BASE}/auth/admin/users`, { headers: authHeader(token) });
  },

  createUser(
    token: string,
    data: { username: string; password: string; fullName: string; role: Role; assignedGateId: string | null },
  ): Promise<AdminUser> {
    return request(`${AUTH_BASE}/auth/admin/users`, {
      method: "POST",
      headers: authHeader(token),
      body: JSON.stringify(data),
    });
  },

  updateUser(
    token: string,
    id: string,
    data: { fullName: string; role: Role; assignedGateId: string | null; active: boolean; password?: string },
  ): Promise<AdminUser> {
    return request(`${AUTH_BASE}/auth/admin/users/${id}`, {
      method: "PUT",
      headers: authHeader(token),
      body: JSON.stringify(data),
    });
  },
};

export { ApiError };
