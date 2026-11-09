import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { DoorOpen } from "lucide-react";
import { useLiveRefresh, useSession } from "../../context/SessionContext";
import { useI18n } from "../../i18n";
import { api, errorMessage } from "../../lib/api/client";
import type { Device } from "../../lib/api/types";
import { formatDateTime } from "../../lib/format";
import { isNewerVersion } from "../../lib/platform";
import { useCatalog } from "../../lib/useCatalog";
import { CardHeader, Loading, PageHeader, Pill, RefreshButton } from "../../components/ui";
import { ReleasesCard } from "./Releases";

/**
 * Mises à jour: the version the tills run, and the technical side of every
 * till ever enrolled (version, system, certificate). Setting tills up —
 * enrolling, revoking, who uses them — is done per gate in Portes & caisses.
 */
export default function Devices() {
  const { t } = useI18n();
  const { session } = useSession();
  const { gateName } = useCatalog();
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const [d, r] = await Promise.all([api.listDevices(session.token), api.listReleases(session.token).catch(() => null)]);
      setDevices(d);
      setTarget(r?.targetVersion ?? null);
    } catch (e) {
      setError(errorMessage(e));
      setDevices([]);
    }
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);
  useLiveRefresh(["TERMINAL_STATUS", "AUDIT"], load);

  if (!session) return null;
  const sorted = [...(devices ?? [])].sort((a, b) =>
    a.status !== b.status
      ? a.status === "ACTIVE"
        ? -1
        : 1
      : gateName(a.gateId).localeCompare(gateName(b.gateId)) || a.deviceNo - b.deviceNo,
  );

  return (
    <>
      <PageHeader
        title={t("settings.updates.title")}
        subtitle={t("settings.updates.subtitle")}
        actions={
          <>
            <Link to="/admin/gates" className="btn-outline">
              <DoorOpen className="h-4 w-4" /> {t("settings.updates.manageTills")}
            </Link>
            <RefreshButton onRefresh={load} />
          </>
        }
      />

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-destructive">{error}</p>}

      <ReleasesCard devices={devices} />

      <div className="card overflow-hidden">
        <CardHeader title={t("settings.devices.listTitle", { count: devices?.filter((d) => d.status === "ACTIVE").length ?? 0 })} />
        {devices === null ? (
          <Loading rows={4} cols={6} />
        ) : devices.length === 0 ? (
          <p className="px-5 pb-6 text-sm text-muted-foreground">{t("settings.updates.empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-y border-border bg-muted/40">
                <tr>
                  <th className="th">{t("settings.devices.col.till")}</th>
                  <th className="th">{t("settings.devices.col.gate")}</th>
                  <th className="th">{t("settings.devices.col.status")}</th>
                  <th className="th">{t("settings.devices.col.version")}</th>
                  <th className="th">{t("settings.updates.col.system")}</th>
                  <th className="th">{t("settings.devices.col.cert")}</th>
                  <th className="th">{t("settings.devices.col.enrolled")}</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((d) => {
                  const behind = d.status === "ACTIVE" && target !== null && isNewerVersion(target, d.appVersion);
                  return (
                    <tr
                      key={d.id}
                      className={`border-b border-border/60 last:border-0 ${d.status === "REVOKED" ? "text-muted-foreground" : ""}`}
                    >
                      <td className="td">
                        <p className="font-semibold">{d.label}</p>
                        <p className="text-xs text-muted-foreground">{t("settings.devices.number", { n: d.deviceNo })}</p>
                      </td>
                      <td className="td">{gateName(d.gateId)}</td>
                      <td className="td">
                        {d.status === "REVOKED" ? (
                          <Pill tone="neutral">{t("settings.devices.revoked")}</Pill>
                        ) : d.online ? (
                          <Pill tone="success" dot>
                            {t("common.online")}
                          </Pill>
                        ) : (
                          <Pill tone="danger" dot>
                            {t("common.offline")}
                          </Pill>
                        )}
                      </td>
                      <td className="td tabular-nums">
                        {d.appVersion ?? "—"}
                        {behind && (
                          <span className="ml-2 align-middle">
                            <Pill tone="warning">{t("settings.updates.toUpdate", { version: target! })}</Pill>
                          </span>
                        )}
                      </td>
                      <td className="td text-xs text-muted-foreground">{d.os ?? "—"}</td>
                      <td className="td text-muted-foreground">{formatDateTime(d.certNotAfter)}</td>
                      <td className="td text-muted-foreground">{formatDateTime(d.enrolledAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
