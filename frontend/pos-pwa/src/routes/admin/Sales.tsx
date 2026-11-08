import { useCallback, useEffect, useState } from "react";
import { FilterX } from "lucide-react";
import { useLiveRefresh, useSession } from "../../context/SessionContext";
import { api } from "../../lib/api/client";
import type { TransactionSummary } from "../../lib/api/types";
import { PAYMENT_LABELS, addDays, dayKey, formatDateTime, formatMoney, startOfDay } from "../../lib/format";
import { useCatalog } from "../../lib/useCatalog";
import { Pagination } from "../../components/Pagination";
import { Loading, Modal, PageHeader, Pill, RefreshButton } from "../../components/ui";
import { TicketLines } from "../../components/TicketLines";
import { useI18n } from "../../i18n";

type Filters = { gateId: string; cashierUserId: string; ticketTypeId: string; from: string; to: string };
const NO_FILTERS: Filters = { gateId: "", cashierUserId: "", ticketTypeId: "", from: "", to: "" };

function parseDay(v: string): Date {
  const [y, m, d] = v.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export default function Sales() {
  const { session } = useSession();
  const { t } = useI18n();
  const { gates, ticketTypes, users, gateName, ticketType, userName } = useCatalog();
  const [transactions, setTransactions] = useState<TransactionSummary[]>([]);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [totalPages, setTotalPages] = useState(1);
  const [totalElements, setTotalElements] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [voidTarget, setVoidTarget] = useState<TransactionSummary | null>(null);
  const [voidReason, setVoidReason] = useState("");

  const load = useCallback(async () => {
    if (!session) return;
    const res = await api.listTransactions(session.token, page, pageSize, {
      gateId: filters.gateId || undefined,
      cashierUserId: filters.cashierUserId || undefined,
      ticketTypeId: filters.ticketTypeId || undefined,
      // Whole local days: from the start of "Du" to the end of "Au".
      from: filters.from ? parseDay(filters.from).toISOString() : undefined,
      to: filters.to ? addDays(parseDay(filters.to), 1).toISOString() : undefined,
    });
    setTransactions(res.content);
    setTotalPages(Math.max(1, res.totalPages));
    setTotalElements(res.totalElements);
    setLoading(false);
  }, [session, page, pageSize, filters]);

  useEffect(() => {
    load();
  }, [load]);
  useLiveRefresh(["SALES_CHANGED"], load);

  if (!session) return null;
  const canVoid = session.role === "SUPER_ADMIN" || session.role === "COORDINATOR";
  const active = Object.values(filters).some(Boolean);

  const setFilter = (patch: Partial<Filters>) => {
    setPage(0);
    setFilters((f) => ({ ...f, ...patch }));
  };
  const preset = (days: number) => {
    const today = startOfDay(new Date());
    setFilter({ from: dayKey(addDays(today, -(days - 1))), to: dayKey(today) });
  };

  const handleVoid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidTarget) return;
    await api.voidTransaction(session.token, voidTarget.id, voidReason);
    setVoidTarget(null);
    setVoidReason("");
    load();
  };

  return (
    <>
      <PageHeader
        title={t("reports.sales.title")}
        subtitle={t(active ? "reports.sales.subtitleFiltered" : "reports.sales.subtitleSynced", { count: totalElements })}
        actions={<RefreshButton onRefresh={load} />}
      />

      <div className="card flex flex-wrap items-end gap-3 p-4">
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
        <div className="min-w-[160px] flex-1">
          <label className="field-label">{t("reports.col.cashier")}</label>
          <select value={filters.cashierUserId} onChange={(e) => setFilter({ cashierUserId: e.target.value })} className="field">
            <option value="">{t("reports.filter.allCashiers")}</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName}
                {u.active ? "" : ` ${t("reports.sales.deactivated")}`}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[180px] flex-1">
          <label className="field-label">{t("reports.filter.ticketType")}</label>
          <select value={filters.ticketTypeId} onChange={(e) => setFilter({ ticketTypeId: e.target.value })} className="field">
            <option value="">{t("reports.filter.allTickets")}</option>
            {ticketTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
                {type.gateId ? ` — ${gateName(type.gateId)}` : ""}
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
          <button onClick={() => preset(30)} className="btn-outline px-3 text-xs">
            {t("common.days30")}
          </button>
        </div>
        {active && (
          <button onClick={() => setFilter(NO_FILTERS)} className="btn-outline px-3 text-xs text-destructive">
            <FilterX className="h-4 w-4" /> {t("common.clearFilters")}
          </button>
        )}
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <Loading />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40">
                <tr>
                  <th className="th">{t("reports.col.reference")}</th>
                  <th className="th">{t("reports.col.date")}</th>
                  <th className="th">{t("reports.col.gate")}</th>
                  <th className="th">{t("reports.col.cashier")}</th>
                  <th className="th">{t("reports.col.tickets")}</th>
                  <th className="th">{t("reports.col.payment")}</th>
                  <th className="th text-right">{t("reports.col.amount")}</th>
                  <th className="th">{t("reports.col.status")}</th>
                  {canVoid && <th className="th" />}
                </tr>
              </thead>
              <tbody>
                {transactions.length === 0 && (
                  <tr>
                    <td colSpan={9} className="td text-center text-muted-foreground">
                      {active ? t("reports.sales.noMatch") : t("reports.sales.none")}
                    </td>
                  </tr>
                )}
                {transactions.map((tx) => (
                  <tr key={tx.id} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                    <td className="td font-mono text-xs font-semibold">#{tx.referenceNumber}</td>
                    <td className="td text-muted-foreground">{formatDateTime(tx.createdAtClient)}</td>
                    <td className="td">{gateName(tx.gateId)}</td>
                    <td className="td">{userName(tx.cashierUserId)}</td>
                    <td className="td whitespace-normal">
                      <TicketLines lines={tx.lines} ticketType={ticketType} />
                    </td>
                    <td className="td">{PAYMENT_LABELS[tx.paymentMethod]}</td>
                    <td className="td text-right font-semibold">{formatMoney(tx.totalAmount, tx.currency)}</td>
                    <td className="td">
                      {tx.status === "VOIDED" ? (
                        <span title={tx.voidReason ?? undefined}>
                          <Pill tone="danger">{t("reports.status.voided")}</Pill>
                        </span>
                      ) : (
                        <Pill tone="success">{t("reports.status.paid")}</Pill>
                      )}
                    </td>
                    {canVoid && (
                      <td className="td text-right">
                        {tx.status !== "VOIDED" && (
                          <button onClick={() => setVoidTarget(tx)} className="btn-outline px-2.5 py-1 text-xs text-destructive">
                            {t("reports.sales.void")}
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
          unit={t("reports.unit.sales")}
        />
      </div>

      {voidTarget && (
        <Modal title={t("reports.sales.voidTitle", { ref: voidTarget.referenceNumber })} onClose={() => setVoidTarget(null)}>
          <form onSubmit={handleVoid} className="space-y-4">
            <p className="text-sm text-muted-foreground">{t("reports.sales.voidWarning")}</p>
            <div>
              <label className="field-label">{t("reports.sales.reason")}</label>
              <input
                required
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                className="field"
                placeholder={t("reports.sales.reasonPlaceholder")}
              />
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setVoidTarget(null)} className="btn-outline flex-1">
                {t("common.back")}
              </button>
              <button type="submit" className="btn flex-1 bg-destructive text-white">
                {t("reports.sales.confirmVoid")}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
