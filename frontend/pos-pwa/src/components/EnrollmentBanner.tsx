import { useEffect, useState } from "react";
import { Check, KeyRound, ShieldOff } from "lucide-react";
import { useI18n } from "../i18n";
import { isEdgeMode } from "../lib/platform";
import { EdgeError, edge, type EdgeStatus } from "../lib/till/edgeClient";
import { Modal } from "./ui";

const KNOWN = ["INVALID_CODE", "CENTRAL_UNREACHABLE", "TOO_MANY_ATTEMPTS", "DEVICE_ID_TAKEN"] as const;

/**
 * Desktop tills only, on the login screen: offers enrollment while the till
 * has no certificate yet, and says so when it was revoked.
 */
export function EnrollmentBanner() {
  const { t } = useI18n();
  const [status, setStatus] = useState<EdgeStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isEdgeMode())
      edge
        .status()
        .then(setStatus)
        .catch(() => setStatus(null));
  }, [done]);

  if (!isEdgeMode() || !status || (status.enrolled && done === null)) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await edge.enroll(code.trim(), "");
      setDone(r.deviceNo);
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

  return (
    <>
      <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
        {done !== null ? (
          <p className="flex items-center gap-2 font-semibold text-success">
            <Check className="h-4 w-4" /> {t("gate.enroll.done", { n: done })}
          </p>
        ) : (
          <>
            <p className="font-bold">{t("gate.enroll.banner")}</p>
            <p className="mt-0.5 text-xs">{t("gate.enroll.bannerHint")}</p>
            <button type="button" onClick={() => setOpen(true)} className="btn-outline mt-2 bg-white px-3 py-1.5 text-xs">
              <KeyRound className="h-3.5 w-3.5" /> {t("gate.enroll.open")}
            </button>
          </>
        )}
      </div>
      {open && done === null && (
        <Modal title={t("gate.enroll.title")} onClose={() => setOpen(false)}>
          <form onSubmit={submit} className="space-y-4">
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
