import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, Download, Printer, Receipt as ReceiptIcon, ShoppingBag, Wallet } from "lucide-react";
import { useLiveRefresh, useSession } from "../../context/SessionContext";
import { api } from "../../lib/api/client";
import type { AdminGate, TerminalStatus, TransactionSummary } from "../../lib/api/types";
import { ALL_TRANSACTIONS_PAGE_SIZE, amountHistogram, computeStats, hourHistogram } from "../../lib/stats";
import { PAYMENT_LABELS, addDays, dayKey, formatDateTime, formatMoney, startOfDay } from "../../lib/format";
import { Pagination, usePaged } from "../../components/Pagination";
import { CardHeader, PageHeader, PageSkeleton, RefreshButton, StatCard } from "../../components/ui";
import { useBranding } from "../../context/BrandingContext";
import { ReportPrint } from "../../components/ReportPrint";
import { PAYMENT_COLORS, seriesColor } from "../../lib/chartColors";
import { TICKET_COLOR_HEX } from "../../lib/ticketIcons";
import { BreakdownList, DonutChart, Histogram, RevenueBarChart } from "../../components/charts";
import { TerminalBreakdown } from "../../components/TerminalBreakdown";
import { TicketLines } from "../../components/TicketLines";
import { useCatalog } from "../../lib/useCatalog";
import { locale, useI18n } from "../../i18n";

type Kind = "daily" | "weekly" | "monthly" | "custom";
const KINDS: Kind[] = ["daily", "weekly", "monthly", "custom"];

