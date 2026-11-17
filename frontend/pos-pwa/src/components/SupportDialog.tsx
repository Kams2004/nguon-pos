import { useEffect, useState } from "react";
import { CheckCircle2, Download, LifeBuoy, TriangleAlert } from "lucide-react";
import { useI18n, type MessageKey } from "../i18n";
import { desktopApp, isEdgeMode } from "../lib/platform";
import { edge, type EdgeDiagnostics } from "../lib/till/edgeClient";
import { formatDateTime } from "../lib/format";
import { Modal, Skeleton } from "./ui";

/**
 * Desktop tills: this till's state at a glance, and a support export (state
 * + recent logs, no secret) saved to Downloads, to send to the support team.
 * Reachable from the till header and from the login screen — support matters
 * most when nobody can log in.
 */
export function SupportDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const [d, setD] = useState<EdgeDiagnostics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedTo, setSavedTo] = useState<string | null>(null);

  useEffect(() => {
    edge
      .diagnostics()
      .then(setD)
      .catch(() => setError(t("support.unreachable")));
  }, [t]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const { name, bytes } = await edge.diagnosticsZip();
      if (desktopApp.available()) {
        setSavedTo(await desktopApp.saveDownload(name, bytes));
      } else {
        // Development in a browser: an ordinary download.
        const url = URL.createObjectURL(new Blob([bytes], { type: "application/zip" }));
        const a = Object.assign(document.createElement("a"), { href: url, download: name });
        a.click();
        URL.revokeObjectURL(url);
        setSavedTo(name);
      }
    } catch {
      setError(t("support.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const pending = d ? d.pendingSales + d.pendingScans : 0;
  const rows: [string, string, "ok" | "warn" | "plain"][] = d
    ? [
        [t("support.till"), [d.deviceLabel, d.gate].filter(Boolean).join(" · ") || d.deviceCode, "plain"],
        [t("support.version"), d.appVersion, "plain"],
        [t("support.server"), d.connectedToCentral ? t("common.online") : t("common.offline"), d.connectedToCentral ? "ok" : "warn"],
        [
          t("support.pending"),
          pending === 0
            ? t("support.nothingPending")
            : t("support.pendingDetail", { count: pending, since: d.oldestPending ? formatDateTime(d.oldestPending) : "—" }),
          pending === 0 ? "ok" : "warn",
        ],
        [t("support.rejected"), d.rejected.length === 0 ? "0" : String(d.rejected.length), d.rejected.length === 0 ? "ok" : "warn"],
        [
          t("support.peers"),
          d.peers.length === 0
            ? "—"
            : t("support.peersDetail", { connected: d.peers.filter((p) => p.connected).length, count: d.peers.length }),
          "plain",
        ],
        [
          t("support.update"),
          `${t(`support.updateState.${d.update.state}` as MessageKey)}${d.update.targetVersion ? ` (${d.update.targetVersion})` : ""}${d.update.error ? ` — ${d.update.error}` : ""}`,
          d.update.error ? "warn" : "plain",
        ],
        [t("support.disk"), d.disk ? `${Math.round(d.disk.freeMb / 1024)} Go` : "—", d.disk && d.disk.freeMb < 1024 ? "warn" : "plain"],
      ]
    : [];

  return (
    <Modal title={t("support.title")} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{t("support.intro")}</p>
        {d === null && !error ? (
          <div className="space-y-2.5" aria-busy="true">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        ) : (
          d && (
            <dl className="divide-y divide-border/70 rounded-xl ring-1 ring-border">
              {rows.map(([label, value, tone]) => (
                <div key={label} className="flex items-baseline justify-between gap-4 px-3.5 py-2 text-sm">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd
                    className={`text-right font-semibold ${tone === "ok" ? "text-success" : tone === "warn" ? "text-amber-700" : "text-foreground"}`}
                  >
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          )
        )}
        {error && (
          <p className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-destructive">
            <TriangleAlert className="mt-0.5 h-4 w-4 flex-shrink-0" /> {error}
          </p>
        )}
        {savedTo ? (
          <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900 ring-1 ring-emerald-200">
            <p className="flex items-center gap-2 font-semibold">
              <CheckCircle2 className="h-4 w-4" /> {t("support.saved")}
            </p>
            <p className="mt-1 break-all font-mono text-xs">{savedTo}</p>
            <p className="mt-1.5 text-xs">{t("support.sendIt")}</p>
          </div>
        ) : (
          <button onClick={save} disabled={saving} className="btn-blue w-full py-3">
            <Download className="h-4 w-4" /> {saving ? t("support.saving") : t("support.save")}
          </button>
        )}
      </div>
    </Modal>
  );
}

/** The header / login-screen button that opens it (desktop tills only). */
export function SupportButton({ tone = "header" }: { tone?: "header" | "link" }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  if (!isEdgeMode()) return null;
  return (
    <>
      {tone === "header" ? (
        <button
          onClick={() => setOpen(true)}
          className="rounded-lg bg-white/10 p-2 text-white hover:bg-white/20"
          aria-label={t("support.title")}
          title={t("support.title")}
        >
          <LifeBuoy className="h-4 w-4" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mx-auto flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-secondary"
        >
          <LifeBuoy className="h-3.5 w-3.5" /> {t("support.loginLink")}
        </button>
      )}
      {open && <SupportDialog onClose={() => setOpen(false)} />}
    </>
  );
}
