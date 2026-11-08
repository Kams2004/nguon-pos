import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MapPin, MonitorSmartphone, Receipt as ReceiptIcon, ShoppingBag, Wallet } from "lucide-react";
import { useLiveEvents, useLiveRefresh, useSession } from "../../context/SessionContext";
import { api } from "../../lib/api/client";
import type { AdminGate, TerminalStatus, TransactionSummary } from "../../lib/api/types";
import { ALL_TRANSACTIONS_PAGE_SIZE, computeStats, hourlyProgression } from "../../lib/stats";
import { PAYMENT_LABELS, addDays, formatMoney, formatTime, hh, startOfDay } from "../../lib/format";
import { CardHeader, Delta, Loading, PageHeader, Pill, RefreshButton, StatCard } from "../../components/ui";
import { DonutChart, ProgressionChart, RevenueLineChart } from "../../components/charts";
import { PAYMENT_COLORS } from "../../lib/chartColors";
import { TerminalBreakdown } from "../../components/TerminalBreakdown";
import { TicketLines } from "../../components/TicketLines";
import { useCatalog } from "../../lib/useCatalog";
import { locale, useI18n } from "../../i18n";

const PERIODS = [
  { value: "today", labelKey: "common.today", days: 1 },
  { value: "7d", labelKey: "reports.dashboard.last7", days: 7 },
  { value: "30d", labelKey: "reports.dashboard.last30", days: 30 },
] as const;
type Period = (typeof PERIODS)[number]["value"];

