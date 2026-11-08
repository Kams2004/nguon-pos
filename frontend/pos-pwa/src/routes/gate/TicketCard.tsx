import { MapPin } from "lucide-react";
import { formatMoney } from "../../lib/format";
import { fillPlaceholders, type ResolvedTicketDesign } from "../../lib/ticketDesign";

export type TicketCardProps = {
  design: ResolvedTicketDesign;
  logoUrl: string;
  gateName: string;
  ticketNumber: string;
  ticketTypeName: string;
  price: number;
  currency: string;
  createdAtClient: string;
  qrImage: string | undefined;
  index: number;
  total: number;
};

const QR_SIZES = { s: "h-32 w-32", m: "h-40 w-40", l: "h-48 w-48" } as const;

/**
 * One full, standalone admission ticket — one per entry, always, regardless
 * of how many entries were bought in a single sale or how the ticket
 * type's print mode is configured. A purchase of N entries renders N of
 * these; it never collapses into shared/thumbnail QR codes (see Sell.tsx).
 *
 * Wording, colours and visible blocks come from "Billet & reçu" (see
 * lib/ticketDesign.ts), so the editor's preview is exactly what tills print.
 * The QR code and ticket number are always shown — they are what makes the
 * ticket verifiable at the gate.
 *
 * On screen it wears its frame; in print the frame and artwork drop to a
 * thin rule, since a thermal printer would render them as solid black.
 */
export default function TicketCard({
  design,
  logoUrl,
  gateName,
  ticketNumber,
  ticketTypeName,
  price,
  currency,
  createdAtClient,
  qrImage,
  index,
  total,
}: TicketCardProps) {
  const o = design.ticket;
  const date = new Date(createdAtClient);
  // "NGUON FESTIVAL" stacks as two lines like the mockup; any title works.
  const [titleFirst, ...titleRest] = design.ticketTitle.split(" ");
  const accent = { color: o.accent };

  const frameStyle =
    o.frame === "pattern"
      ? { backgroundColor: o.accent, backgroundImage: "url(/img/banners/blue.jpg)", backgroundBlendMode: "luminosity" as const }
      : o.frame === "solid"
        ? { backgroundColor: o.accent }
        : undefined;

  return (
    <div
      className={`ticket-card break-inside-avoid rounded-[1.5rem] bg-cover bg-center print:rounded-none print:bg-white print:bg-none print:p-0 print:shadow-none ${
        o.frame === "none" ? "border-2 p-0" : "p-2.5 shadow-xl shadow-black/10"
      }`}
      style={o.frame === "none" ? { borderColor: o.accent } : frameStyle}
    >
      <div className="relative overflow-hidden rounded-[1.1rem] bg-white print:rounded-none print:border print:border-black">
        {total > 1 && (
          <span
            className="absolute right-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-bold text-white print:border print:border-black print:bg-white print:text-black"
            style={{ backgroundColor: o.accent }}
          >
            {index + 1} / {total}
          </span>
        )}

        <div className="flex flex-col items-center px-5 pt-5 text-center">
          <div className="flex items-center gap-2">
            {o.showLogo && <img src={logoUrl} alt="" className="h-10 w-10 object-contain" />}
            <div className="text-left leading-none print:!text-black" style={accent}>
              <p className="font-display text-lg font-extrabold">{titleFirst}</p>
              {titleRest.length > 0 && <p className="font-display text-lg font-extrabold">{titleRest.join(" ")}</p>}
            </div>
          </div>
          {o.showSubtitle && <p className="mt-1.5 text-[11px] font-bold text-foreground">{design.ticketSubtitle}</p>}
          {o.showTagline && <p className="text-[10px] text-muted-foreground print:text-black">{design.ticketTagline}</p>}

          <div className="mt-3 rounded-xl border-2 bg-white p-2 print:border-0 print:p-0" style={{ borderColor: `${o.accent}55` }}>
            {qrImage ? (
              <img src={qrImage} alt={ticketNumber} className={QR_SIZES[o.qrSize]} />
            ) : (
              <div className={`${QR_SIZES[o.qrSize]} animate-pulse rounded-lg bg-muted`} />
            )}
          </div>

          <h3 className="mt-3 font-display text-xl font-extrabold print:!text-black" style={accent}>
            {ticketTypeName}
          </h3>
          <p className="mt-0.5 font-mono text-xs font-bold text-foreground">N° : {ticketNumber}</p>
          {o.showDate && (
            <p className="mt-1 text-xs text-muted-foreground print:text-black">
              {date.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "long", year: "numeric" })} ·{" "}
              {date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
          {o.showLocation && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground print:text-black">
              <MapPin className="h-3 w-3" /> {design.ticketLocation} — {gateName}
            </p>
          )}
          {o.showPrice && <p className="mt-2 font-display text-base font-extrabold text-foreground">Prix : {formatMoney(price, currency)}</p>}
          {o.note && <p className="mt-2 rounded-lg bg-muted/70 px-3 py-1 text-[11px] font-semibold text-foreground print:bg-white">{o.note}</p>}
        </div>

        {o.showBanner ? (
          <div className="relative mt-3 h-24 print:hidden">
            <img src={design.ticketBannerUrl} alt="" className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-b from-white via-white/10 to-transparent" />
          </div>
        ) : (
          <div className="h-4" />
        )}
        {o.showFooter && (
          <p className="bg-muted/60 px-3 py-2 text-center text-[10px] text-muted-foreground print:border-t print:border-dashed print:border-black print:bg-white print:py-1.5 print:text-[9px] print:text-black">
            {fillPlaceholders(design.ticketFooter, gateName)}
          </p>
        )}
      </div>
    </div>
  );
}
