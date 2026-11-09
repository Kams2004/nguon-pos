import { useEffect, useState } from "react";
import { RotateCw } from "lucide-react";
import { useI18n } from "../i18n";
import { desktopApp, isEdgeMode, isNewerVersion } from "../lib/platform";
import { edge } from "../lib/till/edgeClient";

const AUTO_RESTART_KEY = "nguon.update.autoRestartAt";

/**
 * Desktop tills: the local server installs new versions by itself, at a
 * quiet moment. On Ubuntu the open window keeps the previous screens until
 * it restarts — on the login screen (`auto`) that happens at once; during
 * a shift the cashier gets a button and restarts when it suits them.
 */
export function UpdateNotice({ auto = false, tone = "light" }: { auto?: boolean; tone?: "light" | "dark" }) {
  const { t } = useI18n();
  const [installed, setInstalled] = useState<string | null>(null);

  useEffect(() => {
    if (!isEdgeMode() || !desktopApp.available()) return;
    let stopped = false;
    const check = async () => {
      try {
        const [status, mine] = await Promise.all([edge.status(), desktopApp.version()]);
        if (stopped) return;
        const newer = isNewerVersion(status.appVersion, mine) ? status.appVersion : null;
        setInstalled(newer);
        if (newer && auto && recentAutoRestart() === false) {
          try {
            localStorage.setItem(AUTO_RESTART_KEY, String(Date.now()));
          } catch {
            /* storage unavailable: restart anyway */
          }
          desktopApp.restart();
        }
      } catch {
        /* the local server is restarting: try again later */
      }
    };
    check();
    const id = window.setInterval(check, 30_000);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [auto]);

  if (!installed) return null;
  return (
    <button
      onClick={() => desktopApp.restart()}
      className={
        tone === "light"
          ? "flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-bold text-primary-foreground hover:brightness-105"
          : "btn-gold w-full justify-center"
      }
      title={t("gate.update.restartHint", { version: installed })}
    >
      <RotateCw className="h-3.5 w-3.5" /> {t("gate.update.restart", { version: installed })}
    </button>
  );
}

/** At most one automatic restart every 10 minutes: never a restart loop. */
function recentAutoRestart(): boolean {
  try {
    const at = Number(localStorage.getItem(AUTO_RESTART_KEY) ?? 0);
    return Date.now() - at < 10 * 60_000;
  } catch {
    return false;
  }
}
