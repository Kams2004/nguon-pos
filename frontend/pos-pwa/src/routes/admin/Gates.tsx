import { useEffect, useState } from "react";
import { useSession } from "../../context/SessionContext";
import { api } from "../../lib/api/client";
import type { AdminGate } from "../../lib/api/types";

export default function Gates() {
  const { session } = useSession();
  const [gates, setGates] = useState<AdminGate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    if (!session) return;
    setLoading(true);
    api.listGates(session.token).then(setGates).finally(() => setLoading(false));
  };

  useEffect(load, [session]);

  if (!session) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.createGate(session.token, name, code);
      setName("");
      setCode("");
      setShowForm(false);
      load();
    } catch {
      setError("Impossible de créer la porte (code déjà utilisé ?).");
    }
  };

  const toggleActive = async (gate: AdminGate) => {
    await api.updateGate(session.token, gate.id, gate.name, !gate.active);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-foreground">Portes</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="text-sm font-bold px-4 py-2 rounded-xl bg-primary text-primary-foreground"
        >
          + Nouvelle porte
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
              placeholder="Porte C"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1 block">Code</label>
            <input
              required
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="w-full border border-input rounded-xl px-3 py-2 text-sm font-mono"
              placeholder="GATE-C"
            />
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
          {gates.map((g) => (
            <div key={g.id} className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
              <div>
                <p className="font-bold text-foreground">{g.name}</p>
                <p className="text-xs font-mono text-muted-foreground">{g.code}</p>
              </div>
              <button
                onClick={() => toggleActive(g)}
                className={`text-xs font-bold px-3 py-1.5 rounded-full ${
                  g.active ? "bg-green-100 text-green-800" : "bg-muted text-muted-foreground"
                }`}
              >
                {g.active ? "Active" : "Désactivée"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
