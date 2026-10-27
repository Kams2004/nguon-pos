import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "../../context/SessionContext";

export default function Login() {
  const { login } = useSession();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const session = await login(username, password);
      // A gateless user (SUPER_ADMIN, and potentially COORDINATOR) has no
      // gate terminal to operate — send them straight to the admin area.
      navigate(session.assignedGateId ? "/gate/sell" : "/admin/sales");
    } catch {
      setError("Identifiants invalides.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-[2rem] border border-border bg-card p-8 shadow-lg space-y-5"
      >
        <div className="text-center space-y-1">
          <img src="/logo.png" alt="Nguon" className="h-16 mx-auto mb-3" />
          <h1 className="font-display text-xl font-bold text-foreground">Nguon POS</h1>
          <p className="text-sm text-muted-foreground">Connexion à la porte</p>
        </div>

        {error && (
          <div className="rounded-lg bg-destructive/10 text-destructive text-sm font-semibold px-4 py-2.5 text-center">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">
              Identifiant
            </label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full border border-input rounded-xl px-4 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
              autoComplete="username"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">
              Mot de passe
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-input rounded-xl px-4 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
              autoComplete="current-password"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold shadow-md disabled:opacity-60"
        >
          {loading ? "Connexion…" : "Se connecter"}
        </button>
      </form>
    </div>
  );
}
