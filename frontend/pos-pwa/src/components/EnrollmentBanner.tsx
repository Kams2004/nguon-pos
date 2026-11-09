import { useEffect, useState } from "react";
import { Check, DoorOpen, KeyRound, MonitorSmartphone, ShieldOff } from "lucide-react";
import { useI18n } from "../i18n";
import { isEdgeMode } from "../lib/platform";
import { EdgeError, edge, type EdgeStatus } from "../lib/till/edgeClient";
import { Modal } from "./ui";

const KNOWN = ["INVALID_CODE", "CENTRAL_UNREACHABLE", "TOO_MANY_ATTEMPTS", "DEVICE_ID_TAKEN"] as const;

/**
 * Desktop tills only, on the login screen: which till this is and at which
 * gate, once enrolled; otherwise the way to enroll it, or the fact that it
 * was revoked.
 */
export function EnrollmentBanner() {
  const { t } = useI18n();
  const [status, setStatus] = useState<EdgeStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [justEnrolled, setJustEnrolled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isEdgeMode()) return;
    let stopped = false;
    let tries = 0;
    const load = () =>
      edge
        .status()
        .then((s) => {
          if (stopped) return;
          setStatus(s);
          // Just enrolled: the gate's details arrive over the live channel a moment later.
          if (s.enrolled && !s.gate && tries++ < 15) window.setTimeout(load, 1000);
        })
        .catch(() => !stopped && setStatus(null));
    load();
    return () => {
      stopped = true;
    };
  }, [justEnrolled]);

  if (!isEdgeMode() || !status) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await edge.enroll(code.trim(), "");
      setOpen(false);
      setJustEnrolled(true);
    } catch (err) {
      const c = err instanceof EdgeError ? err.code : "";
      const match = KNOWN.find((k) => k === c);
      setError(match ? t(`gate.enroll.error.${match}`) : c || t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  if (status.revoked) {
    return (
      <div className="flex items-start gap-3 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-destructive">
        <ShieldOff className="mt-0.5 h-4 w-4 flex-shrink-0" /> {t("gate.enroll.revoked")}
      </div>
    );
  }

  if (status.enrolled) {
    const label = status.deviceLabel ?? (status.deviceNo ? t("gate.enroll.tillNo", { n: status.deviceNo }) : t("gate.enroll.thisTill"));
    return (
      <div
        className={`rounded-2xl px-4 py-3 text-sm ring-1 ${
          justEnrolled ? "bg-emerald-50 text-emerald-900 ring-emerald-200" : "bg-muted/60 text-foreground ring-border"
        }`}
      >
        {justEnrolled && (
          <p className="mb-1.5 flex items-center gap-1.5 font-semibold text-success">
            <Check className="h-4 w-4" /> {t("gate.enroll.done")}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="flex items-center gap-1.5 font-bold">
            <MonitorSmartphone className="h-4 w-4 text-secondary" /> {label}
          </span>
          <span className="flex items-center gap-1.5">
            <DoorOpen className="h-4 w-4 text-secondary" /> {status.gate?.name ?? "…"}
          </span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
        <p className="font-bold">{t("gate.enroll.banner")}</p>
        <p className="mt-0.5 text-xs">{t("gate.enroll.bannerHint")}</p>
        <button type="button" onClick={() => setOpen(true)} className="btn-outline mt-2 bg-white px-3 py-1.5 text-xs">
          <KeyRound className="h-3.5 w-3.5" /> {t("gate.enroll.open")}
        </button>
      </div>
      {open && (
        <Modal title={t("gate.enroll.title")} onClose={() => setOpen(false)}>
          <form onSubmit={submit} className="space-y-4">
            <p className="text-sm text-muted-foreground">{t("gate.enroll.codeHint")}</p>
            <div>
              <label className="field-label">{t("gate.enroll.code")}</label>
              <input
                required
                autoFocus
                value={code}
                maxLength={20}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="XXXX-XXXX-XX"
                className="field text-center font-mono text-xl tracking-widest"
              />
            </div>
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-destructive">{error}</p>}
            <button type="submit" disabled={busy} className="btn-gold w-full">
              {t("gate.enroll.submit")}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
