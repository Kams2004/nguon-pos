import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "../lib/api/client";
import {
  clearSession,
  getOrCreateTerminalId,
  loadSession,
  saveSession,
  type GateSession,
  type Session,
} from "../lib/offline/session";
import { runSync } from "../lib/offline/sync";
import { countPendingOutbox } from "../lib/offline/db";

type SessionContextValue = {
  session: Session | null;
  terminalId: string;
  isOnline: boolean;
  pendingCount: number;
  login: (username: string, password: string) => Promise<Session>;
  logout: () => void;
  syncNow: () => Promise<void>;
  refreshPendingCount: () => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const terminalId = getOrCreateTerminalId();

  const refreshPendingCount = useCallback(() => {
    countPendingOutbox().then(setPendingCount);
  }, []);

  const syncNow = useCallback(async () => {
    // Gateless sessions (SUPER_ADMIN, potentially COORDINATOR) never have
    // an outbox to sync — they don't operate a gate terminal.
    if (!session || !session.bootstrap || !navigator.onLine) return;
    await runSync(session as GateSession, terminalId);
    refreshPendingCount();
  }, [session, terminalId, refreshPendingCount]);

  useEffect(() => {
    refreshPendingCount();
    const onOnline = () => {
      setIsOnline(true);
      syncNow();
    };
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // Periodic sync + pending-count refresh while online, every 20s — a
  // backstop in case the `online` event alone misses something (e.g. a
  // flaky connection that never cleanly fires offline/online).
  useEffect(() => {
    const id = setInterval(() => {
      refreshPendingCount();
      if (navigator.onLine) syncNow();
    }, 20_000);
    return () => clearInterval(id);
  }, [syncNow, refreshPendingCount]);

  const login = useCallback(async (username: string, password: string) => {
    const loginRes = await api.login(username, password);
    // A gateless user (SUPER_ADMIN, and potentially COORDINATOR) has
    // nothing to bootstrap — the endpoint requires a gate and would 400.
    const bootstrap = loginRes.assignedGateId ? await api.bootstrap(loginRes.token) : null;
    const newSession: Session = {
      token: loginRes.token,
      userId: loginRes.userId,
      username: loginRes.username,
      fullName: loginRes.fullName,
      role: loginRes.role,
      establishmentId: loginRes.establishmentId,
      assignedGateId: loginRes.assignedGateId,
      bootstrap,
    };
    saveSession(newSession);
    setSession(newSession);
    return newSession;
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setSession(null);
  }, []);

  return (
    <SessionContext.Provider
      value={{ session, terminalId, isOnline, pendingCount, login, logout, syncNow, refreshPendingCount }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