function parseDay(v: string): Date {
  const [y, m, d] = v.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Resolves the chosen report kind to a [from, to) range of local days. */
function rangeFor(kind: Kind, day: string, month: string, from: string, to: string): [Date, Date] {
  switch (kind) {
    case "daily":
      return [parseDay(day), addDays(parseDay(day), 1)];
    case "weekly":
      // The seven days ending on (and including) the chosen day.
      return [addDays(parseDay(day), -6), addDays(parseDay(day), 1)];
    case "monthly": {
      const [y, m] = month.split("-").map(Number);
      return [new Date(y, m - 1, 1), new Date(y, m, 1)];
    }
    case "custom":
      return [parseDay(from), addDays(parseDay(to), 1)];
  }
}

export default function Reports() {
  const { session } = useSession();
  const { t, lang } = useI18n();
  const [transactions, setTransactions] = useState<TransactionSummary[] | null>(null);
  const [gates, setGates] = useState<AdminGate[]>([]);
  const [terminals, setTerminals] = useState<TerminalStatus[]>([]);
  const today = dayKey(new Date());
  const [kind, setKind] = useState<Kind>("daily");
  const [day, setDay] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [from, setFrom] = useState(dayKey(addDays(startOfDay(new Date()), -6)));
  const [to, setTo] = useState(today);
  const [gateId, setGateId] = useState("");
  const [ticketTypeId, setTicketTypeId] = useState("");
  const [cashierUserId, setCashierUserId] = useState("");
  const [allCashiers, setAllCashiers] = useState(false);
  const { ticketTypes, ticketType, users, userName } = useCatalog();
  const { logoUrl, name: establishmentName } = useBranding();

  const load = useCallback(async () => {
    if (!session) return;
    await Promise.all([
      api.listTransactions(session.token, 0, ALL_TRANSACTIONS_PAGE_SIZE).then((r) => setTransactions(r.content)),
      api
        .listGates(session.token)
        .then(setGates)
        .catch(() => setGates([])),
      api
        .syncStatus(session.token)
        .then(setTerminals)
        .catch(() => setTerminals([])),
    ]);
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);
  useLiveRefresh(["SALES_CHANGED"], load);

  const [start, end] = rangeFor(kind, day, month, from, to);
  // Ticket-type filter = sales that contain at least one ticket of that type.
  const scoped = useMemo(
    () => (transactions ?? []).filter((t) => !ticketTypeId || t.lines.some((l) => l.ticketTypeId === ticketTypeId)),
    [transactions, ticketTypeId],
  );
  const stats = useMemo(
    () => computeStats(scoped, start, end, gateId || undefined, cashierUserId || undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scoped, start.getTime(), end.getTime(), gateId, cashierUserId, lang],
  );
  const rows = useMemo(
    () =>
      scoped.filter((t) => {
        const d = new Date(t.createdAtClient);
        return d >= start && d < end && (!gateId || t.gateId === gateId) && (!cashierUserId || t.cashierUserId === cashierUserId);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scoped, start.getTime(), end.getTime(), gateId, cashierUserId],
  );
  // Revenue and tickets per ticket type, from the sale lines (completed sales only).
  const byTicketType = useMemo(() => {
    const m = new Map<string, { value: number; count: number }>();
    for (const t of rows) {
      if (t.status !== "COMPLETED") continue;
      for (const l of t.lines) {
        const e = m.get(l.ticketTypeId) ?? { value: 0, count: 0 };
        e.value += l.unitPrice * l.quantity;
        e.count += l.quantity;
        m.set(l.ticketTypeId, e);
      }
    }
    return [...m.entries()]
      .map(([key, v]) => ({ key, label: ticketType(key)?.name ?? t("reports.ticket"), ...v }))
      .sort((a, b) => b.value - a.value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, ticketTypes, lang]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const hours = useMemo(() => hourHistogram(rows), [rows, lang]);
  const amounts = useMemo(() => amountHistogram(rows), [rows]);
  const paged = usePaged(rows, 25, `${start.getTime()}|${end.getTime()}|${gateId}|${cashierUserId}|${ticketTypeId}`);

  if (!session) return null;
  if (!transactions) return <PageSkeleton stats={4} rows={8} />;

  const gateName = (id: string) => gates.find((g) => g.id === id)?.name ?? id.slice(0, 8);
  const rangeLabel = `${start.toLocaleDateString(locale())} — ${addDays(end, -1).toLocaleDateString(locale())}`;

  const exportCsv = () => {
    const header = [
      t("reports.col.reference"),
      t("reports.col.date"),
      t("reports.col.gate"),
      t("reports.col.cashier"),
      t("reports.col.tickets"),
      t("reports.col.payment"),
      t("reports.col.amount"),
      t("reports.col.currency"),
      t("reports.col.status"),
      t("reports.col.voidReason"),
    ];
    const lines = rows.map((tx) =>
      [
        tx.referenceNumber,
        formatDateTime(tx.createdAtClient),
        gateName(tx.gateId),
        userName(tx.cashierUserId),
        tx.lines.map((l) => `${l.quantity} x ${ticketType(l.ticketTypeId)?.name ?? t("reports.ticket")}`).join(", "),
        PAYMENT_LABELS[tx.paymentMethod],
        tx.totalAmount,
        tx.currency,
        tx.status === "VOIDED" ? t("reports.status.voided") : t("reports.status.completed"),
        tx.voidReason ?? "",
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(";"),
    );
    // BOM + semicolons so Excel (French locale) opens it with accents and columns intact.
    const blob = new Blob(["﻿" + [header.join(";"), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = t("reports.reports.csvFile", { kind, date: dayKey(start) });
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const kindLabel = t(`reports.reports.kind.${kind}`);
  const filterLabels = [
    gateId ? t("reports.reports.filterGate", { name: gateName(gateId) }) : "",
    cashierUserId ? t("reports.reports.filterCashier", { name: userName(cashierUserId) }) : "",
    ticketTypeId ? t("reports.reports.filterTicket", { name: ticketType(ticketTypeId)?.name ?? "" }) : "",
  ].filter(Boolean);
  const terminalLabel = (id: string) =>
    terminals.find((term) => term.terminalId === id)?.deviceLabel ?? t("reports.tillFallback", { id: id.slice(0, 4).toUpperCase() });
  const gateIndex = (id: string) =>
    Math.max(
      0,
      gates.findIndex((g) => g.id === id),
    );
  const byGate = stats.byGate.map((g) => ({ ...g, label: gateName(g.key) }));
  const byCashier = stats.byCashier.map((c) => ({ ...c, label: userName(c.key) }));

  return (
    <>
      {/* A4 for reports (the till's thermal screens set their own @page) */}
      <style>{"@page { size: A4; margin: 12mm; }"}</style>
      <ReportPrint
        logoUrl={logoUrl}
        establishment={establishmentName}
        title={t("reports.reports.printTitle", { kind: kindLabel.toLowerCase() })}
        period={rangeLabel}
        filters={filterLabels}
        generatedBy={session.fullName}
        kpis={[
          { label: t("reports.kpi.revenue"), value: formatMoney(stats.revenue) },
          { label: t("reports.kpi.sales"), value: stats.count.toLocaleString(locale()) },
          { label: t("reports.kpi.average"), value: formatMoney(stats.average) },
          { label: t("reports.kpi.voids"), value: `${stats.voidedCount} (${formatMoney(stats.voidedAmount)})` },
        ]}
        byDay={stats.byDay}
        sections={[
          { title: t("reports.reports.byTicketType"), countLabel: t("reports.col.tickets"), rows: byTicketType },
          { title: t("reports.reports.byPayment"), countLabel: t("reports.kpi.sales"), rows: stats.byPayment },
          { title: t("reports.reports.byGate"), countLabel: t("reports.kpi.sales"), rows: byGate },
          {
            title: t("reports.reports.byTill"),
            countLabel: t("reports.kpi.sales"),
            rows: stats.byTerminal.map((term) => ({ ...term, label: terminalLabel(term.key) })),
          },
          { title: t("reports.reports.byCashier"), countLabel: t("reports.kpi.sales"), rows: byCashier },
        ]}
        detail={rows.map((tx) => ({
          reference: tx.referenceNumber,
          date: formatDateTime(tx.createdAtClient),
          gate: gateName(tx.gateId),
          cashier: userName(tx.cashierUserId),
          tickets: tx.lines.map((l) => `${l.quantity}× ${ticketType(l.ticketTypeId)?.name ?? t("reports.ticket")}`).join(", "),
          payment: PAYMENT_LABELS[tx.paymentMethod],
          amount: tx.totalAmount,
          voided: tx.status === "VOIDED",
        }))}
      />

      <div className="space-y-6 print:hidden">
        <PageHeader
          title={t("reports.reports.title")}
          subtitle={
            <>
              {kindLabel} · {rangeLabel}
              {filterLabels.map((f) => ` · ${f}`)}
            </>
          }
          actions={
            <>
              <RefreshButton onRefresh={load} />
              <button onClick={exportCsv} className="btn-outline">
                <Download className="h-4 w-4" /> {t("common.exportCsv")}
              </button>
              <button onClick={() => window.print()} className="btn-blue">
                <Printer className="h-4 w-4" /> {t("reports.reports.printReport")}
              </button>
            </>
          }
        />

        <div className="card no-print flex flex-wrap items-end gap-4 p-4">
          <div className="flex rounded-xl bg-muted p-1">
            {KINDS.map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  kind === k ? "bg-secondary text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t(`reports.reports.kind.${k}`)}
              </button>
            ))}
          </div>
          {(kind === "daily" || kind === "weekly") && (
            <div>
              <label className="field-label">{kind === "daily" ? t("reports.reports.day") : t("reports.reports.weekEnding")}</label>
              <input type="date" value={day} max={today} onChange={(e) => e.target.value && setDay(e.target.value)} className="field" />
            </div>
          )}
          {kind === "monthly" && (
            <div>
              <label className="field-label">{t("reports.reports.month")}</label>
              <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="field" />
            </div>
          )}
          {kind === "custom" && (
            <>
              <div>
                <label className="field-label">{t("common.from")}</label>
                <input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className="field" />
              </div>
              <div>
                <label className="field-label">{t("common.to")}</label>
                <input type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} className="field" />
              </div>
            </>
          )}
          <div>
            <label className="field-label">{t("reports.col.gate")}</label>
            <select value={gateId} onChange={(e) => setGateId(e.target.value)} className="field">
              <option value="">{t("common.allFem")}</option>
              {gates.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">{t("reports.col.cashier")}</label>
            <select value={cashierUserId} onChange={(e) => setCashierUserId(e.target.value)} className="field">
              <option value="">{t("common.all")}</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">{t("reports.filter.ticketType")}</label>
            <select value={ticketTypeId} onChange={(e) => setTicketTypeId(e.target.value)} className="field">
              <option value="">{t("common.all")}</option>
              {ticketTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="stat-strip">
          <StatCard icon={Wallet} tone="green" label={t("reports.kpi.revenue")} value={formatMoney(stats.revenue)} />
          <StatCard icon={ReceiptIcon} tone="blue" label={t("reports.kpi.sales")} value={stats.count.toLocaleString(locale())} />
          <StatCard icon={ShoppingBag} tone="violet" label={t("reports.kpi.average")} value={formatMoney(stats.average)} />
          <StatCard
            icon={Ban}
            tone="gold"
            label={t("reports.kpi.voids")}
            value={stats.voidedCount.toLocaleString(locale())}
            hint={stats.voidedCount > 0 ? formatMoney(stats.voidedAmount) : undefined}
          />
        </div>

        {stats.byDay.length > 1 && (
          <div className="card">
            <CardHeader title={t("reports.charts.salesPerDayFcfa")} />
            <div className="px-3 pb-3">
              <RevenueBarChart data={stats.byDay} />
            </div>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card">
            <CardHeader title={t("reports.reports.hourly")} />
            <div className="px-3 pb-3">
              <Histogram bins={hours} labelEvery={3} />
            </div>
          </div>
          <div className="card">
            <CardHeader title={t("reports.reports.amounts")} />
            <div className="px-3 pb-3">
              <Histogram bins={amounts} />
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <div className="card">
            <CardHeader title={t("reports.reports.shareTicketType")} />
            <DonutChart
              rows={byTicketType}
              colorOf={(key) => TICKET_COLOR_HEX[ticketType(key)?.color ?? "blue"] ?? TICKET_COLOR_HEX.blue}
              centerLabel={t("reports.reports.fcfaTickets")}
              countLabel={(count) => t("reports.charts.ticketsCount", { count })}
            />
          </div>
          <div className="card">
            <CardHeader title={t("reports.reports.sharePayment")} />
            <DonutChart
              rows={stats.byPayment}
              colorOf={(key) => PAYMENT_COLORS[key as keyof typeof PAYMENT_COLORS] ?? "#475569"}
              centerLabel={t("reports.charts.fcfaCollected")}
            />
          </div>
          <div className="card">
            <CardHeader title={t("reports.reports.shareGate")} />
            <DonutChart rows={byGate} colorOf={(key) => seriesColor(gateIndex(key))} centerLabel={t("reports.reports.fcfaByGate")} />
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
          <div className="card overflow-hidden">
            <CardHeader title={`${t("reports.reports.byTill")} (${stats.byTerminal.length})`} />
            <TerminalBreakdown rows={stats.byTerminal} terminals={terminals} gateName={gateName} limit={5} />
          </div>
          <div className="card self-start overflow-hidden">
            <CardHeader title={`${t("reports.reports.byCashier")} (${byCashier.length})`} />
            <BreakdownList rows={allCashiers ? byCashier : byCashier.slice(0, 5)} />
            {byCashier.length > 5 && (
              <div className="border-t border-border px-5 py-3 text-center">
                <button onClick={() => setAllCashiers((v) => !v)} className="btn-outline px-3 py-1.5 text-xs">
                  {allCashiers ? t("common.seeLess") : t("reports.reports.moreCashiers", { count: byCashier.length - 5 })}
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="card overflow-hidden">
          <CardHeader title={t("reports.salesDetail", { n: rows.length })} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-y border-border bg-muted/40">
                <tr>
                  <th className="th">{t("reports.col.reference")}</th>
                  <th className="th">{t("reports.col.date")}</th>
                  <th className="th">{t("reports.col.gate")}</th>
                  <th className="th">{t("reports.col.cashier")}</th>
                  <th className="th">{t("reports.col.tickets")}</th>
                  <th className="th">{t("reports.col.payment")}</th>
                  <th className="th text-right">{t("reports.col.amount")}</th>
                  <th className="th">{t("reports.col.status")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="td text-center text-muted-foreground">
                      {t("reports.reports.noSales")}
                    </td>
                  </tr>
                )}
                {paged.pageItems.map((tx) => (
                  <tr key={tx.id} className="border-b border-border/60 last:border-0">
                    <td className="td font-mono text-xs font-semibold">{tx.referenceNumber}</td>
                    <td className="td text-muted-foreground">{formatDateTime(tx.createdAtClient)}</td>
                    <td className="td">{gateName(tx.gateId)}</td>
                    <td className="td">{userName(tx.cashierUserId)}</td>
                    <td className="td whitespace-normal">
                      <TicketLines lines={tx.lines} ticketType={ticketType} />
                    </td>
                    <td className="td">{PAYMENT_LABELS[tx.paymentMethod]}</td>
                    <td className={`td text-right font-semibold ${tx.status === "VOIDED" ? "text-muted-foreground line-through" : ""}`}>
                      {formatMoney(tx.totalAmount, tx.currency)}
                    </td>
                    <td className="td text-xs">{tx.status === "VOIDED" ? t("reports.status.voided") : t("reports.status.completed")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={paged.page}
            pages={paged.pages}
            total={paged.total}
            size={paged.size}
            onPage={paged.setPage}
            onSize={paged.setSize}
            unit={t("reports.unit.sales")}
          />
        </div>
      </div>
    </>
  );
}
