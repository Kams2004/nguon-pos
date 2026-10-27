import { useEffect, useState } from "react";
import { useSession } from "../../context/SessionContext";
import { api } from "../../lib/api/client";
import type { AdminGate, AdminUser, Role } from "../../lib/api/types";

const ROLES: Role[] = ["CASHIER", "COORDINATOR", "SUPER_ADMIN"];

export default function Users() {
  const { session } = useSession();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [gates, setGates] = useState<AdminGate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<Role>("CASHIER");
  const [gateId, setGateId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    if (!session) return;
    setLoading(true);
    Promise.all([api.listUsers(session.token), api.listGates(session.token)])
      .then(([u, g]) => {
        setUsers(u);
        setGates(g);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, [session]);

  if (!session) return null;

  const gateName = (id: string | null) => (id ? gates.find((g) => g.id === id)?.name ?? "?" : "—");

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.createUser(session.token, {
        username,
        password,
        fullName,
        role,
        assignedGateId: role === "SUPER_ADMIN" ? null : gateId || null,
      });
      setUsername("");
      setPassword("");
      setFullName("");
      setShowForm(false);
      load();
    } catch {
      setError("Impossible de créer l'utilisateur (identifiant déjà utilisé ?).");
    }
  };

  const toggleActive = async (u: AdminUser) => {
    await api.updateUser(session.token, u.id, {
      fullName: u.fullName,
      role: u.role,
      assignedGateId: u.assignedGateId,
      active: !u.active,
    });
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-foreground">Utilisateurs</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="text-sm font-bold px-4 py-2 rounded-xl bg-primary text-primary-foreground"
        >
          + Nouvel utilisateur
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="rounded-2xl border border-border bg-card p-5 space-y-3 max-w-md">
          {error && <p className="text-sm text-destructive font-semibold">{error}</p>}
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1 block">Nom complet</label>
            <input
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full border border-input rounded-xl px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1 block">Identifiant</label>
            <input
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full border border-input rounded-xl px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1 block">Mot de passe</label>
            <input
              required
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-input rounded-xl px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1 block">Rôle</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="w-full border border-input rounded-xl px-3 py-2 text-sm bg-background"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          {role !== "SUPER_ADMIN" && (
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1 block">Porte assignée</label>
              <select
                value={gateId}
                onChange={(e) => setGateId(e.target.value)}
                className="w-full border border-input rounded-xl px-3 py-2 text-sm bg-background"
              >
                <option value="">—</option>
                {gates.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button type="submit" className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-bold">
            Créer
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : (
        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.id} className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
              <div>
                <p className="font-bold text-foreground">{u.fullName}</p>
                <p className="text-xs text-muted-foreground">
                  {u.username} · {u.role} · {gateName(u.assignedGateId)}
                </p>
              </div>
              <button
                onClick={() => toggleActive(u)}
                className={`text-xs font-bold px-3 py-1.5 rounded-full ${
                  u.active ? "bg-secondary/20 text-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                {u.active ? "Actif" : "Désactivé"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
