import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "../lib/api/client";
import { clearSession, getOrCreateTerminalId, loadSession, saveSession, type GateSession, type Session } from "../lib/offline/session";
import { runSync } from "../lib/offline/sync";
import { countPendingOutbox } from "../lib/offline/db";
import { openLiveStream, type LiveEvent } from "../lib/live";
import { isEdgeMode } from "../lib/platform";
import { EDGE_SESSION_EXPIRED, edge } from "../lib/till/edgeClient";

type Listener = (e: LiveEvent) => void;

type SessionContextValue = {
  session: Session | null;
  terminalId: string;
  isOnline: boolean;
  pendingCount: number;
  /** The live event stream is open — admin screens update by themselves. */
  liveConnected: boolean;
  login: (username: string, password: string) => Promise<Session>;
  logout: () => void;
  syncNow: () => Promise<void>;
  refreshPendingCount: () => void;
  subscribe: (listener: Listener) => () => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

// A till reports in this often; the server declares it offline after ~25s
// of silence (see sales-service PresenceService).
const HEARTBEAT_MS = 10_000;

export function deviceLabelFor(session: Session, terminalId: string): string | undefined {
  if (!session.bootstrap) return undefined;
  return `${session.bootstrap.gate.name} · caisse ${terminalId.slice(0, 4).toUpperCase()}`;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  return isEdgeMode() ? <EdgeSessionProvider>{children}</EdgeSessionProvider> : <BrowserSessionProvider>{children}</BrowserSessionProvider>;
}

/** The PWA: the browser keeps the outbox and syncs with central itself. */
function BrowserSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [liveConnected, setLiveConnected] = useState(false);
  const listeners = useRef(new Set<Listener>());
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

  const subscribe = useCallback((listener: Listener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

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

  // Presence heartbeat for gate terminals: tells the admin live that this
  // till is reachable and who is logged in on it.
  useEffect(() => {
    if (!session?.bootstrap) return;
    const gate = session.bootstrap.gate;
    const beat = () => {
      if (!navigator.onLine) return;
      countPendingOutbox()
        .then((pending) => api.heartbeat(session.token, terminalId, gate.id, pending, deviceLabelFor(session, terminalId)))
        .catch(() => {
          /* best-effort; the next beat retries */
        });
    };
    beat();
    const id = setInterval(beat, HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [session, terminalId]);

  // One live stream per open app. Admin screens use it to update without
  // refreshing; gate terminals use it to pick up catalog/ticket-design
  // changes immediately (and its open connection counts as presence).
  const sessionRef = useRef(session);
  sessionRef.current = session;
  useEffect(() => {
    if (!session) return;
    const close = openLiveStream(
      session.token,
      session.bootstrap ? terminalId : null,
      (event) => {
        if (event.type === "CATALOG_CHANGED") {
          const current = sessionRef.current;
          if (current?.bootstrap) {
            api
              .bootstrap(current.token)
              .then((bootstrap) => {
                const updated = { ...current, bootstrap };
                saveSession(updated);
                setSession(updated);
              })
              .catch(() => {
                /* keep the cached catalog; it refreshes at next change or login */
              });
          }
        }
        listeners.current.forEach((l) => l(event));
      },
      setLiveConnected,
    );
    return close;
    // Re-open only when the person (token) changes — not on every bootstrap refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.token, terminalId]);

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
    const current = sessionRef.current;
    if (current && navigator.onLine) {
      // Best-effort: shows the till as "no one logged in" right away and
      // journals the logout. Never blocks logging out locally.
      if (current.bootstrap) api.terminalLogout(current.token, terminalId).catch(() => {});
      api.logout(current.token).catch(() => {});
    }
    clearSession();
    setSession(null);
  }, [terminalId]);

  return (
    <SessionContext.Provider
      value={{
        session,
        terminalId,
        isOnline,
        pendingCount,
        liveConnected,
        login,
        logout,
        syncNow,
        refreshPendingCount,
        subscribe,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

/**
 * The desktop till: the local server installed on the machine logs the
 * cashier in (online or not), holds the catalog and the sales, and syncs
 * with central on its own. This only mirrors its state for the screens.
 */
function EdgeSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const [isOnline, setIsOnline] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [liveConnected, setLiveConnected] = useState(false);
  const listeners = useRef(new Set<Listener>());
  const [terminalId, setTerminalId] = useState("");

  const refreshPendingCount = useCallback(() => {
    edge
      .status()
      .then((s) => {
        setTerminalId(s.deviceId);
        setPendingCount(s.pending);
        setIsOnline(s.centralReachable);
      })
      .catch(() => setIsOnline(false));
  }, []);

  useEffect(refreshPendingCount, [refreshPendingCount]);

  const sessionRef = useRef(session);
  sessionRef.current = session;
  useEffect(() => {
    if (!session) return;
    return edge.events(
      session.token,
      (event) => {
        if (event.type === "SYNC_STATUS") {
          const d = event.data as { centralReachable: boolean; pending: number };
          setIsOnline(d.centralReachable);
          setPendingCount(d.pending);
        }
        if (event.type === "SALE_CREATED") refreshPendingCount();
        listeners.current.forEach((l) => l(event as LiveEvent));
      },
      setLiveConnected,
    );
  }, [session?.token, refreshPendingCount]);

  const login = useCallback(
    async (username: string, password: string) => {
      const res = await edge.login(username, password);
      const bootstrap = await edge.bootstrap(res.token);
      const newSession: Session = {
        token: res.token,
        userId: res.user.id,
        username: res.user.username,
        fullName: res.user.fullName,
        role: res.user.role,
        establishmentId: bootstrap.establishment.id,
        assignedGateId: res.user.assignedGateId,
        // The signing secret stays inside the local server.
        bootstrap: { ...bootstrap, gate: { ...bootstrap.gate, signingSecret: "" } },
      };
      saveSession(newSession);
      setSession(newSession);
      refreshPendingCount();
      return newSession;
    },
    [refreshPendingCount],
  );

  const logout = useCallback(() => {
    const current = sessionRef.current;
    if (current) edge.logout(current.token).catch(() => {});
    clearSession();
    setSession(null);
  }, []);

  useEffect(() => {
    window.addEventListener(EDGE_SESSION_EXPIRED, logout);
    return () => window.removeEventListener(EDGE_SESSION_EXPIRED, logout);
  }, [logout]);

  // The local server syncs every few seconds by itself; "sync now" just refreshes what the screen shows.
  const syncNow = useCallback(async () => refreshPendingCount(), [refreshPendingCount]);

  const subscribe = useCallback((listener: Listener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  return (
    <SessionContext.Provider
      value={{ session, terminalId, isOnline, pendingCount, liveConnected, login, logout, syncNow, refreshPendingCount, subscribe }}
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

/** Calls `handler` for every live event of the given types. */
export function useLiveEvents(types: string[], handler: (e: LiveEvent) => void) {
  const { subscribe } = useSession();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const key = types.join(",");
  useEffect(
    () =>
      subscribe((e) => {
        if (key.split(",").includes(e.type)) handlerRef.current(e);
      }),
    [subscribe, key],
  );
}

/**
 * Re-runs `reload` when any of these live events arrive (coalesced, so a
 * burst of 25 synced sales triggers one refetch), and after the stream
 * reconnects — events sent while it was down would otherwise be missed.
 */
export function useLiveRefresh(types: string[], reload: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useLiveEvents([...types, "HELLO"], () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(reload, 300);
  });
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
}
