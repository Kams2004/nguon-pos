import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Clock, FilterX, ScanLine, ShieldAlert } from "lucide-react";
import { useLiveRefresh, useSession } from "../../context/SessionContext";
import { api } from "../../lib/api/client";
import type { ScanEntry, ScanFilter, ScanResultValue, TerminalStatus } from "../../lib/api/types";
import { addDays, dayKey, formatDateTime, startOfDay } from "../../lib/format";
import { useCatalog } from "../../lib/useCatalog";
import { TicketTypeBadge } from "../../lib/ticketIcons";
import { Pagination } from "../../components/Pagination";
import { PageHeader, PageSkeleton, Pill, RefreshButton, StatCard } from "../../components/ui";
import { locale, translate, useI18n, type MessageKey } from "../../i18n";

/** Read at render time, so it follows the current language. */
const resultLabel = (r: ScanResultValue) => translate(`reports.scans.result.${r}`);

const RESULT_FILTERS: { value: ScanFilter | ""; labelKey: MessageKey }[] = [
  { value: "", labelKey: "common.all" },
  { value: "ACCEPTED", labelKey: "reports.scans.filter.accepted" },
  { value: "REJECTED", labelKey: "reports.scans.filter.rejected" },
  { value: "REJECTED_ALREADY_REDEEMED", labelKey: "reports.scans.filter.alreadyUsed" },
  { value: "REJECTED_UNKNOWN_TICKET", labelKey: "reports.scans.filter.unknown" },
  { value: "PENDING_TICKET", labelKey: "reports.scans.filter.pending" },
];

type Filters = { result: ScanFilter | ""; gateId: string; from: string; to: string };
const NO_FILTERS: Filters = { result: "", gateId: "", from: "", to: "" };

