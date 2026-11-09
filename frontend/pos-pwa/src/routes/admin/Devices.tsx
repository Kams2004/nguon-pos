import { useCallback, useEffect, useState } from "react";
import { KeyRound, MonitorSmartphone, ShieldOff } from "lucide-react";
import { useLiveRefresh, useSession } from "../../context/SessionContext";
import { useConfirm } from "../../context/ConfirmContext";
import { useI18n } from "../../i18n";
import { api, errorMessage } from "../../lib/api/client";
import type { Device, EnrollmentCode } from "../../lib/api/types";
import { formatDateTime } from "../../lib/format";
import { useCatalog } from "../../lib/useCatalog";
import { CardHeader, Loading, PageHeader, Pill, RefreshButton } from "../../components/ui";

/** Desktop tills: enrollment codes, what is installed where, revocation. */
export default function Devices() {
  const { t } = useI18n();
  const { session } = useSession();
  const confirm = useConfirm();
  const { gates, gateName } = useCatalog();
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [gateId, setGateId] = useState("");
  const [label, setLabel] = useState("");
  const [code, setCode] = useState<EnrollmentCode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isSuperAdmin = session?.role === "SUPER_ADMIN";

  const load = useCallback(async () => {
    if (!session) return;
    try {
      setDevices(await api.listDevices(session.token));
    } catch (e) {
      setError(errorMessage(e));
      setDevices([]);
    }
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);
  useLiveRefresh(["TERMINAL_STATUS", "AUDIT"], load);

  useEffect(() => {
    if (!gateId && gates.length > 0) setGateId(gates[0].id);
  }, [gates, gateId]);

  if (!session) return null;

  const generate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      setCode(await api.createEnrollmentCode(session.token, gateId, label.trim()));
      setLabel("");
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const revoke = async (d: Device) => {
    const ok = await confirm({
      title: t("settings.devices.revokeTitle"),
      message: t("settings.devices.revokeMessage", { label: d.label }),
      confirmLabel: t("settings.devices.revoke"),
      tone: "danger",
    });
    if (!ok) return;
    try {
      await api.revokeDevice(session.token, d.id);
      load();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <>
      <PageHeader
        title={t("settings.devices.title")}
        subtitle={t("settings.devices.subtitle")}
        actions={<RefreshButton onRefresh={load} />}
      />

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-destructive">{error}</p>}

      {isSuperAdmin && (
        <div className="grid gap-4 lg:grid-cols-[1fr_minmax(0,420px)]">
          <form onSubmit={generate} className="card">
            <CardHeader title={t("settings.devices.enrollTitle")} />
            <div className="space-y-4 px-5 pb-5">
              <p className="text-sm text-muted-foreground">{t("settings.devices.enrollIntro")}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="field-label">{t("settings.devices.gate")}</label>
                  <select required value={gateId} onChange={(e) => setGateId(e.target.value)} className="field">
                    {gates.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="field-label">{t("settings.devices.label")}</label>
                  <input
                    required
                    maxLength={200}
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder={t("settings.devices.labelPlaceholder")}
                    className="field"
                  />
                </div>
              </div>
              <button type="submit" className="btn-gold">
                <KeyRound className="h-4 w-4" /> {t("settings.devices.generate")}
              </button>
            </div>
          </form>

          <div className="card flex flex-col items-center justify-center p-6 text-center">
            {code ? (
              <>
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{t("settings.devices.codeTitle")}</p>
                <p className="mt-2 select-all font-mono text-4xl font-extrabold tracking-widest text-royal">{code.code}</p>
                <p className="mt-3 text-sm text-muted-foreground">
                  {t("settings.devices.codeHint", { time: formatDateTime(code.expiresAt), label: code.label })}
                </p>
              </>
            ) : (
              <MonitorSmartphone className="h-12 w-12 text-royal/25" strokeWidth={1.5} />
            )}
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <CardHeader title={t("settings.devices.listTitle", { count: devices?.length ?? 0 })} />
        {devices === null ? (
          <Loading />
        ) : devices.length === 0 ? (
          <p className="px-5 pb-6 text-sm text-muted-foreground">{t("settings.devices.empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-y border-border bg-muted/40">
                <tr>
                  <th className="th">{t("settings.devices.col.till")}</th>
                  <th className="th">{t("settings.devices.col.gate")}</th>
                  <th className="th">{t("settings.devices.col.status")}</th>
                  <th className="th">{t("settings.devices.col.cert")}</th>
                  <th className="th">{t("settings.devices.col.version")}</th>
                  <th className="th">{t("settings.devices.col.enrolled")}</th>
                  {isSuperAdmin && <th className="th" />}
                </tr>
              </thead>
              <tbody>
                {devices.map((d) => (
                  <tr key={d.id} className="border-b border-border/60 last:border-0">
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
                    <td className="td text-muted-foreground">{formatDateTime(d.certNotAfter)}</td>
                    <td className="td text-xs text-muted-foreground">
                      {d.appVersion ?? "—"}
                      {d.os ? ` · ${d.os}` : ""}
                    </td>
                    <td className="td text-muted-foreground">{formatDateTime(d.enrolledAt)}</td>
                    {isSuperAdmin && (
                      <td className="td text-right">
                        {d.status === "ACTIVE" && (
                          <button onClick={() => revoke(d)} className="btn-outline px-3 py-1.5 text-xs text-destructive">
                            <ShieldOff className="h-3.5 w-3.5" /> {t("settings.devices.revoke")}
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
