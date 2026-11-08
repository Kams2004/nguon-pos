import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, Download, Printer, Receipt as ReceiptIcon, ShoppingBag, Wallet } from "lucide-react";
import { useLiveRefresh, useSession } from "../../context/SessionContext";
import { api } from "../../lib/api/client";
import type { AdminGate, TerminalStatus, TransactionSummary } from "../../lib/api/types";
import { ALL_TRANSACTIONS_PAGE_SIZE, amountHistogram, computeStats, hourHistogram } from "../../lib/stats";
import { PAYMENT_LABELS, addDays, dayKey, formatDateTime, formatMoney, startOfDay } from "../../lib/format";
import { Pagination, usePaged } from "../../components/Pagination";
import { CardHeader, Loading, PageHeader, RefreshButton, StatCard } from "../../components/ui";
import { useBranding } from "../../context/BrandingContext";
import { ReportPrint } from "../../components/ReportPrint";
import { PAYMENT_COLORS, seriesColor } from "../../lib/chartColors";
import { TICKET_COLOR_HEX } from "../../lib/ticketIcons";
import { BreakdownList, DonutChart, Histogram, RevenueBarChart } from "../../components/charts";
import { TerminalBreakdown } from "../../components/TerminalBreakdown";
import { TicketLines } from "../../components/TicketLines";
import { useCatalog } from "../../lib/useCatalog";

