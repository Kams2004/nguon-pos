import type { AdminTicketType, TransactionSummary } from "../lib/api/types";
import { ticketColor, ticketIcon } from "../lib/ticketIcons";
import { useI18n } from "../i18n";

/** "2 × Entrée générale · 1 × Pass VIP" as small coloured chips — what a sale contained. */
export function TicketLines({
  lines,
  ticketType,
}: {
  lines: TransactionSummary["lines"];
  ticketType: (id: string) => AdminTicketType | undefined;
}) {
  const { t } = useI18n();
  if (!lines?.length) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {lines.map((l) => {
        const type = ticketType(l.ticketTypeId);
        const Icon = ticketIcon(type?.icon);
        const c = ticketColor(type?.color);
        return (
          <span
            key={l.ticketTypeId}
            className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${c.soft}`}
          >
            <Icon className="h-3 w-3" />
            {l.quantity} × {type?.name ?? t("reports.ticket")}
          </span>
        );
      })}
    </div>
  );
}
