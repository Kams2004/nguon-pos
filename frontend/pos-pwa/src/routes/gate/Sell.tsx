import { useState } from "react";
import QRCode from "qrcode";
import { useSession } from "../../context/SessionContext";
import { createSale, type CartLine, type IssuedTicket } from "../../lib/offline/sale";
import type { GateSession } from "../../lib/offline/session";
import type { PaymentMethod } from "../../lib/api/types";
import GateHeader from "./GateHeader";
import Receipt from "./Receipt";
import TicketCard from "./TicketCard";

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "CASH", label: "Espèces" },
  { value: "MOBILE_MONEY", label: "Mobile Money" },
  { value: "CARD", label: "Carte" },
  { value: "OTHER", label: "Autre" },
];

type CompletedSale = {
  transactionId: string;
  tickets: IssuedTicket[];
  ticketTypeId: string;
  quantity: number;
  paymentMethod: PaymentMethod;
  createdAtClient: string;
};

export default function Sell() {
  const { session, syncNow, refreshPendingCount } = useSession();
  const ticketTypes = session?.bootstrap?.ticketTypes ?? [];
  const [selectedTypeId, setSelectedTypeId] = useState(ticketTypes[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [completedSale, setCompletedSale] = useState<CompletedSale | null>(null);
  const [qrImages, setQrImages] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // RequireGateSession (App.tsx) guarantees a gate-assigned session with
  // bootstrap data before this screen ever renders — this check is just
  // what lets TypeScript narrow `session` to GateSession for the rest of
  // the component.
  if (!session || !session.assignedGateId || !session.bootstrap) return null;
  // Explicit local, not just the narrowed `session` — narrowing from the
  // guard above doesn't reliably persist into the nested closures below.
  const gateSession = session as GateSession;
  const ticketType = ticketTypes.find((t) => t.id === selectedTypeId) ?? ticketTypes[0];

  const handleConfirm = async () => {
    if (!ticketType) return;
    setSubmitting(true);
    try {
      const cart: CartLine[] = [{ ticketTypeId: ticketType.id, quantity, unitPrice: ticketType.price }];
      const result = await createSale(gateSession, cart, paymentMethod);
      // Only AFTER the offline write resolves do we render/print — see
      // docs/SYNC_PROTOCOL.md's "golden rule".
      setCompletedSale({
        transactionId: result.transactionId,
        tickets: result.tickets,
        ticketTypeId: ticketType.id,
        quantity,
        paymentMethod,
        createdAtClient: new Date().toISOString(),
      });
      const images: Record<string, string> = {};
      for (const t of result.tickets) {
        images[t.id] = await QRCode.toDataURL(t.qrContent, { width: 180, margin: 1 });
      }
      setQrImages(images);
      refreshPendingCount(); // reflect the new outbox entry immediately, online or not
      syncNow(); // fire-and-forget: sync immediately if online, otherwise it stays queued
    } finally {
      setSubmitting(false);
    }
  };

  const startNewSale = () => {
    setCompletedSale(null);
    setQrImages({});
    setQuantity(1);
  };

  if (completedSale) {
    const soldType = ticketTypes.find((t) => t.id === completedSale.ticketTypeId)!;

    return (
      <div className="min-h-screen bg-background">
        <div className="no-print">
          <GateHeader />
        </div>
        <div className="max-w-5xl mx-auto p-6 space-y-8">
          <div className="no-print text-center space-y-1">
            <div className="w-14 h-14 rounded-full bg-secondary/20 flex items-center justify-center mx-auto">
              <span className="text-2xl">✓</span>
            </div>
            <h2 className="font-display text-xl font-bold text-foreground">Vente enregistrée</h2>
            <p className="text-sm text-muted-foreground">
              {completedSale.tickets.length === 1
                ? "1 billet prêt à être présenté"
                : `${completedSale.tickets.length} billets séparés, chacun prêt à être présenté`}
            </p>
          </div>

          <div className="max-w-xs mx-auto">
            <Receipt
              session={gateSession}
              localReference={completedSale.transactionId}
              synced={false}
              serverReference={null}
              createdAtClient={completedSale.createdAtClient}
              ticketTypeName={soldType.name}
              unitPrice={soldType.price}
              currency={soldType.currency}
              quantity={completedSale.quantity}
              paymentMethod={completedSale.paymentMethod}
              tickets={completedSale.tickets}
            />
          </div>

          <div>
            <p className="no-print text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3 text-center">
              {completedSale.tickets.length > 1 ? "Billets individuels — un par entrée" : "Billet"}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {completedSale.tickets.map((t, i) => (
                <TicketCard
                  key={t.id}
                  session={gateSession}
                  ticketNumber={t.ticketNumber}
                  ticketTypeName={soldType.name}
                  price={soldType.price}
                  currency={soldType.currency}
                  createdAtClient={completedSale.createdAtClient}
                  qrImage={qrImages[t.id]}
                  index={i}
                  total={completedSale.tickets.length}
                />
              ))}
            </div>
          </div>

          <div className="no-print flex gap-3 max-w-xs mx-auto">
            <button
              onClick={() => window.print()}
              className="flex-1 py-3 rounded-xl border-2 border-primary text-primary font-bold"
            >
              Imprimer
            </button>
            <button
              onClick={startNewSale}
              className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-bold shadow-md"
            >
              Nouvelle vente
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <GateHeader />
      <div className="max-w-5xl mx-auto p-4 sm:p-6">
        <h2 className="font-display text-xl font-bold text-foreground mb-5">Vendre un billet</h2>

        {ticketTypes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun type de billet configuré pour cette porte.</p>
        ) : (
          <div className="grid lg:grid-cols-[1fr_360px] gap-6 items-start">
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Type de billet</p>
              <div className="grid sm:grid-cols-2 gap-3">
                {ticketTypes.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedTypeId(t.id)}
                    className={`text-left px-4 py-4 rounded-2xl border-2 transition-all flex items-center justify-between gap-2 ${
                      selectedTypeId === t.id
                        ? "border-primary bg-primary/10 shadow-sm"
                        : "border-border bg-card hover:border-primary/40"
                    }`}
                  >
                    <span className="font-bold text-foreground">{t.name}</span>
                    <span className="text-sm text-muted-foreground whitespace-nowrap">
                      {t.price.toLocaleString("fr-FR")} {t.currency}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {ticketType && (
              <div className="rounded-[1.75rem] border border-border bg-card p-5 space-y-5 lg:sticky lg:top-6">
                <div>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2 text-center">
                    Quantité
                  </p>
                  <div className="flex items-center justify-center gap-4">
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      className="w-10 h-10 rounded-xl border border-border font-bold text-lg hover:bg-muted transition-colors"
                    >
                      −
                    </button>
                    <span className="text-2xl font-black w-12 text-center">{quantity}</span>
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => q + 1)}
                      className="w-10 h-10 rounded-xl border border-border font-bold text-lg hover:bg-muted transition-colors"
                    >
                      +
                    </button>
                  </div>
                  {quantity > 1 && (
                    <p className="text-[11px] text-center text-muted-foreground mt-2">
                      {quantity} billets séparés seront générés
                    </p>
                  )}
                </div>

                <div>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Paiement</p>
                  <div className="grid grid-cols-2 gap-2">
                    {PAYMENT_METHODS.map((m) => (
                      <button
                        key={m.value}
                        type="button"
                        onClick={() => setPaymentMethod(m.value)}
                        className={`text-sm font-semibold px-3 py-2.5 rounded-xl border-2 transition-colors ${
                          paymentMethod === m.value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl bg-muted/50 px-4 py-3 flex items-center justify-between">
                  <span className="text-sm font-semibold text-muted-foreground">Total</span>
                  <span className="text-lg font-black text-foreground">
                    {(ticketType.price * quantity).toLocaleString("fr-FR")} {ticketType.currency}
                  </span>
                </div>

                <button
                  onClick={handleConfirm}
                  disabled={submitting}
                  className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-bold shadow-md shadow-primary/20 disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <span className="w-4 h-4 rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground animate-spin" />
                      Enregistrement…
                    </>
                  ) : (
                    "Confirmer la vente"
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
