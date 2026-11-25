import { useCallback, useEffect, useState } from "react";
import { DoorOpen, History, MonitorSmartphone, Search } from "lucide-react";
import { useLiveEvents, useSession } from "../context/SessionContext";
import { api } from "../lib/api/client";
import type { AdminGate, TillSession } from "../lib/api/types";
import { addDays, dayKey, formatTime } from "../lib/format";
import { useI18n } from "../i18n";
import { CardHeader, Pill, SkeletonRows } from "./ui";
import { Pagination, usePaged } from "./Pagination";

function parseDay(v: string): Date {
  const [y, m, d] = v.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** "2 h 05", "12 min". */
function duration(fromIso: string, toIso: string): string {
  const min = Math.max(0, Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60000));
  return min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")}` : `${min} min`;
}

/**
 * "Historique des connexions": on a given day, who signed in on which till,
 * at which gate, from when to when — so a cashier who works at Porte A one
 * day and Porte B the next is seen at each. Sessions lived entirely offline
 * are not seen by central (their sales still name cashier, till and gate).
 */
export function SessionHistory({ gates, gateFilter }: { gates: AdminGate[]; gateFilter: string }) {
  const { t } = useI18n();
  const { session } = useSession();
  const [day, setDay] = useState(dayKey(new Date()));
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<TillSession[] | null>(null);

  const load = useCallback(() => {
    if (!session) return;
    const from = parseDay(day);
    api
      .tillSessions(session.token, from.toISOString(), addDays(from, 1).toISOString())
      .then(setRows)
      .catch(() => setRows([]));
  }, [session, day]);

  useEffect(() => {
    setRows(null);
    load();
  }, [load]);
  // Someone signs in or out somewhere: the list follows.
  useLiveEvents(["TERMINAL_STATUS"], load);

  const q = query.trim().toLowerCase();
  const visible = (rows ?? []).filter(
    (r) => (!gateFilter || r.gateId === gateFilter) && (!q || (r.userName ?? "").toLowerCase().includes(q)),
  );
  const paged = usePaged(visible, 25, `${day}|${gateFilter}|${q}`);
  const gateName = (id: string) => gates.find((g) => g.id === id)?.name ?? "?";

  return (
    <div className="card overflow-hidden">
      <CardHeader title={t("reports.sessions.title")} />
      <p className="max-w-[80ch] px-5 pb-3 text-sm text-muted-foreground">{t("reports.sessions.intro")}</p>
      <div className="flex flex-wrap items-end gap-3 px-5 pb-4">
        <div>
          <label className="field-label">{t("reports.reports.day")}</label>
          <input type="date" value={day} max={dayKey(new Date())} onChange={(e) => e.target.value && setDay(e.target.value)} className="field" />
        </div>
        <label className="relative">
          <span className="sr-only">{t("reports.sessions.search")}</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("reports.sessions.search")}
            className="field w-64 py-2 pl-9"
          />
        </label>
      </div>
      {rows === null ? (
        <SkeletonRows rows={4} cols={5} />
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center gap-2 border-t border-border p-8 text-center">
          <History className="h-9 w-9 text-royal/25" strokeWidth={1.5} />
          <p className="text-sm text-muted-foreground">{t("reports.sessions.empty")}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-y border-border bg-muted/40">
              <tr>
                <th className="th">{t("reports.col.cashier")}</th>
                <th className="th">{t("reports.col.gate")}</th>
                <th className="th">{t("reports.sessions.till")}</th>
                <th className="th">{t("reports.sessions.from")}</th>
                <th className="th">{t("reports.sessions.to")}</th>
                <th className="th text-right">{t("reports.sessions.duration")}</th>
              </tr>
            </thead>
            <tbody>
              {paged.pageItems.map((r) => (
                <tr key={r.id} className="border-b border-border/60 last:border-0">
                  <td className="td font-semibold text-foreground">{r.userName ?? "—"}</td>
                  <td className="td">
                    <span className="flex items-center gap-1.5">
                      <DoorOpen className="h-3.5 w-3.5 text-muted-foreground" /> {gateName(r.gateId)}
                    </span>
                  </td>
                  <td className="td">
                    <span className="flex items-center gap-1.5">
                      <MonitorSmartphone className="h-3.5 w-3.5 text-muted-foreground" /> {r.deviceLabel ?? r.terminalId.slice(0, 8)}
                    </span>
                  </td>
                  <td className="td tabular-nums">{formatTime(r.startedAt)}</td>
                  <td className="td tabular-nums">
                    {r.endedAt ? (
                      formatTime(r.endedAt)
                    ) : (
                      <Pill tone="success" dot>
                        {t("reports.sessions.ongoing")}
                      </Pill>
                    )}
                  </td>
                  <td className="td text-right tabular-nums text-muted-foreground">
                    {duration(r.startedAt, r.endedAt ?? r.lastSeenAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination
        page={paged.page}
        pages={paged.pages}
        total={paged.total}
        size={paged.size}
        onPage={paged.setPage}
        onSize={paged.setSize}
        unit={t("reports.sessions.unit")}
      />
    </div>
  );
}
