import { useRef, useState } from "react";
import { AlertTriangle, Check, HelpCircle, ScanLine, X, type LucideIcon } from "lucide-react";
import { useSession } from "../../context/SessionContext";
import { scanTicket, type ScanOutcome } from "../../lib/offline/scan";
import type { GateSession } from "../../lib/offline/session";
import GateHeader from "./GateHeader";
import { locale, useI18n } from "../../i18n";

// A real USB QR/barcode scanner acts as a keyboard-emulation (HID) device:
// it "types" the decoded content into whatever input is focused, then sends
// Enter. This input is deliberately built around that exact interaction —
// it works identically with a real scanner or with manual paste-and-Enter
// during testing, and needs no camera/getUserMedia support.
export default function Scan() {
  const { t } = useI18n();
  const { session, syncNow, refreshPendingCount } = useSession();
  const [value, setValue] = useState("");
  const [result, setResult] = useState<{ outcome: ScanOutcome; at: Date } | null>(null);
  // This session's scans, newest first — what the controller glances back at.
  const [history, setHistory] = useState<{ outcome: ScanOutcome; at: Date }[]>([]);
  const [scanning, setScanning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // See Sell.tsx for why this is just a type-narrowing formality.
  if (!session || !session.assignedGateId || !session.bootstrap) return null;
  // Explicit local, not just the narrowed `session` — narrowing from the
  // guard above doesn't reliably persist into the nested closure below.
  const gateSession = session as GateSession;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = value.trim();
    if (!content) return;
    setScanning(true);
    try {
      const outcome = await scanTicket(gateSession, content);
      const entry = { outcome, at: new Date() };
      setResult(entry);
      setHistory((h) => [entry, ...h].slice(0, 50));
      refreshPendingCount();
      syncNow(); // fire-and-forget
    } finally {
      setScanning(false);
      setValue("");
      inputRef.current?.focus();
    }
  };

  const accepted = history.filter((h) => h.outcome.kind === "ACCEPTED").length;

  return (
    <div className="min-h-screen bg-background">
      <GateHeader />
      <div className="mx-auto grid max-w-[1400px] gap-5 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="space-y-5">
          <form
            onSubmit={handleSubmit}
            className="relative overflow-hidden rounded-2xl bg-royal-deep px-6 pb-7 pt-6 shadow-[0_10px_30px_-14px_hsl(var(--royal-deep)/0.6)]"
          >
            <img src="/img/banners/navy-palace.jpg" alt="" className="absolute inset-0 h-full w-full object-cover opacity-50" />
            <div className="absolute inset-0 bg-gradient-to-b from-royal-deep/60 via-transparent to-royal-deep/80" />
            <div className="relative text-center">
              <h1 className="font-display text-2xl font-extrabold tracking-tight text-white">{t("gate.scan.title")}</h1>
              <p className="text-sm text-white/75">{session.bootstrap.gate.name}</p>
            </div>
            {/* Viewfinder frame — a visual nod to camera-style scanning, though
                this gate reads tickets as HID/manual text input, not a live
                camera feed (see offline-first architecture notes). */}
            <div className="relative mx-auto mt-6 flex h-56 w-56 items-center justify-center sm:h-64 sm:w-64">
              {(
                [
                  "left-0 top-0 border-l-4 border-t-4 rounded-tl-2xl",
                  "right-0 top-0 border-r-4 border-t-4 rounded-tr-2xl",
                  "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-2xl",
                  "bottom-0 right-0 border-b-4 border-r-4 rounded-br-2xl",
                ] as const
              ).map((pos) => (
                <span key={pos} className={`absolute h-12 w-12 border-primary ${pos}`} />
              ))}
              <span
                className={`absolute inset-x-5 top-1/2 h-0.5 rounded-full bg-primary/80 shadow-[0_0_12px_2px] shadow-primary/60 ${
                  scanning ? "animate-pulse" : ""
                }`}
              />
              <ScanLine className={`h-16 w-16 ${scanning ? "animate-pulse text-primary" : "text-white/40"}`} strokeWidth={1.4} />
            </div>
            <p className="relative mt-5 text-center text-sm text-white/85">{t("gate.scan.prompt")}</p>
            <input
              ref={inputRef}
              type="text"
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={t("gate.scan.placeholder")}
              aria-label={t("gate.scan.codeLabel")}
              className="relative mt-3 w-full rounded-xl border border-white/20 bg-white/95 px-4 py-3.5 text-center font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              disabled={scanning}
            />
          </form>

          <div className="card grid grid-cols-3 divide-x divide-border text-center">
            <div className="px-3 py-4">
              <p className="font-display text-2xl font-extrabold tabular-nums">{history.length}</p>
              <p className="text-xs font-semibold text-muted-foreground">{t("gate.scan.scans")}</p>
            </div>
            <div className="px-3 py-4">
              <p className="font-display text-2xl font-extrabold tabular-nums text-success">{accepted}</p>
              <p className="text-xs font-semibold text-muted-foreground">{t("gate.scan.accepted")}</p>
            </div>
            <div className="px-3 py-4">
              <p className="font-display text-2xl font-extrabold tabular-nums text-destructive">{history.length - accepted}</p>
              <p className="text-xs font-semibold text-muted-foreground">{t("gate.scan.refused")}</p>
            </div>
          </div>
        </div>

        {/* On a phone the verdict goes on top once a ticket is read, so it's in view. */}
        <div className={`space-y-5 ${result ? "order-first lg:order-none" : ""}`}>
          {result ? (
            <ResultPanel key={result.at.getTime()} outcome={result.outcome} at={result.at} />
          ) : (
            <div className="flex min-h-[260px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-royal/20 bg-card px-6 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-royal/10 text-royal">
                <ScanLine className="h-8 w-8" strokeWidth={1.8} />
              </span>
              <p className="mt-4 font-display text-xl font-bold text-foreground">{t("gate.scan.ready")}</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">{t("gate.scan.readyHint")}</p>
            </div>
          )}

          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-5 pb-3 pt-4">
              <h2 className="font-display text-sm font-bold text-foreground">{t("gate.scan.recent")}</h2>
              <span className="text-xs text-muted-foreground">{t("gate.scan.thisSession")}</span>
            </div>
            {history.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-muted-foreground">{t("gate.scan.none")}</p>
            ) : (
              <ul className="divide-y divide-border border-t border-border">
                {history.slice(0, 8).map((h) => {
                  const st = STYLES[h.outcome.kind];
                  const Icon = st.icon;
                  return (
                    <li key={h.at.getTime()} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                      <span className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full ${st.panel}`}>
                        <Icon className="h-4 w-4" strokeWidth={3} />
                      </span>
                      <span className="min-w-0 flex-1 truncate font-semibold">{t(`gate.scan.${h.outcome.kind}.title`)}</span>
                      <span className="hidden truncate font-mono text-xs text-muted-foreground sm:block">
                        {"ticketNumber" in h.outcome ? h.outcome.ticketNumber : ""}
                      </span>
                      <span className="w-16 text-right text-xs tabular-nums text-muted-foreground">
                        {h.at.toLocaleTimeString(locale())}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Titles and bar labels come from gate.scan.<kind>.title / .bar.
const STYLES: Record<ScanOutcome["kind"], { icon: LucideIcon; panel: string }> = {
  ACCEPTED: {
    icon: Check,
    panel: "bg-success text-white",
  },
  REJECTED_ALREADY_REDEEMED: {
    icon: X,
    panel: "bg-destructive text-white",
  },
  REJECTED_INVALID_SIGNATURE: {
    icon: X,
    panel: "bg-destructive text-white",
  },
  REJECTED_WRONG_GATE: {
    icon: AlertTriangle,
    panel: "bg-amber-400 text-amber-950",
  },
  NOT_RECOGNIZED: {
    icon: HelpCircle,
    panel: "bg-slate-600 text-white",
  },
};

function ResultPanel({ outcome, at }: { outcome: ScanOutcome; at: Date }) {
  const { t } = useI18n();
  const style = STYLES[outcome.kind];
  const Icon = style.icon;
  const ticketNumber = "ticketNumber" in outcome ? outcome.ticketNumber : null;

  // Colour-drenched so the verdict reads from across the gate, not just from the screen.
  return (
    <div
      role="status"
      className={`animate-in fade-in zoom-in-95 flex min-h-[260px] flex-col justify-between rounded-2xl p-6 shadow-lg duration-200 sm:p-8 ${style.panel}`}
    >
      <div className="flex items-start gap-5">
        <span className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-full bg-white/20 ring-4 ring-white/30">
          <Icon className="h-11 w-11" strokeWidth={3} />
        </span>
        <div className="min-w-0 pt-1">
          <p className="font-display text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
            {t(`gate.scan.${outcome.kind}.title`)}
          </p>
          {ticketNumber && <p className="mt-1 truncate font-mono text-sm opacity-90">{ticketNumber}</p>}
          <p className="mt-0.5 text-sm tabular-nums opacity-80">{t("gate.scan.scannedAt", { time: at.toLocaleTimeString(locale()) })}</p>
        </div>
      </div>
      <p className="mt-8 rounded-xl bg-black/15 px-5 py-4 text-center font-display text-2xl font-extrabold uppercase tracking-wide">
        {t(`gate.scan.${outcome.kind}.bar`)}
      </p>
    </div>
  );
}
