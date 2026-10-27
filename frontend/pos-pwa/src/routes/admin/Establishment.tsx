import { useEffect, useState } from "react";
import { useSession } from "../../context/SessionContext";
import { api } from "../../lib/api/client";
import type { AdminEstablishment, ReceiptMode } from "../../lib/api/types";

const RECEIPT_MODES: { value: ReceiptMode; label: string }[] = [
  { value: "STANDARD", label: "Standard (reçu unique par défaut)" },
  { value: "INDIVIDUAL_TICKETS", label: "Billets individuels par défaut" },
  { value: "CONFIGURABLE_PER_TICKET_TYPE", label: "Configurable par type de billet" },
];

export default function Establishment() {
  const { session } = useSession();
  const [data, setData] = useState<AdminEstablishment | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!session) return;
    api.getEstablishment(session.token).then(setData);
  }, [session]);

  if (!session || !data) return <p className="text-sm text-muted-foreground">Chargement…</p>;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(false);
    const updated = await api.updateEstablishment(session.token, {
      name: data.name,
      logoUrl: data.logoUrl,
      brandPrimaryColor: data.brandPrimaryColor,
      brandSecondaryColor: data.brandSecondaryColor,
      receiptMode: data.receiptMode,
    });
    setData(updated);
    setSaved(true);
  };

  return (
    <div className="space-y-6 max-w-md">
      <h1 className="font-display text-2xl font-bold text-foreground">Établissement</h1>

      <form onSubmit={handleSubmit} className="rounded-2xl border border-border bg-card p-5 space-y-4">
        {saved && <p className="text-sm text-secondary-foreground font-semibold">Enregistré ✓</p>}

        <div>
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1 block">Nom</label>
          <input
            required
            value={data.name}
            onChange={(e) => setData({ ...data, name: e.target.value })}
            className="w-full border border-input rounded-xl px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1 block">URL du logo</label>
          <input
            value={data.logoUrl ?? ""}
            onChange={(e) => setData({ ...data, logoUrl: e.target.value || null })}
            placeholder="https://…"
            className="w-full border border-input rounded-xl px-3 py-2 text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1 block">Couleur principale</label>
            <input
              value={data.brandPrimaryColor ?? ""}
              onChange={(e) => setData({ ...data, brandPrimaryColor: e.target.value || null })}
              className="w-full border border-input rounded-xl px-3 py-2 text-sm font-mono"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1 block">Couleur secondaire</label>
            <input
              value={data.brandSecondaryColor ?? ""}
              onChange={(e) => setData({ ...data, brandSecondaryColor: e.target.value || null })}
              className="w-full border border-input rounded-xl px-3 py-2 text-sm font-mono"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1 block">Mode de reçu par défaut</label>
          <select
            value={data.receiptMode}
            onChange={(e) => setData({ ...data, receiptMode: e.target.value as ReceiptMode })}
            className="w-full border border-input rounded-xl px-3 py-2 text-sm bg-background"
          >
            {RECEIPT_MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <button type="submit" className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-bold">
          Enregistrer
        </button>
      </form>
    </div>
  );
}
