import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { useSession } from "../../context/SessionContext";
import { useBranding } from "../../context/BrandingContext";

const REMEMBER_KEY = "nguon-pos.rememberedUsername";

function readRemembered(): string {
  try {
    return localStorage.getItem(REMEMBER_KEY) ?? "";
  } catch {
    return "";
  }
}

export default function Login() {
  const { login } = useSession();
  const { logoUrl, loginBackgroundUrl } = useBranding();
  const navigate = useNavigate();
  const [username, setUsername] = useState(readRemembered);
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(() => readRemembered() !== "");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const session = await login(username, password);
      // Only the username is remembered — never the password.
      try {
        if (remember) localStorage.setItem(REMEMBER_KEY, username);
        else localStorage.removeItem(REMEMBER_KEY);
      } catch {
        /* storage unavailable: nothing to remember */
      }
      navigate(session.assignedGateId ? "/gate/sell" : "/admin/dashboard");
    } catch {
      setError("Identifiants invalides.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-royal-deep">
      {/* Full-bleed festival artwork: palace + royal dancer, blue sky fading into the brand blue */}
      <img
        src={loginBackgroundUrl}
        alt=""
        className="absolute inset-0 h-full w-full object-cover object-[70%_center] opacity-90"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-royal-deep/95 via-royal/70 to-transparent" />
      <div
        className="pointer-events-none absolute -bottom-10 -left-10 h-72 w-72 bg-cover opacity-70"
        style={{ backgroundImage: "url(/img/diamond-pattern.svg)" }}
      />

      <div className="relative flex min-h-screen flex-col justify-center gap-8 px-5 py-10 sm:px-12 lg:px-20">
        <div className="flex items-center gap-4 text-white">
          <img src={logoUrl} alt="Nguon" className="h-16 w-16 rounded-xl bg-white object-contain p-1 shadow-lg" />
          <div>
            <p className="font-display text-3xl font-extrabold leading-none tracking-wide sm:text-4xl">NGUON</p>
            <p className="font-display text-3xl font-extrabold leading-none tracking-wide sm:text-4xl">FESTIVAL</p>
          </div>
        </div>
        <div className="-mt-4 text-white/90">
          <p className="font-display text-lg font-bold">Le NGUON</p>
          <p className="text-sm">Patrimoine Culturel du Royaume Bamoun</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="w-full max-w-md space-y-5 rounded-3xl bg-white p-7 shadow-2xl shadow-black/30 sm:p-8"
        >
          <div>
            <h1 className="font-display text-3xl font-bold text-royal">Bienvenue</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Connectez-vous pour accéder à la billetterie et à la gestion du NGUON.
            </p>
          </div>

          {error && <div className="rounded-xl bg-red-50 px-4 py-3 text-center text-sm font-semibold text-destructive">{error}</div>}

          <div>
            <label className="field-label">Nom d'utilisateur</label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="field py-3"
              autoComplete="username"
              placeholder="caissier1"
            />
          </div>
          <div>
            <label className="field-label">Mot de passe</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="field py-3 pr-12"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-secondary"
                aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-4 w-4 rounded accent-[hsl(var(--secondary))]"
            />
            Se souvenir de moi
          </label>

          <button type="submit" disabled={loading} className="btn-gold w-full py-3.5 text-base">
            {loading ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                Connexion…
              </>
            ) : (
              <>
                Se connecter <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
