import { DoorOpen, Download, UserRound } from "lucide-react";
import type { CashierReport } from "../lib/stats";
import { formatDateTime, formatMoney, formatTime } from "../lib/format";
import { locale, useI18n } from "../i18n";
import { CardHeader } from "./ui";
import { Pagination, usePaged } from "./Pagination";

/** "19/11/2026 08:55 → 11:30"; the date only once when both are the same day, never on a one-day report. */
export function periodLabel(first: string, last: string, oneDay = false): string {
  if (oneDay) return `${formatTime(first)} → ${formatTime(last)}`;
  const sameDay = new Date(first).toDateString() === new Date(last).toDateString();
  return `${formatDateTime(first)} → ${sameDay ? formatTime(last) : formatDateTime(last)}`;
}

/**
 * "Caissiers par porte": for each cashier, what they sold at each gate they
 * worked at over the period — sales, tickets, amount, cancellations — and
 * from when to when they sold there.
 */
export function CashierGateReport({
  report,
  userName,
  gateName,
  oneDay,
  onExport,
}: {
  report: CashierReport[];
  userName: (id: string) => string;
  gateName: (id: string) => string;
  /** The period is a single day: times only. */
  oneDay: boolean;
  onExport: () => void;
}) {
  const { t } = useI18n();
  const span = (first: string, last: string) => periodLabel(first, last, oneDay);
  // Pages of cashiers (each with all their gates); back to page 1 when the report changes.
  const paged = usePaged(report, 10, report.map((c) => c.cashierUserId).join(","));
  const num = (n: number) => n.toLocaleString(locale());
  return (
    <div className="card overflow-hidden">
      <CardHeader
        title={`${t("reports.cashierGates.title")} (${report.length})`}
        action={
          report.length > 0 && (
            <button onClick={onExport} className="btn-outline px-3 py-1.5 text-xs">
              <Download className="h-3.5 w-3.5" /> {t("common.exportCsv")}
            </button>
          )
        }
      />
      <p className="max-w-[75ch] px-5 pb-3 text-sm text-muted-foreground">{t("reports.cashierGates.intro")}</p>
      {report.length === 0 ? (
        <p className="px-5 pb-6 text-sm text-muted-foreground">{t("reports.cashierGates.empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-y border-border bg-muted/40">
              <tr>
                <th className="th">{t("reports.cashierGates.who")}</th>
                <th className="th text-right">{t("reports.kpi.sales")}</th>
                <th className="th text-right">{t("reports.col.tickets")}</th>
                <th className="th text-right">{t("reports.col.amount")}</th>
                <th className="th text-right">{t("reports.kpi.voids")}</th>
                <th className="th">{t("reports.cashierGates.period")}</th>
              </tr>
            </thead>
            {paged.pageItems.map((c) => (
              <tbody key={c.cashierUserId} className="border-b border-border last:border-0">
                <tr className="bg-muted/25">
                  <td className="td font-bold text-foreground">
                    <span className="flex items-center gap-2">
                      <UserRound className="h-4 w-4 text-secondary" /> {userName(c.cashierUserId)}
                      <span className="text-xs font-semibold text-muted-foreground">
                        · {t("reports.cashierGates.gateCount", { count: c.gates.length })}
                      </span>
                    </span>
                  </td>
                  <td className="td text-right font-bold">{num(c.sales)}</td>
                  <td className="td text-right font-bold">{num(c.tickets)}</td>
                  <td className="td text-right font-display font-bold text-royal">{formatMoney(c.amount)}</td>
                  <td className="td text-right text-muted-foreground">{c.voided > 0 ? num(c.voided) : "—"}</td>
                  <td className="td" />
                </tr>
                {c.gates.map((g) => (
                  <tr key={g.gateId}>
                    <td className="td pl-11 text-foreground">
                      <span className="flex items-center gap-2">
                        <DoorOpen className="h-3.5 w-3.5 text-muted-foreground" /> {gateName(g.gateId)}
                      </span>
                    </td>
                    <td className="td text-right">{num(g.sales)}</td>
                    <td className="td text-right">{num(g.tickets)}</td>
                    <td className="td text-right font-semibold">{formatMoney(g.amount)}</td>
                    <td className="td text-right text-muted-foreground">
                      {g.voided > 0 ? `${num(g.voided)} (${formatMoney(g.voidedAmount)})` : "—"}
                    </td>
                    <td className="td text-muted-foreground">
                      {span(g.first, g.last)}
                    </td>
                  </tr>
                ))}
              </tbody>
            ))}
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
        unit={t("reports.cashierGates.unit")}
      />
    </div>
  );
}
