import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { useSession } from "../../context/SessionContext";
import { useBranding } from "../../context/BrandingContext";
import { useI18n } from "../../i18n";
import { EdgeError } from "../../lib/till/edgeClient";
import { EnrollmentBanner } from "../../components/EnrollmentBanner";
import { UpdateNotice } from "../../components/UpdateNotice";
import { LanguageSwitcher } from "../../components/LanguageSwitcher";

const REMEMBER_KEY = "nguon-pos.rememberedUsername";

function readRemembered(): string {
  try {
    return localStorage.getItem(REMEMBER_KEY) ?? "";
  } catch {
    return "";
  }
}

export default function Login() {
  const { t } = useI18n();
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
    } catch (err) {
      const code = err instanceof EdgeError ? err.code : "";
      const known = ["FIRST_LOGIN_NEEDS_NETWORK", "TOO_MANY_ATTEMPTS", "OTHER_GATE", "NO_GATE_ASSIGNED", "EDGE_UNREACHABLE"] as const;
      const match = known.find((k) => k === code);
      setError(match ? t(`shell.login.error.${match}`) : t("shell.login.invalid"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-royal-deep">
      {/* Full-bleed: the Sultan's palace in Foumban (from the Nguon website), fading into the brand blue */}
      <img src={loginBackgroundUrl} alt="" className="absolute inset-0 h-full w-full object-cover object-[60%_center] opacity-90" />
      <div className="absolute inset-0 bg-gradient-to-r from-royal-deep/95 via-royal/70 to-transparent" />
      <div
        className="pointer-events-none absolute -bottom-10 -left-10 h-72 w-72 bg-cover opacity-70"
        style={{ backgroundImage: "url(/img/diamond-pattern.svg)" }}
      />

      <div className="absolute right-5 top-5 z-10 sm:right-8 sm:top-8">
        <LanguageSwitcher tone="light" />
      </div>

      <div className="relative flex min-h-screen flex-col justify-center gap-8 px-5 py-10 sm:px-12 lg:px-20">
        <div className="flex items-center gap-4 text-white">
          <img src={logoUrl} alt="Nguon" className="h-16 w-16 rounded-xl bg-white object-contain p-1 shadow-lg" />
          <div>
            <p className="font-display text-3xl font-extrabold leading-none tracking-wide sm:text-4xl">NGUON</p>
            <p className="font-display text-3xl font-extrabold leading-none tracking-wide sm:text-4xl">FESTIVAL</p>
          </div>
        </div>
        <div className="-mt-4 text-white/90">
          <p className="font-display text-lg font-bold">{t("shell.brand.tagline")}</p>
          <p className="text-sm">{t("shell.brand.heritage")}</p>
        </div>

        <form onSubmit={handleSubmit} className="w-full max-w-md space-y-5 rounded-3xl bg-white p-7 shadow-2xl shadow-black/30 sm:p-8">
          <div>
            <h1 className="font-display text-3xl font-bold text-royal">{t("shell.login.welcome")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("shell.login.intro")}</p>
          </div>

          <EnrollmentBanner />
          <UpdateNotice auto tone="dark" />
          {error && <div className="rounded-xl bg-red-50 px-4 py-3 text-center text-sm font-semibold text-destructive">{error}</div>}

          <div>
            <label className="field-label">{t("shell.login.username")}</label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="field py-3"
              autoComplete="username"
              placeholder={t("shell.login.usernamePlaceholder")}
            />
          </div>
          <div>
            <label className="field-label">{t("shell.login.password")}</label>
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
                aria-label={showPassword ? t("shell.login.hidePassword") : t("shell.login.showPassword")}
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
            {t("shell.login.remember")}
          </label>

          <button type="submit" disabled={loading} className="btn-gold w-full py-3.5 text-base">
            {loading ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                {t("shell.login.submitting")}
              </>
            ) : (
              <>
                {t("shell.login.submit")} <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
