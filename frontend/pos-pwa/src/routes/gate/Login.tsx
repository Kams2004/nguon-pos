import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "../../context/SessionContext";

export default function Login() {
  const { login } = useSession();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const session = await login(username, password);
      navigate(session.assignedGateId ? "/gate/sell" : "/admin/sales");
    } catch {
      setError("Identifiants invalides.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      {/* Hero — hidden on small screens, the gate laptop's own branding moment */}
      <div className="hidden lg:block relative overflow-hidden">
        <img src="/img/login-hero.jpg" alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-[hsl(220,30%,8%)] via-[hsl(215,50%,14%)]/80 to-[hsl(215,50%,22%)]/40" />
        <div
          className="absolute inset-0 opacity-20 mix-blend-soft-light"
          style={{ backgroundImage: "url(/img/diamond-pattern.svg)", backgroundSize: "220px" }}
        />
        <div className="relative h-full flex flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Nguon" className="h-12 drop-shadow-lg" />
            <div>
              <p className="font-display font-black text-xl tracking-wide">NGUON POS</p>
              <p className="text-xs text-white/70 uppercase tracking-[0.2em]">Billetterie des portes</p>
            </div>
          </div>
          <div className="space-y-3 max-w-sm">
            <h1 className="font-display text-4xl font-black leading-tight">
              Festival Nguon<br />2026
            </h1>
            <p className="text-white/80 text-sm leading-relaxed">
              Vente et validation des billets d'entrée, en ligne comme hors-ligne — chaque vente est enregistrée
              immédiatement et synchronisée dès que la connexion revient.
            </p>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="flex items-center justify-center p-6 sm:p-10 relative">
        <div
          className="absolute inset-0 opacity-[0.12] pointer-events-none lg:hidden"
          style={{ backgroundImage: "url(/img/diamond-pattern.svg)", backgroundSize: "180px" }}
        />
        <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-7 relative">
          <div className="text-center lg:text-left space-y-1">
            <img src="/logo.png" alt="Nguon" className="h-14 mx-auto lg:hidden mb-4" />
            <h2 className="font-display text-2xl font-black text-foreground">Bienvenue</h2>
            <p className="text-sm text-muted-foreground">Connectez-vous pour accéder à votre porte.</p>
          </div>

          {error && (
            <div className="rounded-xl bg-destructive/10 text-destructive text-sm font-semibold px-4 py-3 text-center">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                Identifiant
              </label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full border border-input rounded-2xl px-4 py-3 text-sm bg-card shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                autoComplete="username"
                placeholder="cashier1"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                Mot de passe
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border border-input rounded-2xl px-4 py-3 text-sm bg-card shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all pr-12"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground hover:text-primary"
                >
                  {showPassword ? "Masquer" : "Voir"}
                </button>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-2xl bg-primary text-primary-foreground font-bold shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/25 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <span className="w-4 h-4 rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground animate-spin" />
                Connexion…
              </>
            ) : (
              "Se connecter"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
