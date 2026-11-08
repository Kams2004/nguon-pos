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


type Filters = { gateId: string; cashierUserId: string; ticketTypeId: string; from: string; to: string };
const NO_FILTERS: Filters = { gateId: "", cashierUserId: "", ticketTypeId: "", from: "", to: "" };

function parseDay(v: string): Date {
  const [y, m, d] = v.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export default function Sales() {
  const { session } = useSession();
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
        title="Ventes"
        subtitle={`${totalElements.toLocaleString("fr-FR")} vente${totalElements > 1 ? "s" : ""}${active ? " correspondant aux filtres" : " synchronisées"} — les nouvelles apparaissent automatiquement`}
        actions={<RefreshButton onRefresh={load} />}
      />

      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[160px] flex-1">
          <label className="field-label">Porte</label>
          <select value={filters.gateId} onChange={(e) => setFilter({ gateId: e.target.value })} className="field">
            <option value="">Toutes les portes</option>
            {gates.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[160px] flex-1">
          <label className="field-label">Caissier</label>
          <select value={filters.cashierUserId} onChange={(e) => setFilter({ cashierUserId: e.target.value })} className="field">
            <option value="">Tous les caissiers</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName}
                {u.active ? "" : " (désactivé)"}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[180px] flex-1">
          <label className="field-label">Type de billet</label>
          <select value={filters.ticketTypeId} onChange={(e) => setFilter({ ticketTypeId: e.target.value })} className="field">
            <option value="">Tous les billets</option>
            {ticketTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.gateId ? ` — ${gateName(t.gateId)}` : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label">Du</label>
          <input type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => setFilter({ from: e.target.value })} className="field" />
        </div>
        <div>
          <label className="field-label">Au</label>
          <input type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => setFilter({ to: e.target.value })} className="field" />
        </div>
        <div className="flex gap-2">
          <button onClick={() => preset(1)} className="btn-outline px-3 text-xs">
            Aujourd'hui
          </button>
          <button onClick={() => preset(7)} className="btn-outline px-3 text-xs">
            7 jours
          </button>
          <button onClick={() => preset(30)} className="btn-outline px-3 text-xs">
            30 jours
          </button>
        </div>
        {active && (
          <button onClick={() => setFilter(NO_FILTERS)} className="btn-outline px-3 text-xs text-destructive">
            <FilterX className="h-4 w-4" /> Effacer les filtres
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
                  <th className="th">Référence</th>
                  <th className="th">Date</th>
                  <th className="th">Porte</th>
                  <th className="th">Caissier</th>
                  <th className="th">Billets</th>
                  <th className="th">Paiement</th>
                  <th className="th text-right">Montant</th>
                  <th className="th">Statut</th>
                  {canVoid && <th className="th" />}
                </tr>
              </thead>
              <tbody>
                {transactions.length === 0 && (
                  <tr>
                    <td colSpan={9} className="td text-center text-muted-foreground">
                      {active ? "Aucune vente ne correspond à ces filtres." : "Aucune vente."}
                    </td>
                  </tr>
                )}
                {transactions.map((t) => (
                  <tr key={t.id} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                    <td className="td font-mono text-xs font-semibold">#{t.referenceNumber}</td>
                    <td className="td text-muted-foreground">{formatDateTime(t.createdAtClient)}</td>
                    <td className="td">{gateName(t.gateId)}</td>
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
                    {canVoid && (
                      <td className="td text-right">
                        {t.status !== "VOIDED" && (
                          <button onClick={() => setVoidTarget(t)} className="btn-outline px-2.5 py-1 text-xs text-destructive">
                            Annuler
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
          unit="ventes"
        />
      </div>

      {voidTarget && (
        <Modal title={`Annuler la vente #${voidTarget.referenceNumber}`} onClose={() => setVoidTarget(null)}>
          <form onSubmit={handleVoid} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Cette action est tracée et irréversible. La vente reste visible dans l'historique avec son motif, votre nom et
              l'heure d'annulation.
            </p>
            <div>
              <label className="field-label">Motif</label>
              <input
                required
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                className="field"
                placeholder="Erreur de saisie, remboursement…"
              />
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setVoidTarget(null)} className="btn-outline flex-1">
                Retour
              </button>
              <button type="submit" className="btn flex-1 bg-destructive text-white">
                Confirmer l'annulation
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
