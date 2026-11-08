import type { ReactNode } from "react";
import { formatMoney } from "../lib/format";
import { locale, useI18n } from "../i18n";

type Share = { key: string; label: string; value: number; count: number };

export type ReportPrintProps = {
  logoUrl: string;
  establishment: string;
  title: string;
  period: string;
  filters: string[];
  generatedBy: string;
  kpis: { label: string; value: string }[];
  byDay: { label: string; value: number; count: number }[];
  sections: { title: string; countLabel: string; rows: Share[] }[];
  detail: {
    reference: string;
    date: string;
    gate: string;
    cashier: string;
    tickets: string;
    payment: string;
    amount: number;
    voided: boolean;
  }[];
};

/**
 * The printed report — a real A4 document, not a screenshot of the screen:
 * header with period and filters, the figures, every breakdown as a table
 * with shares, and EVERY sale (the screen table is paginated, the printout
 * never is). Hidden on screen; Reports.tsx hides the screen view in print.
 */
export function ReportPrint(p: ReportPrintProps) {
  const { t } = useI18n();
  const total = p.detail.filter((d) => !d.voided).reduce((s, d) => s + d.amount, 0);
  return (
    <div className="report-print hidden text-[11px] leading-snug text-black print:block">
      <header className="flex items-center justify-between border-b-2 border-black pb-3">
        <div className="flex items-center gap-3">
          <img src={p.logoUrl} alt="" className="h-12 w-12 object-contain" />
          <div>
            <p className="text-base font-bold">{p.establishment}</p>
            <p className="text-lg font-bold">{p.title}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="font-semibold">{p.period}</p>
          {p.filters.map((f) => (
            <p key={f}>{f}</p>
          ))}
        </div>
      </header>

      <table className="mt-4 w-full border-collapse">
        <tbody>
          <tr>
            {p.kpis.map((k) => (
              <td key={k.label} className="border border-black/40 px-3 py-2">
                <p className="text-[10px] uppercase">{k.label}</p>
                <p className="text-sm font-bold">{k.value}</p>
              </td>
            ))}
          </tr>
        </tbody>
      </table>

      {p.byDay.length > 1 && (
        <Section title={t("reports.charts.salesPerDay")}>
          <Table
            head={[t("reports.col.day"), t("reports.kpi.sales"), t("reports.col.amount")]}
            rows={p.byDay.map((d) => [d.label, String(d.count), formatMoney(d.value)])}
            alignRight={[1, 2]}
          />
        </Section>
      )}

      <div className="grid grid-cols-2 gap-x-6">
        {p.sections.map((s) => {
          const sum = s.rows.reduce((a, r) => a + r.value, 0);
          return (
            <Section key={s.title} title={s.title}>
              <Table
                head={["", s.countLabel, t("reports.col.amount"), t("reports.col.share")]}
                rows={s.rows.map((r) => [
                  r.label,
                  String(r.count),
                  formatMoney(r.value),
                  sum ? t("reports.print.percent", { n: Math.round((r.value / sum) * 100) }) : "—",
                ])}
                alignRight={[1, 2, 3]}
              />
            </Section>
          );
        })}
      </div>

      <Section title={t("reports.salesDetail", { n: p.detail.length })}>
        <Table
          head={[
            t("reports.col.reference"),
            t("reports.col.date"),
            t("reports.col.gate"),
            t("reports.col.cashier"),
            t("reports.col.tickets"),
            t("reports.col.payment"),
            t("reports.col.amount"),
            t("reports.col.status"),
          ]}
          rows={p.detail.map((d) => [
            d.reference,
            d.date,
            d.gate,
            d.cashier,
            d.tickets,
            d.payment,
            formatMoney(d.amount),
            d.voided ? t("reports.status.voided") : t("reports.status.paidFem"),
          ])}
          alignRight={[6]}
          footer={[t("reports.print.totalCollected"), "", "", "", "", "", formatMoney(total), ""]}
        />
      </Section>

      <p className="mt-6 border-t border-black/40 pt-2 text-[9px]">
        {t("reports.print.footer", { date: new Date().toLocaleString(locale()), name: p.generatedBy })}
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-5 break-inside-avoid-page">
      <h2 className="mb-1.5 border-b border-black pb-0.5 text-xs font-bold uppercase">{title}</h2>
      {children}
    </section>
  );
}

function Table({ head, rows, alignRight = [], footer }: { head: string[]; rows: string[][]; alignRight?: number[]; footer?: string[] }) {
  const { t } = useI18n();
  const cls = (i: number) => `px-1.5 py-1 ${alignRight.includes(i) ? "whitespace-nowrap text-right" : "text-left"}`;
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="border-b border-black/60">
          {head.map((h, i) => (
            <th key={i} className={`${cls(i)} font-semibold`}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr>
            <td colSpan={head.length} className="px-1.5 py-2 text-center italic">
              {t("reports.print.noData")}
            </td>
          </tr>
        )}
        {rows.map((r, i) => (
          <tr key={i} className="break-inside-avoid border-b border-black/15">
            {r.map((c, j) => (
              <td key={j} className={cls(j)}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
      {footer && (
        <tfoot>
          <tr className="border-t-2 border-black font-bold">
            {footer.map((c, j) => (
              <td key={j} className={cls(j)}>
                {c}
              </td>
            ))}
          </tr>
        </tfoot>
      )}
    </table>
  );
}
