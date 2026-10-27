import { useState } from "react";
import QRCode from "qrcode";
import { useSession } from "../../context/SessionContext";
import { createSale, type CartLine, type IssuedTicket } from "../../lib/offline/sale";
import type { PaymentMethod } from "../../lib/api/types";
import GateHeader from "./GateHeader";

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "CASH", label: "Espèces" },
  { value: "MOBILE_MONEY", label: "Mobile Money" },
  { value: "CARD", label: "Carte" },
  { value: "OTHER", label: "Autre" },
];

export default function Sell() {
  const { session, syncNow, refreshPendingCount } = useSession();
  const [quantity, setQuantity] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [issuedTickets, setIssuedTickets] = useState<IssuedTicket[] | null>(null);
  const [qrImages, setQrImages] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  if (!session) return null;
  const ticketType = session.bootstrap.ticketTypes[0];

  const handleConfirm = async () => {
    if (!ticketType) return;
    setSubmitting(true);
    try {
      const cart: CartLine[] = [{ ticketTypeId: ticketType.id, quantity, unitPrice: ticketType.price }];
      const result = await createSale(session, cart, paymentMethod);
      // Only AFTER the offline write resolves do we render/print — see
      // docs/SYNC_PROTOCOL.md's "golden rule".
      setIssuedTickets(result.tickets);
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
    setIssuedTickets(null);
    setQrImages({});
    setQuantity(1);
  };

  if (issuedTickets) {
    return (
      <div className="min-h-screen bg-background">
        <GateHeader />
        <div className="max-w-2xl mx-auto p-6 space-y-6">
          <div className="text-center space-y-1">
            <div className="w-14 h-14 rounded-full bg-secondary/20 flex items-center justify-center mx-auto">
              <span className="text-2xl">✓</span>
            </div>
            <h2 className="font-display text-xl font-bold text-foreground">Vente enregistrée</h2>
            <p className="text-sm text-muted-foreground">{issuedTickets.length} billet(s) — prêts à être présentés</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {issuedTickets.map((t) => (
              <div key={t.id} className="rounded-2xl border border-border bg-card p-4 text-center space-y-2">
                {qrImages[t.id] && <img src={qrImages[t.id]} alt={t.ticketNumber} className="mx-auto rounded-lg" />}
                <p className="text-xs font-mono font-bold text-foreground">{t.ticketNumber}</p>
              </div>
            ))}
          </div>

          <button
            onClick={startNewSale}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold shadow-md"
          >
            Nouvelle vente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <GateHeader />
      <div className="max-w-md mx-auto p-6 space-y-6">
        <h2 className="font-display text-lg font-bold text-foreground">Vendre un billet</h2>

        {!ticketType ? (
          <p className="text-sm text-muted-foreground">Aucun type de billet configuré pour cette porte.</p>
        ) : (
          <>
            <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-foreground">{ticketType.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {ticketType.price.toLocaleString("fr-FR")} {ticketType.currency}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="w-10 h-10 rounded-xl border border-border font-bold text-lg"
                >
                  −
                </button>
                <span className="text-2xl font-black w-12 text-center">{quantity}</span>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => q + 1)}
                  className="w-10 h-10 rounded-xl border border-border font-bold text-lg"
                >
                  +
                </button>
              </div>
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
              className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-bold shadow-md disabled:opacity-60"
            >
              {submitting ? "Enregistrement…" : "Confirmer la vente"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