type Kind = "daily" | "weekly" | "monthly" | "custom";
const KINDS: { value: Kind; label: string }[] = [
  { value: "daily", label: "Journalier" },
  { value: "weekly", label: "Hebdomadaire" },
  { value: "monthly", label: "Mensuel" },
  { value: "custom", label: "Personnalisé" },
];

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
      api.listGates(session.token).then(setGates).catch(() => setGates([])),
      api.syncStatus(session.token).then(setTerminals).catch(() => setTerminals([])),
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
    [scoped, start.getTime(), end.getTime(), gateId, cashierUserId],
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
      .map(([key, v]) => ({ key, label: ticketType(key)?.name ?? "Billet", ...v }))
      .sort((a, b) => b.value - a.value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, ticketTypes]);

  const hours = useMemo(() => hourHistogram(rows), [rows]);
  const amounts = useMemo(() => amountHistogram(rows), [rows]);
  const paged = usePaged(rows, 25, `${start.getTime()}|${end.getTime()}|${gateId}|${cashierUserId}|${ticketTypeId}`);

  if (!session) return null;
  if (!transactions) return <Loading />;

  const gateName = (id: string) => gates.find((g) => g.id === id)?.name ?? id.slice(0, 8);
  const rangeLabel = `${start.toLocaleDateString("fr-FR")} — ${addDays(end, -1).toLocaleDateString("fr-FR")}`;

  const exportCsv = () => {
    const header = ["Référence", "Date", "Porte", "Caissier", "Billets", "Paiement", "Montant", "Devise", "Statut", "Motif d'annulation"];
    const lines = rows.map((t) =>
      [
        t.referenceNumber,
        formatDateTime(t.createdAtClient),
        gateName(t.gateId),
        userName(t.cashierUserId),
        t.lines.map((l) => `${l.quantity} x ${ticketType(l.ticketTypeId)?.name ?? "Billet"}`).join(", "),
        PAYMENT_LABELS[t.paymentMethod],
        t.totalAmount,
        t.currency,
        t.status === "VOIDED" ? "Annulée" : "Complétée",
        t.voidReason ?? "",
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(";"),
    );
    // BOM + semicolons so Excel (French locale) opens it with accents and columns intact.
    const blob = new Blob(["﻿" + [header.join(";"), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `rapport-${kind}-${dayKey(start)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const kindLabel = KINDS.find((k) => k.value === kind)!.label;
  const filterLabels = [
    gateId ? `Porte : ${gateName(gateId)}` : "",
    cashierUserId ? `Caissier : ${userName(cashierUserId)}` : "",
    ticketTypeId ? `Billet : ${ticketType(ticketTypeId)?.name ?? ""}` : "",
  ].filter(Boolean);
  const terminalLabel = (id: string) => terminals.find((t) => t.terminalId === id)?.deviceLabel ?? `Caisse ${id.slice(0, 4).toUpperCase()}`;
  const gateIndex = (id: string) => Math.max(0, gates.findIndex((g) => g.id === id));
  const byGate = stats.byGate.map((g) => ({ ...g, label: gateName(g.key) }));
  const byCashier = stats.byCashier.map((c) => ({ ...c, label: userName(c.key) }));

  return (
    <>
      {/* A4 for reports (the till's thermal screens set their own @page) */}
      <style>{"@page { size: A4; margin: 12mm; }"}</style>
      <ReportPrint
        logoUrl={logoUrl}
        establishment={establishmentName}
        title={`Rapport des ventes — ${kindLabel.toLowerCase()}`}
        period={rangeLabel}
        filters={filterLabels}
        generatedBy={session.fullName}
        kpis={[
          { label: "Chiffre d'affaires", value: formatMoney(stats.revenue) },
          { label: "Ventes", value: stats.count.toLocaleString("fr-FR") },
          { label: "Panier moyen", value: formatMoney(stats.average) },
          { label: "Annulations", value: `${stats.voidedCount} (${formatMoney(stats.voidedAmount)})` },
        ]}
        byDay={stats.byDay}
        sections={[
          { title: "Par type de billet", countLabel: "Billets", rows: byTicketType },
          { title: "Par moyen de paiement", countLabel: "Ventes", rows: stats.byPayment },
          { title: "Par porte", countLabel: "Ventes", rows: byGate },
          { title: "Par caisse", countLabel: "Ventes", rows: stats.byTerminal.map((t) => ({ ...t, label: terminalLabel(t.key) })) },
          { title: "Par caissier", countLabel: "Ventes", rows: byCashier },
        ]}
        detail={rows.map((t) => ({
          reference: t.referenceNumber,
          date: formatDateTime(t.createdAtClient),
          gate: gateName(t.gateId),
          cashier: userName(t.cashierUserId),
          tickets: t.lines.map((l) => `${l.quantity}× ${ticketType(l.ticketTypeId)?.name ?? "Billet"}`).join(", "),
          payment: PAYMENT_LABELS[t.paymentMethod],
          amount: t.totalAmount,
          voided: t.status === "VOIDED",
        }))}
      />

      <div className="space-y-6 print:hidden">
      <PageHeader
        title="Rapports"
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
              <Download className="h-4 w-4" /> Exporter CSV
            </button>
            <button onClick={() => window.print()} className="btn-blue">
              <Printer className="h-4 w-4" /> Imprimer le rapport
            </button>
          </>
        }
      />

      <div className="card no-print flex flex-wrap items-end gap-4 p-4">
        <div className="flex rounded-xl bg-muted p-1">
          {KINDS.map((k) => (
            <button
              key={k.value}
              onClick={() => setKind(k.value)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                kind === k.value ? "bg-secondary text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>
        {(kind === "daily" || kind === "weekly") && (
          <div>
            <label className="field-label">{kind === "daily" ? "Jour" : "Semaine se terminant le"}</label>
            <input type="date" value={day} max={today} onChange={(e) => e.target.value && setDay(e.target.value)} className="field" />
          </div>
        )}
        {kind === "monthly" && (
          <div>
            <label className="field-label">Mois</label>
            <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="field" />
          </div>
        )}
        {kind === "custom" && (
          <>
            <div>
              <label className="field-label">Du</label>
              <input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className="field" />
            </div>
            <div>
              <label className="field-label">Au</label>
              <input type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} className="field" />
            </div>
          </>
        )}
        <div>
          <label className="field-label">Porte</label>
          <select value={gateId} onChange={(e) => setGateId(e.target.value)} className="field">
            <option value="">Toutes</option>
            {gates.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label">Caissier</label>
          <select value={cashierUserId} onChange={(e) => setCashierUserId(e.target.value)} className="field">
            <option value="">Tous</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label">Type de billet</label>
          <select value={ticketTypeId} onChange={(e) => setTicketTypeId(e.target.value)} className="field">
            <option value="">Tous</option>
            {ticketTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="stat-strip">
        <StatCard icon={Wallet} tone="green" label="Chiffre d'affaires" value={formatMoney(stats.revenue)} />
        <StatCard icon={ReceiptIcon} tone="blue" label="Ventes" value={stats.count.toLocaleString("fr-FR")} />
        <StatCard icon={ShoppingBag} tone="violet" label="Panier moyen" value={formatMoney(stats.average)} />
        <StatCard
          icon={Ban}
          tone="gold"
          label="Annulations"
          value={stats.voidedCount.toLocaleString("fr-FR")}
          hint={stats.voidedCount > 0 ? formatMoney(stats.voidedAmount) : undefined}
        />
      </div>

      {stats.byDay.length > 1 && (
        <div className="card">
          <CardHeader title="Ventes par jour (FCFA)" />
          <div className="px-3 pb-3">
            <RevenueBarChart data={stats.byDay} />
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <CardHeader title="Affluence par heure (histogramme du nombre de ventes)" />
          <div className="px-3 pb-3">
            <Histogram bins={hours} labelEvery={3} />
          </div>
        </div>
        <div className="card">
          <CardHeader title="Montant des ventes (répartition des paniers)" />
          <div className="px-3 pb-3">
            <Histogram bins={amounts} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="card">
          <CardHeader title="Part par type de billet" />
          <DonutChart
            rows={byTicketType}
            colorOf={(key) => TICKET_COLOR_HEX[ticketType(key)?.color ?? "blue"] ?? TICKET_COLOR_HEX.blue}
            centerLabel="FCFA billets"
            countUnit="billets"
          />
        </div>
        <div className="card">
          <CardHeader title="Part par moyen de paiement" />
          <DonutChart rows={stats.byPayment} colorOf={(key) => PAYMENT_COLORS[key as keyof typeof PAYMENT_COLORS] ?? "#475569"} centerLabel="FCFA encaissés" />
        </div>
        <div className="card">
          <CardHeader title="Part par porte" />
          <DonutChart rows={byGate} colorOf={(key) => seriesColor(gateIndex(key))} centerLabel="FCFA par porte" />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <div className="card overflow-hidden">
          <CardHeader title={`Par caisse (${stats.byTerminal.length})`} />
          <TerminalBreakdown rows={stats.byTerminal} terminals={terminals} gateName={gateName} limit={5} />
        </div>
        <div className="card self-start overflow-hidden">
          <CardHeader title={`Par caissier (${byCashier.length})`} />
          <BreakdownList rows={allCashiers ? byCashier : byCashier.slice(0, 5)} />
          {byCashier.length > 5 && (
            <div className="border-t border-border px-5 py-3 text-center">
              <button onClick={() => setAllCashiers((v) => !v)} className="btn-outline px-3 py-1.5 text-xs">
                {allCashiers ? "Voir moins" : `Voir plus (${byCashier.length - 5} autres caissiers)`}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="card overflow-hidden">
        <CardHeader title={`Détail des ventes (${rows.length})`} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-y border-border bg-muted/40">
              <tr>
                <th className="th">Référence</th>
                <th className="th">Date</th>
                <th className="th">Porte</th>
                <th className="th">Caissier</th>
                <th className="th">Billets</th>
                <th className="th">Paiement</th>
                <th className="th text-right">Montant</th>
                <th className="th">Statut</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="td text-center text-muted-foreground">
                    Aucune vente sur cette période.
                  </td>
                </tr>
              )}
              {paged.pageItems.map((t) => (
                <tr key={t.id} className="border-b border-border/60 last:border-0">
                  <td className="td font-mono text-xs font-semibold">{t.referenceNumber}</td>
                  <td className="td text-muted-foreground">{formatDateTime(t.createdAtClient)}</td>
                  <td className="td">{gateName(t.gateId)}</td>
                  <td className="td">{userName(t.cashierUserId)}</td>
                  <td className="td whitespace-normal">
                    <TicketLines lines={t.lines} ticketType={ticketType} />
                  </td>
                  <td className="td">{PAYMENT_LABELS[t.paymentMethod]}</td>
                  <td className={`td text-right font-semibold ${t.status === "VOIDED" ? "text-muted-foreground line-through" : ""}`}>
                    {formatMoney(t.totalAmount, t.currency)}
                  </td>
                  <td className="td text-xs">{t.status === "VOIDED" ? "Annulée" : "Complétée"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={paged.page} pages={paged.pages} total={paged.total} size={paged.size} onPage={paged.setPage} onSize={paged.setSize} unit="ventes" />
      </div>
      </div>
    </>
  );
}
