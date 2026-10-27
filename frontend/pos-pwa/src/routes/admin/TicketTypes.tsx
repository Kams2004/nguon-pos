import { useEffect, useState } from "react";
import { useSession } from "../../context/SessionContext";
import { api } from "../../lib/api/client";
import type { AdminGate, AdminTicketType, PrintMode } from "../../lib/api/types";

const PRINT_MODES: { value: PrintMode; label: string }[] = [
  { value: "INDIVIDUAL", label: "Individuel (1 billet par unité)" },
  { value: "STANDARD", label: "Standard (reçu unique)" },
  { value: "INHERIT_ESTABLISHMENT", label: "Hérité de l'établissement" },
];

export default function TicketTypes() {
  const { session } = useSession();
  const [types, setTypes] = useState<AdminTicketType[]>([]);
  const [gates, setGates] = useState<AdminGate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [gateId, setGateId] = useState<string>("");
  const [printMode, setPrintMode] = useState<PrintMode>("INDIVIDUAL");
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    if (!session) return;
    setLoading(true);
    Promise.all([api.listTicketTypesAdmin(session.token), api.listGates(session.token)])
      .then(([t, g]) => {
        setTypes(t);
        setGates(g);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, [session]);

  if (!session) return null;

  const gateName = (id: string | null) => (id ? gates.find((g) => g.id === id)?.name ?? "?" : "Toutes les portes");

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.createTicketType(session.token, {
        gateId: gateId || null,
        name,
        price: Number(price),
        currency: "XAF",
        printMode,
      });
      setName("");
      setPrice("");
      setShowForm(false);
      load();
    } catch {
      setError("Impossible de créer le type de billet.");
    }
  };

  const toggleActive = async (t: AdminTicketType) => {
    await api.setTicketTypeActive(session.token, t.id, !t.active);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-foreground">Types de billets</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="text-sm font-bold px-4 py-2 rounded-xl bg-primary text-primary-foreground"
        >
          + Nouveau type
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="rounded-2xl border border-border bg-card p-5 space-y-3 max-w-md">
          {error && <p className="text-sm text-destructive font-semibold">{error}</p>}
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1 block">Nom</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-input rounded-xl px-3 py-2 text-sm"
              placeholder="Entrée générale"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1 block">Prix (XAF)</label>
            <input
              required
              type="number"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full border border-input rounded-xl px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1 block">Porte</label>
            <select
              value={gateId}
              onChange={(e) => setGateId(e.target.value)}
              className="w-full border border-input rounded-xl px-3 py-2 text-sm bg-background"
            >
              <option value="">Toutes les portes</option>
              {gates.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1 block">Mode d'impression</label>
            <select
              value={printMode}
              onChange={(e) => setPrintMode(e.target.value as PrintMode)}
              className="w-full border border-input rounded-xl px-3 py-2 text-sm bg-background"
            >
              {PRINT_MODES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-bold">
            Créer
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : (
        <div className="space-y-2">
          {types.map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
              <div>
                <p className="font-bold text-foreground">{t.name}</p>
                <p className="text-xs text-muted-foreground">
                  {t.price.toLocaleString("fr-FR")} {t.currency} · {gateName(t.gateId)} · {t.printMode}
                </p>
              </div>
              <button
                onClick={() => toggleActive(t)}
                className={`text-xs font-bold px-3 py-1.5 rounded-full ${
                  t.active ? "bg-green-100 text-green-800" : "bg-muted text-muted-foreground"
                }`}
              >
                {t.active ? "Actif" : "Désactivé"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