export default function Dashboard() {
  const { session } = useSession();
  const { t, lang } = useI18n();
  const [transactions, setTransactions] = useState<TransactionSummary[] | null>(null);
  const [terminals, setTerminals] = useState<TerminalStatus[]>([]);
  const [gates, setGates] = useState<AdminGate[]>([]);
  const [period, setPeriod] = useState<Period>("today");
  const { ticketType } = useCatalog();

  const load = useCallback(async () => {
    if (!session) return;
    await Promise.all([
      api.listTransactions(session.token, 0, ALL_TRANSACTIONS_PAGE_SIZE).then((r) => setTransactions(r.content)),
      api
        .syncStatus(session.token)
        .then(setTerminals)
        .catch(() => setTerminals([])),
      // Gate names are SUPER_ADMIN-only on the backend; a coordinator just sees codes.
      api
        .listGates(session.token)
        .then(setGates)
        .catch(() => setGates([])),
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
    // Day labels and payment names are built here: rebuild them on a language switch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, days, lang]);

  if (!session) return null;
  if (!transactions) return <Loading />;

  const firstName = session.fullName.split(" ")[0];
  const compareLabel = period === "today" ? t("reports.dashboard.vsYesterday") : t("reports.dashboard.vsPrevious");
  const online = terminals.filter((t) => t.online).length;
  const pending = terminals.reduce((s, t) => s + t.localPendingCount, 0);
  const gateName = (id: string) => gates.find((g) => g.id === id)?.name ?? id.slice(0, 8);
  const recent = transactions.slice(0, 6);
  const hourNow = new Date().getHours();
  const nowPoint = progression[hourNow];
  // Revenue earned within each hour today (difference of the cumulative curve).
  const busiest = progression.reduce(
    (best, p, h) => {
      const amount = (p.today ?? 0) - (h > 0 ? (progression[h - 1].today ?? 0) : 0);
      return p.today !== null && amount > best.amount ? { hour: h, amount } : best;
    },
    { hour: 0, amount: 0 },
  );

  return (
    <>
      <PageHeader
        title={t("reports.dashboard.greeting", { name: firstName })}
        subtitle={t("reports.dashboard.subtitle")}
        actions={
          <>
            <RefreshButton onRefresh={load} />
            <select value={period} onChange={(e) => setPeriod(e.target.value as Period)} className="field w-auto">
              {PERIODS.map((p) => (
                <option key={p.value} value={p.value}>
                  {t(p.labelKey)}
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
          label={t("reports.dashboard.totalSales")}
          value={formatMoney(current.revenue)}
          hint={<Delta current={current.revenue} previous={previous.revenue} suffix={compareLabel} />}
        />
        <StatCard
          icon={ReceiptIcon}
          tone="blue"
          label={t("reports.dashboard.transactions")}
          value={current.count.toLocaleString(locale())}
          hint={<Delta current={current.count} previous={previous.count} suffix={compareLabel} />}
        />
        <StatCard
          icon={ShoppingBag}
          tone="violet"
          label={t("reports.kpi.average")}
          value={formatMoney(current.average)}
          hint={current.voidedCount > 0 ? t("reports.dashboard.voids", { count: current.voidedCount }) : t("reports.dashboard.noVoids")}
        />
        <StatCard
          icon={MonitorSmartphone}
          tone="gold"
          label={t("reports.dashboard.tillsOnline")}
          value={`${online} / ${terminals.length}`}
          hint={pending > 0 ? t("reports.dashboard.pendingOps", { count: pending }) : t("reports.dashboard.allSynced")}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_440px]">
        <div className="card">
          <CardHeader
            title={t("reports.dashboard.progression")}
            action={
              <span className="text-xs">
                <Delta current={nowPoint.today ?? 0} previous={nowPoint.yesterday} suffix={t("reports.dashboard.vsYesterdaySameHour")} />
              </span>
            }
          />
          <div className="px-3">
            <ProgressionChart data={progression} />
          </div>
          <div className="grid grid-cols-3 gap-3 p-5 pt-3">
            <div className="rounded-xl bg-blue-50 px-3 py-2.5">
              <p className="text-[11px] font-semibold text-secondary">{t("reports.dashboard.todayAt", { h: hh(hourNow) })}</p>
              <p className="font-display text-lg font-bold text-foreground">{formatMoney(nowPoint.today ?? 0)}</p>
            </div>
            <div className="rounded-xl bg-muted/60 px-3 py-2.5">
              <p className="text-[11px] font-semibold text-muted-foreground">{t("reports.dashboard.yesterdayAt", { h: hh(hourNow) })}</p>
              <p className="font-display text-lg font-bold text-foreground">{formatMoney(nowPoint.yesterday)}</p>
            </div>
            <div className="rounded-xl bg-amber-50 px-3 py-2.5">
              <p className="text-[11px] font-semibold text-amber-700">{t("reports.dashboard.busiestHour")}</p>
              <p className="font-display text-lg font-bold text-foreground">
                {busiest.amount > 0 ? t("reports.dashboard.hourRange", { from: hh(busiest.hour), to: hh(busiest.hour + 1) }) : "—"}
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
              title={t("reports.dashboard.salesByTill", { period: t(PERIODS.find((p) => p.value === period)!.labelKey).toLowerCase() })}
              action={
                <Link to="/admin/sync-status" className="btn-outline px-3 py-1.5 text-xs">
                  {t("reports.dashboard.allTills")}
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
            title={t("reports.charts.salesPerDayFcfa")}
            action={
              <Link to="/admin/reports" className="btn-outline px-3 py-1.5 text-xs">
                {t("reports.dashboard.viewReports")}
              </Link>
            }
          />
          <div className="px-3 pb-3">
            <RevenueLineChart data={chart} />
          </div>
        </div>
        <div className="card">
          <CardHeader title={t("reports.dashboard.paymentBreakdown")} />
          <DonutChart
            rows={current.byPayment}
            colorOf={(key) => PAYMENT_COLORS[key as keyof typeof PAYMENT_COLORS] ?? "#475569"}
            centerLabel={t("reports.charts.fcfaCollected")}
          />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_440px]">
        <div className="card overflow-hidden">
          <CardHeader
            title={t("reports.dashboard.recent")}
            action={
              <Link to="/admin/sales" className="btn-outline px-3 py-1.5 text-xs">
                {t("common.seeAll")}
              </Link>
            }
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-y border-border bg-muted/40">
                <tr>
                  <th className="th">{t("reports.col.refShort")}</th>
                  <th className="th">{t("reports.col.time")}</th>
                  <th className="th">{t("reports.col.gate")}</th>
                  <th className="th">{t("reports.col.tickets")}</th>
                  <th className="th">{t("reports.col.payment")}</th>
                  <th className="th text-right">{t("reports.col.amount")}</th>
                  <th className="th">{t("reports.col.status")}</th>
                </tr>
              </thead>
              <tbody>
                {recent.length === 0 && (
                  <tr>
                    <td colSpan={7} className="td text-center text-muted-foreground">
                      {t("reports.dashboard.noSyncedSales")}
                    </td>
                  </tr>
                )}
                {recent.map((tx) => (
                  <tr key={tx.id} className="border-b border-border/60 last:border-0">
                    <td className="td font-mono text-xs font-semibold">#{tx.referenceNumber}</td>
                    <td className="td text-muted-foreground">{formatTime(tx.createdAtClient)}</td>
                    <td className="td">{gateName(tx.gateId)}</td>
                    <td className="td whitespace-normal">
                      <TicketLines lines={tx.lines} ticketType={ticketType} />
                    </td>
                    <td className="td">{PAYMENT_LABELS[tx.paymentMethod]}</td>
                    <td className="td text-right font-semibold">{formatMoney(tx.totalAmount, tx.currency)}</td>
                    <td className="td">
                      {tx.status === "VOIDED" ? (
                        <Pill tone="danger">{t("reports.status.voided")}</Pill>
                      ) : (
                        <Pill tone="success">{t("reports.status.paid")}</Pill>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card overflow-hidden">
          <CardHeader title={t("reports.dashboard.currentEvent")} />
          <div className="px-5 pb-5">
            <div className="relative h-36 overflow-hidden rounded-xl">
              <img src="/img/banners/palace.jpg" alt="" className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-royal-deep/80 to-transparent" />
              <p className="absolute bottom-3 left-3 font-display text-lg font-bold text-white">
                Nguon Festival {new Date().getFullYear()}
              </p>
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" /> {t("reports.dashboard.location")}
            </p>
            <Link to="/admin/sync-status" className="btn-gold mt-4 w-full">
              {t("reports.dashboard.viewTills")}
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
