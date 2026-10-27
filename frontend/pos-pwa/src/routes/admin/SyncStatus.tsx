import { useEffect, useState } from "react";
import { useSession } from "../../context/SessionContext";
import { api } from "../../lib/api/client";
import type { AdminGate, TerminalStatus } from "../../lib/api/types";

export default function SyncStatus() {
  const { session } = useSession();
  const [terminals, setTerminals] = useState<TerminalStatus[]>([]);
  const [gates, setGates] = useState<AdminGate[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    if (!session) return;
    Promise.all([api.syncStatus(session.token), api.listGates(session.token)])
      .then(([t, g]) => {
        setTerminals(t);
        setGates(g);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  if (!session) return null;
  const gateName = (id: string) => gates.find((g) => g.id === id)?.name ?? id;

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold text-foreground">État de synchronisation</h1>
      <p className="text-sm text-muted-foreground">
        Chaque terminal envoie un signal périodique une fois en ligne, qu'il ait ou non des ventes à synchroniser —
        « hors-ligne » signifie qu'aucun signal n'a été reçu depuis plus de 2 minutes.
      </p>

      {loading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : terminals.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun terminal connu pour le moment.</p>
      ) : (
        <div className="space-y-2">
          {terminals.map((t) => (
            <div key={t.terminalId} className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
              <div>
                <p className="font-bold text-foreground">{gateName(t.gateId)}</p>
                <p className="text-xs font-mono text-muted-foreground">{t.terminalId}</p>
                <p className="text-xs text-muted-foreground">
                  Dernier signal : {new Date(t.lastSeenAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "medium" })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {t.localPendingCount > 0 && (
                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-muted text-muted-foreground">
                    {t.localPendingCount} en attente
                  </span>
                )}
                <span
                  className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                    t.online ? "bg-secondary/20 text-foreground" : "bg-destructive/10 text-destructive"
                  }`}
                >
                  {t.online ? "En ligne" : "Hors-ligne"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
