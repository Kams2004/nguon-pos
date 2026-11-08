import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MapPin, MonitorSmartphone, Receipt as ReceiptIcon, ShoppingBag, Wallet } from "lucide-react";
import { useLiveEvents, useLiveRefresh, useSession } from "../../context/SessionContext";
import { api } from "../../lib/api/client";
import type { AdminGate, TerminalStatus, TransactionSummary } from "../../lib/api/types";
import { ALL_TRANSACTIONS_PAGE_SIZE, computeStats, hourlyProgression } from "../../lib/stats";
import { PAYMENT_LABELS, addDays, formatMoney, formatTime, startOfDay } from "../../lib/format";
import { CardHeader, Delta, Loading, PageHeader, Pill, RefreshButton, StatCard } from "../../components/ui";
import { DonutChart, ProgressionChart, RevenueLineChart } from "../../components/charts";
import { PAYMENT_COLORS } from "../../lib/chartColors";
import { TerminalBreakdown } from "../../components/TerminalBreakdown";
import { TicketLines } from "../../components/TicketLines";
import { useCatalog } from "../../lib/useCatalog";

const PERIODS = [
  { value: "today", label: "Aujourd'hui", days: 1 },
  { value: "7d", label: "7 derniers jours", days: 7 },
  { value: "30d", label: "30 derniers jours", days: 30 },
] as const;
type Period = (typeof PERIODS)[number]["value"];

