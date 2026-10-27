import type { BootstrapResponse, LoginResponse } from "../api/types";

// Session/bootstrap data is simple key-value, read far more often than
// written, and doesn't need IndexedDB's transactional guarantees — unlike
// the outbox, losing a beat here just means re-fetching at next login, not
// losing a sale. localStorage is the right tool for this slice.
const SESSION_KEY = "nguon-pos.session";
const TERMINAL_KEY = "nguon-pos.terminalId";

export type Session = {
  token: string;
  userId: string;
  username: string;
  fullName: string;
  role: LoginResponse["role"];
  establishmentId: string;
  assignedGateId: string | null;
  bootstrap: BootstrapResponse;
};

export function saveSession(session: Session): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function loadSession(): Session | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

/** One stable id per physical device/browser profile, generated once and reused across logins — this is the Terminal entity's id. */
export function getOrCreateTerminalId(): string {
  let id = localStorage.getItem(TERMINAL_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(TERMINAL_KEY, id);
  }
  return id;
}
