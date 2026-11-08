import { useCallback, useEffect, useState } from "react";
import { useLiveRefresh, useSession } from "../context/SessionContext";
import { api } from "./api/client";
import type { AdminGate, AdminTicketType, DirectoryUser } from "./api/types";

/**
 * Gates, ticket types and user names for admin screens, to turn ids into names/icons.
 * Both lists are SUPER_ADMIN-only on the backend; a coordinator gets empty
 * lists and screens fall back to short ids. Refreshes on catalog changes.
 */
export function useCatalog() {
  const { session } = useSession();
  const [gates, setGates] = useState<AdminGate[]>([]);
  const [ticketTypes, setTicketTypes] = useState<AdminTicketType[]>([]);
  const [users, setUsers] = useState<DirectoryUser[]>([]);

  const load = useCallback(() => {
    if (!session) return;
    api.listGates(session.token).then(setGates).catch(() => setGates([]));
    api.listTicketTypesAdmin(session.token).then(setTicketTypes).catch(() => setTicketTypes([]));
  }, [session]);

  useEffect(load, [load]);
  useEffect(() => {
    if (session) api.listDirectory(session.token).then(setUsers).catch(() => setUsers([]));
  }, [session]);
  useLiveRefresh(["CATALOG_CHANGED"], load);

  return {
    gates,
    ticketTypes,
    users,
    userName: (id: string) => users.find((u) => u.id === id)?.fullName ?? id.slice(0, 8),
    gateName: (id: string) => gates.find((g) => g.id === id)?.name ?? id.slice(0, 8),
    ticketType: (id: string) => ticketTypes.find((t) => t.id === id),
  };
}
