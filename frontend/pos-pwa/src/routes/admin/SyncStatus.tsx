import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  CloudOff,
  LayoutGrid,
  List,
  MonitorSmartphone,
  UserCheck,
  UserRound,
  Wifi,
} from "lucide-react";
import { useLiveEvents, useLiveRefresh, useSession } from "../../context/SessionContext";
import { api } from "../../lib/api/client";
import type { AdminGate, TerminalStatus } from "../../lib/api/types";
import { timeAgo, useNow } from "../../lib/useNow";
import { Loading, PageHeader, Pill, RefreshButton, StatCard } from "../../components/ui";
import { TerminalState } from "../../components/TerminalState";

type View = "cards" | "table";
type StateFilter = "all" | "online" | "offline";
const VIEW_KEY = "nguon-pos.tillsView";
const PAGE_SIZE = { cards: 12, table: 15 } as const;

function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === "table" ? "table" : "cards";
  } catch {
    return "cards";
  }
}

export default function SyncStatus() {
  const { session } = useSession();
  const navigate = useNavigate();
  const now = useNow();
  const [terminals, setTerminals] = useState<TerminalStatus[] | null>(null);
  const [gates, setGates] = useState<AdminGate[]>([]);
  const [view, setViewState] = useState<View>(readView);
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  const [gateFilter, setGateFilter] = useState("");
  const [page, setPage] = useState(0);

  const setView = (v: View) => {
    setViewState(v);
    setPage(0);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* remembering the view is a convenience only */
    }
  };

  const load = useCallback(async () => {
    if (!session) return;
    const [t, g] = await Promise.all([api.syncStatus(session.token), api.listGates(session.token).catch(() => [] as AdminGate[])]);
    setTerminals(t);
    setGates(g);
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);

  // A till's status change arrives as a TERMINAL_STATUS event with its full
  // new state — patched in place, no refetch.
  useLiveEvents(["TERMINAL_STATUS"], (e) => {
    const status = e.data as TerminalStatus;
    setTerminals((prev) => {
      if (!prev) return prev;
      const exists = prev.some((t) => t.terminalId === status.terminalId);
      return exists ? prev.map((t) => (t.terminalId === status.terminalId ? status : t)) : [...prev, status];
    });
  });
  useLiveRefresh(["SALES_CHANGED", "CATALOG_CHANGED"], load);

  if (!session) return null;
  const gateName = (id: string) => gates.find((g) => g.id === id)?.name ?? id.slice(0, 8);
  const all = [...(terminals ?? [])].sort((a, b) => Number(b.online) - Number(a.online) || b.lastSeenAt.localeCompare(a.lastSeenAt));
  const online = all.filter((t) => t.online).length;
  const loggedIn = all.filter((t) => t.loggedIn && t.online).length;
  const pending = all.reduce((s, t) => s + t.localPendingCount, 0);

  const filtered = all.filter(
    (t) => (stateFilter === "all" || (stateFilter === "online") === t.online) && (!gateFilter || t.gateId === gateFilter),
  );
  const size = PAGE_SIZE[view];
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const current = Math.min(page, pages - 1);
  const visible = filtered.slice(current * size, current * size + size);
  const open = (t: TerminalStatus) => navigate(`/admin/sync-status/${t.terminalId}`);

  return (
    <>
      <PageHeader
        title="Caisses en direct"
        subtitle="État mis à jour automatiquement — une caisse fermée ou coupée du réseau passe « hors-ligne » en 15 à 25 s. Cliquez une caisse pour voir ses transactions."
        actions={<RefreshButton onRefresh={load} />}
      />

      <div className="stat-strip">
        <StatCard icon={MonitorSmartphone} tone="blue" label="Caisses connues" value={String(all.length)} />
        <StatCard icon={Wifi} tone="green" label="En ligne" value={`${online} / ${all.length}`} />
        <StatCard icon={UserCheck} tone="violet" label="Utilisateurs connectés" value={String(loggedIn)} />
        <StatCard icon={CloudOff} tone="gold" label="Opérations en attente" value={String(pending)} />
      </div>

      <div className="card flex flex-wrap items-center gap-3 p-3">
        <div className="flex rounded-xl bg-muted p-1">
          {(
            [
              ["all", `Toutes (${all.length})`],
              ["online", `En ligne (${online})`],
              ["offline", `Hors-ligne (${all.length - online})`],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => {
                setStateFilter(value);
                setPage(0);
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                stateFilter === value ? "bg-secondary text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <select
          value={gateFilter}
          onChange={(e) => {
            setGateFilter(e.target.value);
            setPage(0);
          }}
          className="field w-auto py-2"
        >
          <option value="">Toutes les portes</option>
          {gates.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <div className="ml-auto flex rounded-xl border border-border p-1" role="group" aria-label="Affichage">
          <button
            onClick={() => setView("cards")}
            aria-pressed={view === "cards"}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${
              view === "cards" ? "bg-secondary text-white" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LayoutGrid className="h-4 w-4" /> Cartes
          </button>
          <button
            onClick={() => setView("table")}
            aria-pressed={view === "table"}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${
              view === "table" ? "bg-secondary text-white" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <List className="h-4 w-4" /> Tableau
          </button>
        </div>
      </div>

      {terminals === null ? (
        <Loading />
      ) : filtered.length === 0 ? (
        <p className="card p-8 text-center text-sm text-muted-foreground">Aucune caisse pour ces critères.</p>
      ) : view === "cards" ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {visible.map((t) => (
            <button
              key={t.terminalId}
              onClick={() => open(t)}
              className={`card relative overflow-hidden p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-lg ${
                t.online ? "" : "opacity-80"
              }`}
            >
              <span className={`absolute inset-x-0 top-0 h-1 ${t.online ? "bg-success" : "bg-muted-foreground/30"}`} />
              <div className="flex items-start gap-3">
                <span
                  className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ${
                    t.online ? "bg-emerald-50 text-emerald-600" : "bg-muted text-muted-foreground"
                  }`}
                >
                  <MonitorSmartphone className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-foreground">{t.deviceLabel ?? "Caisse"}</p>
                  <p className="text-xs text-muted-foreground">{gateName(t.gateId)}</p>
                </div>
                {t.localPendingCount > 0 && <Pill tone="warning">{t.localPendingCount} en attente</Pill>}
              </div>
              <div className="mt-3">
                <TerminalState t={t} />
              </div>
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5 whitespace-nowrap">
                  <Clock className="h-3.5 w-3.5" /> {timeAgo(t.lastSeenAt, now)}
                </span>
                <span className="flex min-w-0 items-center gap-1">
                  <UserRound className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="truncate">{t.currentUserName ?? "—"}</span>
                </span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40">
                <tr>
                  <th className="th">Caisse</th>
                  <th className="th">Porte</th>
                  <th className="th">État</th>
                  <th className="th">Dernier signal</th>
                  <th className="th text-right">En attente</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody>
                {visible.map((t) => (
                  <tr
                    key={t.terminalId}
                    onClick={() => open(t)}
                    className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-blue-50/50"
                  >
                    <td className="td">
                      <p className="font-semibold text-foreground">{t.deviceLabel ?? "Caisse"}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">{t.terminalId.slice(0, 13)}</p>
                    </td>
                    <td className="td">{gateName(t.gateId)}</td>
                    <td className="td">
                      <TerminalState t={t} />
                    </td>
                    <td className="td text-muted-foreground">{timeAgo(t.lastSeenAt, now)}</td>
                    <td className="td text-right">
                      {t.localPendingCount > 0 ? <Pill tone="warning">{t.localPendingCount}</Pill> : <span className="text-muted-foreground">0</span>}
                    </td>
                    <td className="td text-right text-muted-foreground">
                      <ChevronRight className="ml-auto h-4 w-4" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {filtered.length > size && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            {current * size + 1}–{Math.min(filtered.length, current * size + size)} sur {filtered.length} caisses
          </span>
          <div className="flex items-center gap-1">
            <button disabled={current === 0} onClick={() => setPage(current - 1)} className="btn-outline px-2 py-1.5" aria-label="Page précédente">
              <ChevronLeft className="h-4 w-4" />
            </button>
            {Array.from({ length: pages }, (_, i) => (
              <button
                key={i}
                onClick={() => setPage(i)}
                aria-current={i === current ? "page" : undefined}
                className={`h-8 min-w-8 rounded-lg px-2 text-xs font-semibold ${
                  i === current ? "bg-secondary text-white" : "border border-border bg-card hover:bg-muted"
                }`}
              >
                {i + 1}
              </button>
            ))}
            <button
              disabled={current + 1 >= pages}
              onClick={() => setPage(current + 1)}
              className="btn-outline px-2 py-1.5"
              aria-label="Page suivante"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
