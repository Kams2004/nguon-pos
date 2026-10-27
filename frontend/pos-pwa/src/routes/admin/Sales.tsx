import { useEffect, useState } from "react";
import { useSession } from "../../context/SessionContext";
import { api } from "../../lib/api/client";
import type { TransactionSummary } from "../../lib/api/types";

export default function Sales() {
  const { session } = useSession();
  const [transactions, setTransactions] = useState<TransactionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [voidTarget, setVoidTarget] = useState<TransactionSummary | null>(null);
  const [voidReason, setVoidReason] = useState("");

  const load = () => {
    if (!session) return;
    setLoading(true);
    api.listTransactions(session.token).then((res) => setTransactions(res.content)).finally(() => setLoading(false));
  };

  useEffect(load, [session]);

  if (!session) return null;
  const canVoid = session.role === "SUPER_ADMIN" || session.role === "COORDINATOR";

  const handleVoid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidTarget) return;
    await api.voidTransaction(session.token, voidTarget.id, voidReason);
    setVoidTarget(null);
    setVoidReason("");
    load();
  };

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold text-foreground">Ventes</h1>

      {loading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : transactions.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune vente.</p>
      ) : (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground font-bold uppercase tracking-wide border-b border-border">
                <th className="px-4 py-2.5">Référence</th>
                <th className="px-4 py-2.5">Date</th>
                <th className="px-4 py-2.5">Paiement</th>
                <th className="px-4 py-2.5 text-right">Total</th>
                <th className="px-4 py-2.5">Statut</th>
                {canVoid && <th className="px-4 py-2.5" />}
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id} className="border-b border-border/50 last:border-0">
                  <td className="px-4 py-2.5 font-mono font-bold">{t.referenceNumber}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {new Date(t.createdAtClient).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                  </td>
                  <td className="px-4 py-2.5">{t.paymentMethod}</td>
                  <td className="px-4 py-2.5 text-right font-bold">
                    {t.totalAmount.toLocaleString("fr-FR")} {t.currency}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        t.status === "VOIDED" ? "bg-destructive/10 text-destructive" : "bg-green-100 text-green-800"
                      }`}
                    >
                      {t.status === "VOIDED" ? "Annulée" : "Complétée"}
                    </span>
                  </td>
                  {canVoid && (
                    <td className="px-4 py-2.5 text-right">
                      {t.status !== "VOIDED" && (
                        <button
                          onClick={() => setVoidTarget(t)}
                          className="text-xs font-bold text-destructive hover:underline"
                        >
                          Annuler
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {voidTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleVoid}
            className="w-full max-w-sm rounded-2xl bg-card border border-border p-6 space-y-4"
          >
            <h2 className="font-display font-bold text-lg">Annuler la vente {voidTarget.referenceNumber}</h2>
            <p className="text-sm text-muted-foreground">
              Cette action est tracée et irréversible. Le billet reste visible dans l'historique avec son motif.
            </p>
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1 block">Motif</label>
              <input
                required
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                className="w-full border border-input rounded-xl px-3 py-2 text-sm"
                placeholder="Erreur de saisie, remboursement…"
              />
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setVoidTarget(null)}
                className="flex-1 py-2.5 rounded-xl border border-border font-bold"
              >
                Annuler
              </button>
              <button type="submit" className="flex-1 py-2.5 rounded-xl bg-destructive text-white font-bold">
                Confirmer
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
