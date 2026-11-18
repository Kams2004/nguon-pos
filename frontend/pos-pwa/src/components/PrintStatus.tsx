import { CheckCircle2, Info, Printer, RotateCw, Settings2, TriangleAlert } from "lucide-react";
import { useI18n } from "../i18n";
import type { PrintOutcome } from "../lib/platform";

export type PrintState = { phase: "idle" } | { phase: "printing" } | { phase: "done"; outcome: PrintOutcome };

/**
 * What became of the last print, right under the print buttons: on its way,
 * sent to which printer, cancelled, or why it failed — with the way out.
 */
export function PrintStatus({
  state,
  noPrinterChosen,
  onRetry,
  onDialog,
  onSettings,
}: {
  state: PrintState;
  /** Desktop till without a chosen printer: every print opens the system dialog. */
  noPrinterChosen: boolean;
  onRetry: () => void;
  onDialog: () => void;
  onSettings: () => void;
}) {
  const { t } = useI18n();

  if (state.phase === "printing") {
    return (
      <p role="status" className="flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-2.5 text-sm font-semibold text-secondary">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-secondary/30 border-t-secondary" /> {t("gate.print.printing")}
      </p>
    );
  }

  if (state.phase === "idle") {
    return noPrinterChosen ? (
      <p className="flex items-start gap-2 rounded-xl bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
        <span>
          {t("gate.print.noPrinterHint")}{" "}
          <button onClick={onSettings} className="font-semibold text-secondary underline-offset-2 hover:underline">
            {t("gate.printer.open")}
          </button>
        </span>
      </p>
    ) : null;
  }

  const o = state.outcome;
  if (o.kind === "error") {
    const name = o.printer ?? "";
    const code = o.code.split(":")[0];
    const known = ["NO_PRINTER", "PRINTER_NOT_FOUND", "PRINTER_DISABLED", "PRINT_TIMEOUT", "WEBVIEW2_TOO_OLD"] as const;
    const match = known.find((k) => k === code);
    return (
      <div role="alert" className="space-y-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm text-destructive ring-1 ring-red-200">
        <p className="flex items-start gap-2 font-semibold">
          <TriangleAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
          {match ? t(`gate.print.error.${match}`, { printer: name }) : t("gate.print.error.other", { code: o.code })}
        </p>
        <div className="flex flex-wrap gap-2">
          <button onClick={onRetry} className="btn-outline bg-white px-2.5 py-1 text-xs">
            <RotateCw className="h-3.5 w-3.5" /> {t("gate.print.retry")}
          </button>
          <button onClick={onDialog} className="btn-outline bg-white px-2.5 py-1 text-xs">
            <Printer className="h-3.5 w-3.5" /> {t("gate.print.useDialog")}
          </button>
          <button onClick={onSettings} className="btn-outline bg-white px-2.5 py-1 text-xs">
            <Settings2 className="h-3.5 w-3.5" /> {t("gate.printer.open")}
          </button>
        </div>
      </div>
    );
  }

  const message =
    o.kind === "sent"
      ? t("gate.print.sent", { printer: o.printer })
      : o.kind === "dialog"
        ? t(
            o.result === "PRINTED"
              ? "gate.print.dialogPrinted"
              : o.result === "CANCELLED"
                ? "gate.print.cancelled"
                : "gate.print.dialogOpened",
          )
        : t("gate.print.dialogOpened");
  const cancelled = o.kind === "dialog" && o.result === "CANCELLED";
  return (
    <p
      role="status"
      className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold ${
        cancelled ? "bg-muted/60 text-muted-foreground" : "bg-emerald-50 text-emerald-800"
      }`}
    >
      {cancelled ? <Info className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />} {message}
    </p>
  );
}
