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

// Everything one till has done: its live state, who sold on it, and every
// synced sale. Its offline, not-yet-synced sales show up here as soon as
// it reconnects (the page updates by itself).
export default function TerminalDetail() {
  const { terminalId } = useParams<{ terminalId: string }>();
  const { session } = useSession();
  const now = useNow();
  const [terminal, setTerminal] = useState<TerminalStatus | null | undefined>(undefined);
  const [transactions, setTransactions] = useState<TransactionSummary[] | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const { gateName, ticketType } = useCatalog();

  const load = useCallback(async () => {
    if (!session || !terminalId) return;
    const [all, tx] = await Promise.all([
      api.syncStatus(session.token),
      api.listTransactions(session.token, 0, 2000, { terminalId }),
    ]);
    setTerminal(all.find((t) => t.terminalId === terminalId) ?? null);
    setTransactions(tx.content);
  }, [session, terminalId]);

  useEffect(() => {
    load();
    if (!session) return;
    // Names only — SUPER_ADMIN-only on the backend, so a coordinator sees ids.
    api.listUsers(session.token).then(setUsers).catch(() => {});
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
          <ArrowLeft className="h-4 w-4" /> Retour aux caisses
        </Link>
      </div>
      <PageHeader
        title={terminal?.deviceLabel ?? "Caisse"}
        subtitle={
          terminal ? (
            <>
              {gateName(terminal.gateId)} · dernier signal {timeAgo(terminal.lastSeenAt, now)} · terminal{" "}
              <span className="font-mono">{terminal.terminalId.slice(0, 13)}</span>
            </>
          ) : (
            "Caisse inconnue"
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
            <Pill tone="warning">{terminal.localPendingCount} opération(s) pas encore synchronisée(s)</Pill>
          )}
        </div>
      )}

      <div className="stat-strip">
        <StatCard icon={Wallet} tone="green" label="Chiffre d'affaires" value={formatMoney(stats.revenue)} />
        <StatCard icon={ReceiptIcon} tone="blue" label="Ventes" value={String(stats.count)} />
        <StatCard icon={ShoppingBag} tone="violet" label="Panier moyen" value={formatMoney(stats.average)} />
        <StatCard icon={Ban} tone="gold" label="Annulations" value={String(stats.voided)} />
      </div>

      <div className="card overflow-hidden">
        <CardHeader title={`Transactions de cette caisse (${transactions?.length ?? 0})`} />
        {transactions === null ? (
          <Loading />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-y border-border bg-muted/40">
                <tr>
                  <th className="th">Référence</th>
                  <th className="th">Date</th>
                  <th className="th">Caissier</th>
                  <th className="th">Billets</th>
                  <th className="th">Paiement</th>
                  <th className="th text-right">Montant</th>
                  <th className="th">Statut</th>
                </tr>
              </thead>
              <tbody>
                {transactions.length === 0 && (
                  <tr>
                    <td colSpan={7} className="td text-center text-muted-foreground">
                      Aucune vente synchronisée depuis cette caisse.
                    </td>
                  </tr>
                )}
                {paged.pageItems.map((t) => (
                  <tr key={t.id} className="border-b border-border/60 last:border-0">
                    <td className="td font-mono text-xs font-semibold">#{t.referenceNumber}</td>
                    <td className="td text-muted-foreground">{formatDateTime(t.createdAtClient)}</td>
                    <td className="td">{userName(t.cashierUserId)}</td>
                    <td className="td whitespace-normal">
                      <TicketLines lines={t.lines} ticketType={ticketType} />
                    </td>
                    <td className="td">{PAYMENT_LABELS[t.paymentMethod]}</td>
                    <td className="td text-right font-semibold">{formatMoney(t.totalAmount, t.currency)}</td>
                    <td className="td">
                      {t.status === "VOIDED" ? (
                        <span title={t.voidReason ?? undefined}>
                          <Pill tone="danger">Annulée</Pill>
                        </span>
                      ) : (
                        <Pill tone="success">Payé</Pill>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {transactions && (
          <Pagination page={paged.page} pages={paged.pages} total={paged.total} size={paged.size} onPage={paged.setPage} onSize={paged.setSize} unit="ventes" />
        )}
      </div>
    </>
  );
}
