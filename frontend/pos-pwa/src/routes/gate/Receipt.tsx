import type { GateSession } from "../../lib/offline/session";
import type { PaymentMethod } from "../../lib/api/types";
import type { IssuedTicket } from "../../lib/offline/sale";

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  CASH: "Espèces",
  MOBILE_MONEY: "Mobile Money",
  CARD: "Carte",
  OTHER: "Autre",
};

export type ReceiptProps = {
  session: GateSession;
  localReference: string; // the client-generated transaction id — see note below
  synced: boolean;
  serverReference: string | null;
  createdAtClient: string;
  ticketTypeName: string;
  unitPrice: number;
  currency: string;
  quantity: number;
  paymentMethod: PaymentMethod;
  tickets: IssuedTicket[];
  qrImages: Record<string, string>;
  // STANDARD: one combined receipt, all QR codes listed inline (e.g. a
  // group pass — the point is one proof-of-purchase, not per-person
  // tear-apart cards). INDIVIDUAL: this receipt is the summary slip;
  // Sell.tsx also renders each ticket as its own separate card alongside it.
  printMode: "STANDARD" | "INDIVIDUAL" | "INHERIT_ESTABLISHMENT";
};

/**
 * Compact, thermal-printer-width receipt (72mm print area, the printable
 * width on a standard 80mm roll). The transaction hasn't necessarily synced
 * yet when this prints — offline sales must still produce a usable receipt
 * — so it shows the client-generated reference with a clear "not yet
 * synced" note rather than blocking on or faking a server reference number.
 */
export default function Receipt({
  session,
  localReference,
  synced,
  serverReference,
  createdAtClient,
  ticketTypeName,
  unitPrice,
  currency,
  quantity,
  paymentMethod,
  tickets,
  qrImages,
  printMode,
}: ReceiptProps) {
  const total = unitPrice * quantity;
  const date = new Date(createdAtClient);

  return (
    <div className="receipt mx-auto bg-white text-black text-xs font-mono leading-tight p-4 border border-border rounded-lg print:border-0 print:rounded-none print:p-0">
      <div className="text-center space-y-1 mb-3">
        {session.bootstrap.establishment.logoUrl ? (
          <img src={session.bootstrap.establishment.logoUrl} alt="" className="h-10 mx-auto" />
        ) : (
          <p className="font-bold text-sm">{session.bootstrap.establishment.name}</p>
        )}
        <p className="text-[10px]">{session.bootstrap.gate.name}</p>
      </div>

      <div className="border-t border-dashed border-black/40 my-2" />

      <div className="space-y-0.5">
        <Row label="Réf." value={serverReference ?? `LOC-${localReference.slice(0, 8)}`} />
        {!synced && <p className="text-[9px] italic text-center">(en attente de synchronisation)</p>}
        <Row label="Date" value={date.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })} />
        <Row label="Caissier" value={session.fullName} />
      </div>

      <div className="border-t border-dashed border-black/40 my-2" />

      <div className="space-y-0.5">
        <div className="flex justify-between">
          <span>
            {quantity} × {ticketTypeName}
          </span>
        </div>
        <div className="flex justify-between">
          <span>
            {unitPrice.toLocaleString("fr-FR")} {currency} / unité
          </span>
          <span>
            {total.toLocaleString("fr-FR")} {currency}
          </span>
        </div>
      </div>

      <div className="border-t border-dashed border-black/40 my-2" />

      <div className="flex justify-between font-bold text-sm">
        <span>TOTAL</span>
        <span>
          {total.toLocaleString("fr-FR")} {currency}
        </span>
      </div>
      <Row label="Paiement" value={PAYMENT_LABELS[paymentMethod]} />

      {printMode === "STANDARD" && (
        <>
          <div className="border-t border-dashed border-black/40 my-2" />
          <p className="text-center text-[10px] mb-2">{tickets.length} entrée(s) — ce reçu vaut pour l'ensemble</p>
          <div className="grid grid-cols-2 gap-2">
            {tickets.map((t) => (
              <div key={t.id} className="text-center">
                {qrImages[t.id] && <img src={qrImages[t.id]} alt={t.ticketNumber} className="mx-auto" />}
                <p className="text-[8px]">{t.ticketNumber}</p>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="border-t border-dashed border-black/40 my-2" />
      <p className="text-center text-[9px]">Merci de votre visite — Nguon {new Date().getFullYear()}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-black/60">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
