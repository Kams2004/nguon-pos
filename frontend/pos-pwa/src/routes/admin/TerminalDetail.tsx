import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Ban, Receipt as ReceiptIcon, ShoppingBag, Wallet } from "lucide-react";
import { useLiveEvents, useLiveRefresh, useSession } from "../../context/SessionContext";
import { api } from "../../lib/api/client";
import type { AdminUser, TerminalStatus, TransactionSummary } from "../../lib/api/types";
import { useCatalog } from "../../lib/useCatalog";
import { TicketLines } from "../../components/TicketLines";
import { PAYMENT_LABELS, formatDateTime, formatMoney } from "../../lib/format";
import { timeAgo, useNow } from "../../lib/useNow";
import { Pagination, usePaged } from "../../components/Pagination";
import { CardHeader, Loading, PageHeader, Pill, RefreshButton, StatCard } from "../../components/ui";
import { TerminalState } from "../../components/TerminalState";
import { useI18n } from "../../i18n";

// Everything one till has done: its live state, who sold on it, and every
// synced sale. Its offline, not-yet-synced sales show up here as soon as
// it reconnects (the page updates by itself).
export default function TerminalDetail() {
  const { terminalId } = useParams<{ terminalId: string }>();
  const { session } = useSession();
  const { t } = useI18n();
  const now = useNow();
  const [terminal, setTerminal] = useState<TerminalStatus | null | undefined>(undefined);
  const [transactions, setTransactions] = useState<TransactionSummary[] | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const { gateName, ticketType } = useCatalog();

  const load = useCallback(async () => {
    if (!session || !terminalId) return;
    const [all, tx] = await Promise.all([api.syncStatus(session.token), api.listTransactions(session.token, 0, 2000, { terminalId })]);
    setTerminal(all.find((t) => t.terminalId === terminalId) ?? null);
    setTransactions(tx.content);
  }, [session, terminalId]);

  useEffect(() => {
    load();
    if (!session) return;
    // Names only — SUPER_ADMIN-only on the backend, so a coordinator sees ids.
    api
      .listUsers(session.token)
      .then(setUsers)
      .catch(() => {});
  }, [load, session]);

  useLiveEvents(["TERMINAL_STATUS"], (e) => {
    const status = e.data as TerminalStatus;
    if (status.terminalId === terminalId) setTerminal(status);
  });
  useLiveRefresh(["SALES_CHANGED"], load);

  const stats = useMemo(() => {
    const done = (transactions ?? []).filter((t) => t.status === "COMPLETED");
    const revenue = done.reduce((s, t) => s + t.totalAmount, 0);
    return {
      revenue,
      count: done.length,
      average: done.length ? revenue / done.length : 0,
      voided: (transactions ?? []).length - done.length,
    };
  }, [transactions]);

  const paged = usePaged(transactions ?? [], 25);

  if (!session) return null;
  if (terminal === undefined) return <Loading />;

  const userName = (id: string) => users.find((u) => u.id === id)?.fullName ?? id.slice(0, 8);

  return (
    <>
      <div>
        <Link to="/admin/sync-status" className="btn-outline no-print">
          <ArrowLeft className="h-4 w-4" /> {t("reports.terminalDetail.back")}
        </Link>
      </div>
      <PageHeader
        title={terminal?.deviceLabel ?? t("reports.till")}
        subtitle={
          terminal ? (
            <>
              {t("reports.terminalDetail.subtitle", { gate: gateName(terminal.gateId), ago: timeAgo(terminal.lastSeenAt, now) })}{" "}
              <span className="font-mono">{terminal.terminalId.slice(0, 13)}</span>
            </>
          ) : (
            t("reports.terminalDetail.unknown")
          )
        }
        actions={
          <>
            <RefreshButton onRefresh={load} />
          </>
        }
      />
      {terminal && (
        <div className="card flex flex-wrap items-center gap-4 p-4">
          <TerminalState t={terminal} />
          {terminal.localPendingCount > 0 && (
            <Pill tone="warning">{t("reports.terminalDetail.notSynced", { n: terminal.localPendingCount })}</Pill>
          )}
        </div>
      )}

      <div className="stat-strip">
        <StatCard icon={Wallet} tone="green" label={t("reports.kpi.revenue")} value={formatMoney(stats.revenue)} />
        <StatCard icon={ReceiptIcon} tone="blue" label={t("reports.kpi.sales")} value={String(stats.count)} />
        <StatCard icon={ShoppingBag} tone="violet" label={t("reports.kpi.average")} value={formatMoney(stats.average)} />
        <StatCard icon={Ban} tone="gold" label={t("reports.kpi.voids")} value={String(stats.voided)} />
      </div>

      <div className="card overflow-hidden">
        <CardHeader title={t("reports.terminalDetail.transactions", { n: transactions?.length ?? 0 })} />
        {transactions === null ? (
          <Loading />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-y border-border bg-muted/40">
                <tr>
                  <th className="th">{t("reports.col.reference")}</th>
                  <th className="th">{t("reports.col.date")}</th>
                  <th className="th">{t("reports.col.cashier")}</th>
                  <th className="th">{t("reports.col.tickets")}</th>
                  <th className="th">{t("reports.col.payment")}</th>
                  <th className="th text-right">{t("reports.col.amount")}</th>
                  <th className="th">{t("reports.col.status")}</th>
                </tr>
              </thead>
              <tbody>
                {transactions.length === 0 && (
                  <tr>
                    <td colSpan={7} className="td text-center text-muted-foreground">
                      {t("reports.terminalDetail.noSales")}
                    </td>
                  </tr>
                )}
                {paged.pageItems.map((tx) => (
                  <tr key={tx.id} className="border-b border-border/60 last:border-0">
                    <td className="td font-mono text-xs font-semibold">#{tx.referenceNumber}</td>
                    <td className="td text-muted-foreground">{formatDateTime(tx.createdAtClient)}</td>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {transactions && (
          <Pagination
            page={paged.page}
            pages={paged.pages}
            total={paged.total}
            size={paged.size}
            onPage={paged.setPage}
            onSize={paged.setSize}
            unit={t("reports.unit.sales")}
          />
        )}
      </div>
    </>
  );
}
