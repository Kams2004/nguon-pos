import type { GateSession } from "../../lib/offline/session";

export type TicketCardProps = {
  session: GateSession;
  ticketNumber: string;
  ticketTypeName: string;
  price: number;
  currency: string;
  createdAtClient: string;
  qrImage: string | undefined;
  index: number;
  total: number;
};

/**
 * One full, standalone admission ticket — one per entry, always, regardless
 * of how many entries were bought in a single sale or how the ticket
 * type's print mode is configured. A purchase of N entries renders N of
 * these; it never collapses into shared/thumbnail QR codes (see Sell.tsx).
 */
export default function TicketCard({
  session,
  ticketNumber,
  ticketTypeName,
  price,
  currency,
  createdAtClient,
  qrImage,
  index,
  total,
}: TicketCardProps) {
  const date = new Date(createdAtClient);
  const establishment = session.bootstrap.establishment;
  const gate = session.bootstrap.gate;

  return (
    <div className="ticket-card rounded-[1.75rem] overflow-hidden bg-card border border-border shadow-lg shadow-black/5 break-inside-avoid">
      <div className="h-1.5 bg-gradient-to-r from-primary via-primary/70 to-primary" />
      <div className="relative bg-sidebar text-sidebar-foreground px-6 py-5 overflow-hidden">
        <div
          className="absolute inset-0 opacity-20 mix-blend-soft-light"
          style={{ backgroundImage: "url(/img/diamond-pattern.svg)", backgroundSize: "140px" }}
        />
        <div className="relative flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <img src="/logo.png" alt="" className="h-8 flex-shrink-0 drop-shadow rounded bg-white/10 p-0.5" />
            <div className="min-w-0">
              <p className="font-display font-black text-sm leading-tight truncate">{establishment.name}</p>
              <p className="text-[11px] text-sidebar-foreground/70 truncate">{gate.name}</p>
            </div>
          </div>
          {total > 1 && (
            <span className="text-[11px] font-bold bg-primary text-primary-foreground rounded-full px-2.5 py-1 flex-shrink-0">
              {index + 1} / {total}
            </span>
          )}
        </div>
      </div>

      <div className="px-6 py-5 flex flex-col items-center text-center gap-4">
        <div>
          <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.15em]">Billet d'entrée</p>
          <h3 className="font-display text-xl font-black text-foreground mt-0.5">{ticketTypeName}</h3>
        </div>

        <div className="p-3 rounded-2xl bg-white shadow-inner border-2 border-primary/30">
          {qrImage ? (
            <img src={qrImage} alt={ticketNumber} className="w-44 h-44" />
          ) : (
            <div className="w-44 h-44 bg-muted animate-pulse rounded-lg" />
          )}
        </div>

        <p className="font-mono font-bold text-sm text-foreground tracking-wide">
          N° <span className="text-[hsl(38,80%,42%)]">{ticketNumber}</span>
        </p>

        <div className="w-full border-t border-dashed border-border" />

        <div className="w-full grid grid-cols-2 gap-3 text-left">
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Date</p>
            <p className="text-xs font-semibold text-foreground">
              {date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Tarif</p>
            <p className="text-xs font-semibold text-foreground">
              {price.toLocaleString("fr-FR")} {currency}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-muted/60 px-6 py-2.5 text-center">
        <p className="text-[10px] text-muted-foreground">Valable uniquement à {gate.name} — usage unique</p>
      </div>
    </div>
  );
}
