import type {
  DirectoryUser,
  SubscriptionOverview,
  SubscriptionPaymentMethod,
  SubscriptionSettings,
  ScanFilter,
  ScanPage,
  AuditEntry,
  Branding,
  MediaItem,
  TicketDesign,
  DesignOptions,
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

  heartbeat(token: string, terminalId: string, gateId: string, localPendingCount: number, deviceLabel?: string): Promise<void> {
    return request(`${SALES_BASE}/sales/sync/heartbeat`, {
      method: "POST",
      headers: authHeader(token),
      body: JSON.stringify({ terminalId, gateId, localPendingCount, deviceLabel }),
    });
  },

  terminalLogout(token: string, terminalId: string): Promise<void> {
    return request(`${SALES_BASE}/sales/sync/terminal-logout`, {
      method: "POST",
      headers: authHeader(token),
      body: JSON.stringify({ terminalId }),
    });
  },

  logout(token: string): Promise<void> {
    return request(`${AUTH_BASE}/auth/logout`, { method: "POST", headers: authHeader(token) });
  },

  listTransactions(
    token: string,
    page = 0,
    size = 25,
    filters: { terminalId?: string; cashierUserId?: string; gateId?: string; ticketTypeId?: string; from?: string; to?: string } = {},
  ): Promise<{ content: TransactionSummary[]; totalElements: number; totalPages: number }> {
    const params = new URLSearchParams({ page: String(page), size: String(size) });
    if (filters.terminalId) params.set("terminalId", filters.terminalId);
    if (filters.cashierUserId) params.set("cashierUserId", filters.cashierUserId);
    if (filters.gateId) params.set("gateId", filters.gateId);
    if (filters.ticketTypeId) params.set("ticketTypeId", filters.ticketTypeId);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    return request(`${SALES_BASE}/sales/transactions?${params}`, {
      headers: authHeader(token),
    });
  },

  listScans(
    token: string,
    page = 0,
    size = 25,
    filters: { result?: ScanFilter; gateId?: string; terminalId?: string; from?: string; to?: string } = {},
  ): Promise<ScanPage> {
    const params = new URLSearchParams({ page: String(page), size: String(size) });
    for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
    return request(`${SALES_BASE}/sales/admin/scans?${params}`, { headers: authHeader(token) });
  },

  listAudit(
    token: string,
    params: { page?: number; size?: number; category?: string; q?: string } = {},
  ): Promise<{ content: AuditEntry[]; totalElements: number }> {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") qs.set(k, String(v));
    return request(`${SALES_BASE}/sales/admin/audit?${qs}`, { headers: authHeader(token) });
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
    data: { gateId: string | null; name: string; price: number; currency: string; printMode: PrintMode; icon: string | null; color: string | null },
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
    data: { gateId: string | null; name: string; price: number; currency: string; printMode: PrintMode; icon: string | null; color: string | null },
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

  // ── Admin: subscription (Super Admin) ────────────────────────────────

  getSubscription(token: string): Promise<SubscriptionOverview> {
    return request(`${CATALOG_BASE}/catalog/admin/subscription`, { headers: authHeader(token) });
  },

  updateSubscriptionSettings(token: string, data: SubscriptionSettings): Promise<SubscriptionOverview> {
    return request(`${CATALOG_BASE}/catalog/admin/subscription/settings`, { method: "PUT", headers: authHeader(token), body: JSON.stringify(data) });
  },

  createSubscriptionPeriod(token: string, data: { startDate: string; note?: string }): Promise<SubscriptionOverview> {
    return request(`${CATALOG_BASE}/catalog/admin/subscription/periods`, { method: "POST", headers: authHeader(token), body: JSON.stringify(data) });
  },

  cancelSubscriptionPeriod(token: string, id: string): Promise<SubscriptionOverview> {
    return request(`${CATALOG_BASE}/catalog/admin/subscription/periods/${encodeURIComponent(id)}/cancel`, { method: "POST", headers: authHeader(token) });
  },

  recordSubscriptionPayment(
    token: string,
    periodId: string,
    data: { amount: number; method: SubscriptionPaymentMethod; reference?: string; paidAt?: string; note?: string },
  ): Promise<SubscriptionOverview> {
    return request(`${CATALOG_BASE}/catalog/admin/subscription/periods/${encodeURIComponent(periodId)}/payments`, {
      method: "POST",
      headers: authHeader(token),
      body: JSON.stringify(data),
    });
  },

  getEstablishment(token: string): Promise<AdminEstablishment> {
    return request(`${CATALOG_BASE}/catalog/admin/establishment`, { headers: authHeader(token) });
  },

  updateEstablishment(
    token: string,
    data: {
      name: string;
      logoUrl: string | null;
      brandPrimaryColor: string | null;
      brandSecondaryColor: string | null;
      receiptMode: ReceiptMode;
      loginBackgroundUrl: string | null;
    } & TicketDesign &
      DesignOptions,
  ): Promise<AdminEstablishment> {
    return request(`${CATALOG_BASE}/catalog/admin/establishment`, {
      method: "PUT",
      headers: authHeader(token),
      body: JSON.stringify(data),
    });
  },

  getBranding(): Promise<Branding> {
    return request(`${CATALOG_BASE}/catalog/public/branding`);
  },

  // ── Admin: media library ─────────────────────────────────────────────

  listMedia(token: string): Promise<MediaItem[]> {
    return request(`${CATALOG_BASE}/catalog/admin/media`, { headers: authHeader(token) });
  },

  async uploadMedia(token: string, file: File): Promise<MediaItem> {
    // Not via request(): the browser must set the multipart boundary itself.
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${CATALOG_BASE}/catalog/admin/media`, { method: "POST", headers: authHeader(token), body: form });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new ApiError(body?.message || body?.detail || `Échec de l'envoi (${res.status})`, res.status);
    }
    return res.json();
  },

  deleteMedia(token: string, id: string): Promise<void> {
    return request(`${CATALOG_BASE}/catalog/admin/media/${id}`, { method: "DELETE", headers: authHeader(token) });
  },

  // ── Admin: users ─────────────────────────────────────────────────────

  /** Names only — readable by coordinators too (cashier filter and breakdown). */
  listDirectory(token: string): Promise<DirectoryUser[]> {
    return request(`${AUTH_BASE}/auth/admin/directory`, { headers: authHeader(token) });
  },

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

/** A readable French message from a failed call — the server's own reason when it gave one. */
export function errorMessage(err: unknown, fallback = "Une erreur est survenue."): string {
  if (err instanceof ApiError) {
    try {
      const body = JSON.parse(err.message);
      return body.message || body.detail || fallback;
    } catch {
      return err.message && err.message.length < 200 ? err.message : fallback;
    }
  }
  return err instanceof Error ? err.message : fallback;
}