export default function Dashboard() {
  const { session } = useSession();
  const [transactions, setTransactions] = useState<TransactionSummary[] | null>(null);
  const [terminals, setTerminals] = useState<TerminalStatus[]>([]);
  const [gates, setGates] = useState<AdminGate[]>([]);
  const [period, setPeriod] = useState<Period>("today");
  const { ticketType } = useCatalog();

  const load = useCallback(async () => {
    if (!session) return;
    await Promise.all([
      api.listTransactions(session.token, 0, ALL_TRANSACTIONS_PAGE_SIZE).then((r) => setTransactions(r.content)),
      api.syncStatus(session.token).then(setTerminals).catch(() => setTerminals([])),
      // Gate names are SUPER_ADMIN-only on the backend; a coordinator just sees codes.
      api.listGates(session.token).then(setGates).catch(() => setGates([])),
    ]);
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);
  // New sales/voids refetch; a till going on/offline is patched in place.
  useLiveRefresh(["SALES_CHANGED", "CATALOG_CHANGED"], load);
  useLiveEvents(["TERMINAL_STATUS"], (e) => {
    const status = e.data as TerminalStatus;
    setTerminals((prev) =>
      prev.some((t) => t.terminalId === status.terminalId)
        ? prev.map((t) => (t.terminalId === status.terminalId ? status : t))
        : [...prev, status],
    );
  });

  const days = PERIODS.find((p) => p.value === period)!.days;
  const { current, previous, chart, progression } = useMemo(() => {
    const tx = transactions ?? [];
    const end = addDays(startOfDay(new Date()), 1);
    const start = addDays(end, -days);
    return {
      current: computeStats(tx, start, end),
      previous: computeStats(tx, addDays(start, -days), start),
      // The trend line always spans at least a week, so "today" still has context.
      chart: computeStats(tx, addDays(end, -Math.max(days, 7)), end).byDay,
      progression: hourlyProgression(tx),
    };
  }, [transactions, days]);

  if (!session) return null;
  if (!transactions) return <Loading />;

  const firstName = session.fullName.split(" ")[0];
  const compareLabel = period === "today" ? "par rapport à hier" : "vs période précédente";
  const online = terminals.filter((t) => t.online).length;
  const pending = terminals.reduce((s, t) => s + t.localPendingCount, 0);
  const gateName = (id: string) => gates.find((g) => g.id === id)?.name ?? id.slice(0, 8);
  const recent = transactions.slice(0, 6);
  const hourNow = new Date().getHours();
  const nowPoint = progression[hourNow];
  // Revenue earned within each hour today (difference of the cumulative curve).
  const busiest = progression.reduce(
    (best, p, h) => {
      const amount = (p.today ?? 0) - (h > 0 ? progression[h - 1].today ?? 0 : 0);
      return p.today !== null && amount > best.amount ? { hour: h, amount } : best;
    },
    { hour: 0, amount: 0 },
  );

  return (
    <>
      <PageHeader
        title={`Bonjour ${firstName} !`}
        subtitle="Voici un aperçu des activités du NGUON."
        actions={
          <>
            <RefreshButton onRefresh={load} />
            <select value={period} onChange={(e) => setPeriod(e.target.value as Period)} className="field w-auto">
              {PERIODS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </>
        }
      />

      <div className="stat-strip">
        <StatCard
          icon={Wallet}
          tone="green"
          label="Ventes totales"
          value={formatMoney(current.revenue)}
          hint={<Delta current={current.revenue} previous={previous.revenue} suffix={compareLabel} />}
        />
        <StatCard
          icon={ReceiptIcon}
          tone="blue"
          label="Transactions"
          value={current.count.toLocaleString("fr-FR")}
          hint={<Delta current={current.count} previous={previous.count} suffix={compareLabel} />}
        />
        <StatCard
          icon={ShoppingBag}
          tone="violet"
          label="Panier moyen"
          value={formatMoney(current.average)}
          hint={current.voidedCount > 0 ? `${current.voidedCount} annulation${current.voidedCount > 1 ? "s" : ""}` : "Aucune annulation"}
        />
        <StatCard
          icon={MonitorSmartphone}
          tone="gold"
          label="Caisses en ligne"
          value={`${online} / ${terminals.length}`}
          hint={pending > 0 ? `${pending} opération${pending > 1 ? "s" : ""} en attente` : "Tout est synchronisé"}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_440px]">
        <div className="card">
          <CardHeader
            title="Progression de la journée (cumul FCFA)"
            action={
              <span className="text-xs">
                <Delta current={nowPoint.today ?? 0} previous={nowPoint.yesterday} suffix="vs hier à la même heure" />
              </span>
            }
          />
          <div className="px-3">
            <ProgressionChart data={progression} />
          </div>
          <div className="grid grid-cols-3 gap-3 p-5 pt-3">
            <div className="rounded-xl bg-blue-50 px-3 py-2.5">
              <p className="text-[11px] font-semibold text-secondary">Aujourd'hui à {hourNow}h</p>
              <p className="font-display text-lg font-bold text-foreground">{formatMoney(nowPoint.today ?? 0)}</p>
            </div>
            <div className="rounded-xl bg-muted/60 px-3 py-2.5">
              <p className="text-[11px] font-semibold text-muted-foreground">Hier à {hourNow}h</p>
              <p className="font-display text-lg font-bold text-foreground">{formatMoney(nowPoint.yesterday)}</p>
            </div>
            <div className="rounded-xl bg-amber-50 px-3 py-2.5">
              <p className="text-[11px] font-semibold text-amber-700">Heure la plus active</p>
              <p className="font-display text-lg font-bold text-foreground">
                {busiest.amount > 0 ? `${busiest.hour}h–${busiest.hour + 1}h` : "—"}
              </p>
              {busiest.amount > 0 && <p className="text-[11px] text-muted-foreground">{formatMoney(busiest.amount)}</p>}
            </div>
          </div>
        </div>
        <div className="card relative flex min-h-[320px] flex-col overflow-hidden">
          {/* Absolutely filled on wide screens: the row takes the progression
              card's height and this list scrolls, instead of stretching the
              row and leaving a gap under the chart. */}
          <div className="flex min-h-0 flex-1 flex-col xl:absolute xl:inset-0">
          <CardHeader
            title={`Ventes par caisse — ${PERIODS.find((p) => p.value === period)!.label.toLowerCase()}`}
            action={
              <Link to="/admin/sync-status" className="btn-outline px-3 py-1.5 text-xs">
                Toutes les caisses
              </Link>
            }
          />
          <div className="min-h-0 flex-1 overflow-y-auto">
            <TerminalBreakdown rows={current.byTerminal} terminals={terminals} gateName={gateName} />
          </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_440px]">
        <div className="card">
          <CardHeader
            title="Ventes par jour (FCFA)"
            action={
              <Link to="/admin/reports" className="btn-outline px-3 py-1.5 text-xs">
                Voir les rapports
              </Link>
            }
          />
          <div className="px-3 pb-3">
            <RevenueLineChart data={chart} />
          </div>
        </div>
        <div className="card">
          <CardHeader title="Répartition par moyen de paiement" />
          <DonutChart
            rows={current.byPayment}
            colorOf={(key) => PAYMENT_COLORS[key as keyof typeof PAYMENT_COLORS] ?? "#475569"}
            centerLabel="FCFA encaissés"
          />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_440px]">
        <div className="card overflow-hidden">
          <CardHeader
            title="Transactions récentes"
            action={
              <Link to="/admin/sales" className="btn-outline px-3 py-1.5 text-xs">
                Voir tout
              </Link>
            }
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-y border-border bg-muted/40">
                <tr>
                  <th className="th">Réf.</th>
                  <th className="th">Heure</th>
                  <th className="th">Porte</th>
                  <th className="th">Billets</th>
                  <th className="th">Paiement</th>
                  <th className="th text-right">Montant</th>
                  <th className="th">Statut</th>
                </tr>
              </thead>
              <tbody>
                {recent.length === 0 && (
                  <tr>
                    <td colSpan={7} className="td text-center text-muted-foreground">
                      Aucune vente synchronisée pour le moment.
                    </td>
                  </tr>
                )}
                {recent.map((t) => (
                  <tr key={t.id} className="border-b border-border/60 last:border-0">
                    <td className="td font-mono text-xs font-semibold">#{t.referenceNumber}</td>
                    <td className="td text-muted-foreground">{formatTime(t.createdAtClient)}</td>
                    <td className="td">{gateName(t.gateId)}</td>
                    <td className="td whitespace-normal">
                      <TicketLines lines={t.lines} ticketType={ticketType} />
                    </td>
                    <td className="td">{PAYMENT_LABELS[t.paymentMethod]}</td>
                    <td className="td text-right font-semibold">{formatMoney(t.totalAmount, t.currency)}</td>
                    <td className="td">
                      {t.status === "VOIDED" ? <Pill tone="danger">Annulée</Pill> : <Pill tone="success">Payé</Pill>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card overflow-hidden">
          <CardHeader title="Événement en cours" />
          <div className="px-5 pb-5">
            <div className="relative h-36 overflow-hidden rounded-xl">
              <img src="/img/banners/palace.jpg" alt="" className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-royal-deep/80 to-transparent" />
              <p className="absolute bottom-3 left-3 font-display text-lg font-bold text-white">
                Nguon Festival {new Date().getFullYear()}
              </p>
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" /> Foumban, Cameroun
            </p>
            <Link to="/admin/sync-status" className="btn-gold mt-4 w-full">
              Voir l'état des caisses
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
