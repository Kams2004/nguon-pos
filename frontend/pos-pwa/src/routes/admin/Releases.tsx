import { useCallback, useEffect, useState } from "react";
import { Download, PauseCircle, Rocket } from "lucide-react";
import { useLiveRefresh, useSession } from "../../context/SessionContext";
import { useConfirm } from "../../context/ConfirmContext";
import { useI18n } from "../../i18n";
import { api, errorMessage } from "../../lib/api/client";
import type { Device, Release, ReleaseOverview } from "../../lib/api/types";
import { formatDateTime } from "../../lib/format";
import { CardHeader, Loading, Pill } from "../../components/ui";

const PLATFORM_LABEL: Record<string, string> = { "linux-deb": "Ubuntu", "windows-nsis": "Windows" };

/**
 * Till versions: which one the establishment's tills run. Publishing a
 * version makes every connected till download it, check its signature and
 * install it at a quiet moment; freezing keeps them where they are (e.g.
 * during the festival). Versions are added by deploy/release/publish-release.sh.
 */
export function ReleasesCard({ devices }: { devices: Device[] | null }) {
  const { t } = useI18n();
  const { session } = useSession();
  const confirm = useConfirm();
  const [data, setData] = useState<ReleaseOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isSuperAdmin = session?.role === "SUPER_ADMIN";

  const load = useCallback(async () => {
    if (!session) return;
    try {
      setData(await api.listReleases(session.token));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);
  useLiveRefresh(["AUDIT"], load);

  if (!session) return null;

  const active = (devices ?? []).filter((d) => d.status === "ACTIVE");
  const onVersion = (v: string) => active.filter((d) => d.appVersion === v).length;
  const target = data?.targetVersion ?? null;

  const choose = async (version: string | null) => {
    const ok = await confirm(
      version
        ? {
            title: t("settings.releases.publishTitle", { version }),
            message: t("settings.releases.publishMessage", { count: active.length }),
            confirmLabel: t("settings.releases.publish"),
          }
        : {
            title: t("settings.releases.freezeTitle"),
            message: t("settings.releases.freezeMessage"),
            confirmLabel: t("settings.releases.freeze"),
          },
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      setData(await api.setReleaseTarget(session.token, version));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  /** The version's installers, as download buttons. */
  const downloads = (r: Release, wrap = true) => (
    <div className={`flex gap-1.5 ${wrap ? "flex-wrap" : ""}`}>
      {r.files.map((f) => {
        const file = f.url.split("/").pop() ?? "";
        return (
          <a
            key={f.platform}
            href={f.url}
            download={file}
            title={t("settings.releases.downloadTitle", { file, sha: f.sha256 })}
            className="btn-outline whitespace-nowrap px-2.5 py-1 text-xs"
          >
            <Download className="h-3.5 w-3.5" /> {PLATFORM_LABEL[f.platform] ?? f.platform}
            <span className="font-normal text-muted-foreground">
              · {t("settings.releases.size", { mb: f.size < 1_000_000 ? "< 1" : Math.round(f.size / 1_000_000) })}
            </span>
          </a>
        );
      })}
    </div>
  );

  /** "Déployée", or the button that publishes this version to the tills. */
  const action = (version: string) =>
    !isSuperAdmin ? null : version === target ? (
      <Pill tone="success">{t("settings.releases.current")}</Pill>
    ) : (
      <button onClick={() => choose(version)} disabled={busy} className="btn-outline whitespace-nowrap px-3 py-1.5 text-xs">
        <Rocket className="h-3.5 w-3.5" /> {t("settings.releases.publish")}
      </button>
    );

  return (
    <div className="card overflow-hidden">
      <CardHeader
        title={t("settings.releases.title")}
        action={
          data &&
          (target ? (
            <div className="flex items-center gap-2">
              <Pill tone="success" dot>
                {t("settings.releases.deployed", { version: target })}
              </Pill>
              {isSuperAdmin && (
                <button onClick={() => choose(null)} disabled={busy} className="btn-outline px-3 py-1.5 text-xs">
                  <PauseCircle className="h-3.5 w-3.5" /> {t("settings.releases.freeze")}
                </button>
              )}
            </div>
          ) : (
            <Pill tone="neutral">{t("settings.releases.frozen")}</Pill>
          ))
        }
      />
      <p className="max-w-[75ch] px-5 pb-4 text-sm text-muted-foreground">{t("settings.releases.intro")}</p>
      {error && <p className="mx-5 mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-destructive">{error}</p>}
      {data === null ? (
        !error && <Loading />
      ) : data.releases.length === 0 ? (
        <p className="px-5 pb-6 text-sm text-muted-foreground">{t("settings.releases.empty")}</p>
      ) : (
        <>
          {/* Phones and tablets: one card per version. */}
          <ul className="divide-y divide-border/70 border-t border-border xl:hidden">
            {data.releases.map((r) => (
              <li key={r.version} className="space-y-3 px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold tabular-nums">{r.version}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(r.createdAt)} · {t("settings.releases.tillsOn", { count: onVersion(r.version), total: active.length })}
                    </p>
                  </div>
                  {action(r.version)}
                </div>
                {r.notes && <p className="text-xs text-muted-foreground">{r.notes}</p>}
                {downloads(r)}
              </li>
            ))}
          </ul>

          {/* Wide screens: the table. */}
          <div className="hidden xl:block">
            <table className="w-full text-sm">
              <thead className="border-y border-border bg-muted/40">
                <tr>
                  <th className="th">{t("settings.releases.col.version")}</th>
                  <th className="th">{t("settings.releases.col.systems")}</th>
                  <th className="th">{t("settings.releases.col.tills")}</th>
                  <th className="th">{t("settings.releases.col.added")}</th>
                  {isSuperAdmin && <th className="th" />}
                </tr>
              </thead>
              <tbody>
                {data.releases.map((r) => (
                  <tr key={r.version} className="border-b border-border/60 last:border-0">
                    <td className="td w-full whitespace-normal">
                      <p className="font-semibold tabular-nums">{r.version}</p>
                      {r.notes && (
                        // Long notes: two lines here, the whole text on hover.
                        <p title={r.notes} className="line-clamp-2 max-w-[60ch] text-xs text-muted-foreground">
                          {r.notes}
                        </p>
                      )}
                    </td>
                    <td className="td">{downloads(r, false)}</td>
                    <td className="td tabular-nums text-muted-foreground">
                      {t("settings.releases.tillsOn", { count: onVersion(r.version), total: active.length })}
                    </td>
                    <td className="td text-muted-foreground">{formatDateTime(r.createdAt)}</td>
                    {isSuperAdmin && <td className="td text-right">{action(r.version)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
