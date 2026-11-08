import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronRight, ChevronUp } from "lucide-react";
import type { TerminalStatus } from "../lib/api/types";
import { formatMoney, formatTime } from "../lib/format";
import { useI18n } from "../i18n";

type Row = { key: string; value: number; count: number; lastAt: string };

/**
 * Sales per till: share bar, revenue, count, last sale and live state.
 * Each row opens that till's own page.
 */
export function TerminalBreakdown({
  rows,
  terminals,
  gateName,
  limit,
}: {
  rows: Row[];
  terminals: TerminalStatus[];
  gateName: (id: string) => string;
  /** Show only the top N with a "Voir plus" toggle. */
  limit?: number;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const total = rows.reduce((s, r) => s + r.value, 0);
  const best = rows[0]?.value ?? 0;
  if (rows.length === 0) return <p className="px-5 pb-5 text-sm text-muted-foreground">{t("reports.breakdown.noSales")}</p>;

  const shown = limit && !expanded ? rows.slice(0, limit) : rows;
  const hidden = rows.length - shown.length;

  return (
    <>
      <ul className="divide-y divide-border">
        {shown.map((r, i) => {
          const term = terminals.find((x) => x.terminalId === r.key);
          const pct = total > 0 ? Math.round((r.value / total) * 100) : 0;
          return (
            <li key={r.key}>
              <button
                onClick={() => navigate(`/admin/sync-status/${r.key}`)}
                className="flex w-full items-center gap-4 px-5 py-3 text-left transition-colors hover:bg-blue-50/50"
              >
                <span
                  className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    i === 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {term?.deviceLabel ?? t("reports.tillFallback", { id: r.key.slice(0, 4).toUpperCase() })}
                    </p>
                    {term && (
                      <span
                        className={`flex flex-shrink-0 items-center gap-1 whitespace-nowrap text-[11px] font-semibold ${term.online ? "text-success" : "text-muted-foreground"}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${term.online ? "bg-emerald-500" : "bg-muted-foreground/50"}`} />
                        {term.online ? t("common.online") : t("common.offline")}
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      {/* Bar relative to the best till, so the ranking reads at a glance */}
                      <div className="h-full rounded-full bg-secondary" style={{ width: `${best ? (r.value / best) * 100 : 0}%` }} />
                    </div>
                    <span className="w-10 text-right text-[11px] text-muted-foreground">{pct}%</span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {term ? gateName(term.gateId) : "—"} · {t("reports.breakdown.summary", { count: r.count, time: formatTime(r.lastAt) })}
                  </p>
                </div>
                <span className="whitespace-nowrap text-sm font-bold text-foreground">{formatMoney(r.value)}</span>
                <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
              </button>
            </li>
          );
        })}
      </ul>
      {limit && rows.length > limit && (
        <div className="border-t border-border p-3 text-center">
          <button onClick={() => setExpanded((v) => !v)} className="btn-outline px-4 py-2 text-xs">
            {expanded ? (
              <>
                <ChevronUp className="h-4 w-4" /> {t("common.seeLess")}
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4" /> {t("reports.breakdown.moreTills", { count: hidden })}
              </>
            )}
          </button>
        </div>
      )}
    </>
  );
}
