import { useEffect, useState } from "react";

type ServiceKey = "auth" | "catalog" | "sales";

type ServiceStatus = "checking" | "up" | "down";

const SERVICES: { key: ServiceKey; label: string; path: string }[] = [
  { key: "auth", label: "auth-service", path: "/api/auth/actuator/health" },
  { key: "catalog", label: "catalog-service", path: "/api/catalog/actuator/health" },
  { key: "sales", label: "sales-service", path: "/api/sales/actuator/health" },
];

// Milestone 0: this screen's only job is to prove the deploy path end to
// end — PWA installable + each backend service reachable through nginx's
// path-based routing. Real gate/admin screens replace this in Milestone 1+.
function App() {
  const [statuses, setStatuses] = useState<Record<ServiceKey, ServiceStatus>>({
    auth: "checking",
    catalog: "checking",
    sales: "checking",
  });

  useEffect(() => {
    SERVICES.forEach(({ key, path }) => {
      fetch(path)
        .then((res) => setStatuses((prev) => ({ ...prev, [key]: res.ok ? "up" : "down" })))
        .catch(() => setStatuses((prev) => ({ ...prev, [key]: "down" })));
    });
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-[2rem] border border-border bg-card p-8 shadow-lg text-center space-y-6">
        <img src="/logo.png" alt="Nguon" className="h-20 mx-auto" />
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Nguon POS</h1>
          <p className="text-muted-foreground text-sm mt-1">Billetterie des portes — Milestone 0</p>
        </div>

        <div className="space-y-2 text-left">
          {SERVICES.map(({ key, label }) => (
            <div
              key={key}
              className="flex items-center justify-between rounded-lg border border-border px-4 py-2.5"
            >
              <span className="text-sm font-semibold text-foreground">{label}</span>
              <StatusPill status={statuses[key]} />
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          Ouvrez cette page hors-ligne après la première visite pour confirmer que
          l'application reste installable et se charge sans connexion.
        </p>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: ServiceStatus }) {
  const styles: Record<ServiceStatus, string> = {
    checking: "bg-muted text-muted-foreground",
    up: "bg-secondary/20 text-foreground",
    down: "bg-destructive/10 text-destructive",
  };
  const labels: Record<ServiceStatus, string> = {
    checking: "Vérification…",
    up: "En ligne",
    down: "Injoignable",
  };
  return (
    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

export default App;