function parseDay(v: string): Date {
  const [y, m, d] = v.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Contrôle des entrées: every synced scan. A ticket refused as "déjà
 * utilisé" shows when and at which till it was first let in — the case of
 * two tills of the same gate scanning one ticket while offline.
 */
export default function Scans() {
  const { session } = useSession();
  const { t } = useI18n();
  const { gates, gateName, ticketType, userName } = useCatalog();
  const [scans, setScans] = useState<ScanEntry[] | null>(null);
  const [counts, setCounts] = useState({ accepted: 0, rejected: 0, pending: 0 });
  const [terminals, setTerminals] = useState<TerminalStatus[]>([]);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [totalPages, setTotalPages] = useState(1);
  const [totalElements, setTotalElements] = useState(0);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);

  const load = useCallback(async () => {
    if (!session) return;
    const [res] = await Promise.all([
      api.listScans(session.token, page, pageSize, {
        result: filters.result || undefined,
        gateId: filters.gateId || undefined,
        from: filters.from ? parseDay(filters.from).toISOString() : undefined,
        to: filters.to ? addDays(parseDay(filters.to), 1).toISOString() : undefined,
      }),
      api
        .syncStatus(session.token)
        .then(setTerminals)
        .catch(() => {}),
    ]);
    setScans(res.content);
    setTotalPages(Math.max(1, res.totalPages));
    setTotalElements(res.totalElements);
    setCounts({ accepted: res.acceptedCount, rejected: res.rejectedCount, pending: res.pendingCount });
  }, [session, page, pageSize, filters]);

  useEffect(() => {
    load();
  }, [load]);
  useLiveRefresh(["SCANS_CHANGED"], load);

  if (!session) return null;
  if (!scans) return <PageSkeleton stats={4} rows={8} />;

  const active = Object.values(filters).some(Boolean);
  const setFilter = (patch: Partial<Filters>) => {
    setPage(0);
    setFilters((f) => ({ ...f, ...patch }));
  };
  const preset = (days: number) => {
    const today = startOfDay(new Date());
    setFilter({ from: dayKey(addDays(today, -(days - 1))), to: dayKey(today) });
  };
  const terminalLabel = (id: string | null) =>
    id
      ? (terminals.find((term) => term.terminalId === id)?.deviceLabel ?? t("reports.tillFallback", { id: id.slice(0, 4).toUpperCase() }))
      : "—";
  const total = counts.accepted + counts.rejected + counts.pending;

  return (
    <>
      <PageHeader title={t("reports.scans.title")} subtitle={t("reports.scans.subtitle")} actions={<RefreshButton onRefresh={load} />} />

      <div className="stat-strip">
        <StatCard icon={ScanLine} tone="blue" label={t("reports.scans.scans")} value={total.toLocaleString(locale())} />
        <StatCard icon={CheckCircle2} tone="green" label={t("reports.scans.accepted")} value={counts.accepted.toLocaleString(locale())} />
        <StatCard
          icon={ShieldAlert}
          tone="gold"
          label={t("reports.scans.rejected")}
          value={counts.rejected.toLocaleString(locale())}
          hint={total > 0 ? t("reports.scans.rejectedShare", { n: Math.round((counts.rejected / total) * 100) }) : undefined}
        />
        {counts.pending > 0 && (
          <StatCard
            icon={Clock}
            tone="blue"
            label={t("reports.scans.result.PENDING_TICKET")}
            value={counts.pending.toLocaleString(locale())}
            hint={t("reports.scans.pendingHint")}
          />
        )}
      </div>

      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="field-label">{t("reports.scans.result")}</label>
          <div className="flex flex-wrap rounded-xl bg-muted p-1">
            {RESULT_FILTERS.map((r) => (
              <button
                key={r.value}
                onClick={() => setFilter({ result: r.value })}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  filters.result === r.value ? "bg-secondary text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t(r.labelKey)}
              </button>
            ))}
          </div>
        </div>
        <div className="min-w-[160px] flex-1">
          <label className="field-label">{t("reports.col.gate")}</label>
          <select value={filters.gateId} onChange={(e) => setFilter({ gateId: e.target.value })} className="field">
            <option value="">{t("reports.filter.allGates")}</option>
            {gates.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label">{t("common.from")}</label>
          <input
            type="date"
            value={filters.from}
            max={filters.to || undefined}
            onChange={(e) => setFilter({ from: e.target.value })}
            className="field"
          />
        </div>
        <div>
          <label className="field-label">{t("common.to")}</label>
          <input
            type="date"
            value={filters.to}
            min={filters.from || undefined}
            onChange={(e) => setFilter({ to: e.target.value })}
            className="field"
          />
        </div>
        <div className="flex gap-2">
          <button onClick={() => preset(1)} className="btn-outline px-3 text-xs">
            {t("common.today")}
          </button>
          <button onClick={() => preset(7)} className="btn-outline px-3 text-xs">
            {t("common.days7")}
          </button>
        </div>
        {active && (
          <button onClick={() => setFilter(NO_FILTERS)} className="btn-outline px-3 text-xs text-destructive">
            <FilterX className="h-4 w-4" /> {t("common.clearFilters")}
          </button>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40">
              <tr>
                <th className="th">{t("reports.scans.scanDate")}</th>
                <th className="th">{t("reports.ticket")}</th>
                <th className="th">{t("reports.col.gate")}</th>
                <th className="th">{t("reports.till")}</th>
                <th className="th">{t("reports.scans.checker")}</th>
                <th className="th">{t("reports.scans.result")}</th>
                <th className="th">{t("reports.scans.detail")}</th>
              </tr>
            </thead>
            <tbody>
              {scans.length === 0 && (
                <tr>
                  <td colSpan={7} className="td text-center text-muted-foreground">
                    {active ? t("reports.scans.noMatch") : t("reports.scans.none")}
                  </td>
                </tr>
              )}
              {scans.map((s) => {
                const type = s.ticketTypeId ? ticketType(s.ticketTypeId) : undefined;
                const firstEntryElsewhere = s.result === "REJECTED_ALREADY_REDEEMED" && s.redeemedAt;
                return (
                  <tr
                    key={s.id}
                    className={`border-b border-border/60 last:border-0 ${s.result === "ACCEPTED" ? "" : s.result === "PENDING_TICKET" ? "bg-amber-50/40" : "bg-red-50/40"}`}
                  >
                    <td className="td text-muted-foreground">{formatDateTime(s.scannedAt)}</td>
                    <td className="td">
                      <div className="flex items-center gap-2.5">
                        {type && <TicketTypeBadge icon={type.icon} color={type.color} size="sm" />}
                        <div className="min-w-0">
                          <p className="font-mono text-xs font-semibold">{s.ticketNumber ?? s.ticketId.slice(0, 8)}</p>
                          <p className="text-xs text-muted-foreground">
                            {type?.name ?? (s.ticketNumber ? t("reports.ticket") : t("reports.scans.unknownToServer"))}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="td">{gateName(s.gateId)}</td>
                    <td className="td">{terminalLabel(s.terminalId)}</td>
                    <td className="td">{userName(s.scannedByUserId)}</td>
                    <td className="td">
                      <Pill tone={s.result === "ACCEPTED" ? "success" : s.result === "PENDING_TICKET" ? "warning" : "danger"}>
                        {resultLabel(s.result)}
                      </Pill>
                    </td>
                    <td className="td whitespace-normal text-xs text-muted-foreground">
                      {firstEntryElsewhere
                        ? t("reports.scans.enteredAt", { date: formatDateTime(s.redeemedAt!), till: terminalLabel(s.redeemedByTerminalId) })
                        : s.result === "REJECTED_UNKNOWN_TICKET"
                          ? t("reports.scans.otherVenue")
                          : s.result === "PENDING_TICKET"
                            ? t("reports.scans.sellerNotSynced")
                            : s.result === "REJECTED_VOIDED"
                              ? t("reports.scans.saleVoided")
                              : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination
          page={page}
          pages={totalPages}
          total={totalElements}
          size={pageSize}
          onPage={setPage}
          onSize={(n) => {
            setPageSize(n);
            setPage(0);
          }}
          unit={t("reports.unit.scans")}
        />
      </div>
    </>
  );
}
