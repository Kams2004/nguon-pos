import { useRef, useState } from "react";
import { useSession } from "../../context/SessionContext";
import { scanTicket, type ScanOutcome } from "../../lib/offline/scan";
import type { GateSession } from "../../lib/offline/session";
import GateHeader from "./GateHeader";

// A real USB QR/barcode scanner acts as a keyboard-emulation (HID) device:
// it "types" the decoded content into whatever input is focused, then sends
// Enter. This input is deliberately built around that exact interaction —
// it works identically with a real scanner or with manual paste-and-Enter
// during testing, and needs no camera/getUserMedia support.
export default function Scan() {
  const { session, syncNow, refreshPendingCount } = useSession();
  const [value, setValue] = useState("");
  const [result, setResult] = useState<ScanOutcome | null>(null);
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
      setResult(outcome);
      refreshPendingCount();
      syncNow(); // fire-and-forget
    } finally {
      setScanning(false);
      setValue("");
      inputRef.current?.focus();
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <GateHeader />
      <div className="max-w-md mx-auto p-4 sm:p-6 space-y-6">
        <div className="text-center space-y-1 pt-2">
          <h2 className="font-display text-xl font-bold text-foreground">Validation de billet</h2>
          <p className="text-sm text-muted-foreground">
            Présentez le QR code du billet au lecteur, ou collez-le manuellement.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div
            className={`relative rounded-[1.75rem] border-2 border-dashed p-8 flex flex-col items-center gap-3 transition-colors ${
              scanning ? "border-primary bg-primary/5" : "border-border bg-card"
            }`}
          >
            <div
              className={`w-16 h-16 rounded-2xl flex items-center justify-center text-3xl ${
                scanning ? "bg-primary/15 animate-pulse" : "bg-muted"
              }`}
            >
              ▭
            </div>
            <input
              ref={inputRef}
              type="text"
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Scanner ou coller le contenu du billet…"
              className="w-full text-center border border-input rounded-xl px-4 py-3 text-sm font-mono bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
              disabled={scanning}
            />
          </div>
        </form>

        {result && <ResultCard result={result} />}
      </div>
    </div>
  );
}

function ResultCard({ result }: { result: ScanOutcome }) {
  const styles: Record<ScanOutcome["kind"], { bg: string; text: string; icon: string; label: string }> = {
    ACCEPTED: { bg: "bg-secondary/15", text: "text-foreground", icon: "✓", label: "Entrée autorisée" },
    REJECTED_ALREADY_REDEEMED: { bg: "bg-destructive/10", text: "text-destructive", icon: "✕", label: "Déjà utilisé" },
    REJECTED_INVALID_SIGNATURE: { bg: "bg-destructive/10", text: "text-destructive", icon: "✕", label: "Billet invalide" },
    REJECTED_WRONG_GATE: { bg: "bg-destructive/10", text: "text-destructive", icon: "✕", label: "Mauvaise porte" },
    NOT_RECOGNIZED: { bg: "bg-muted", text: "text-muted-foreground", icon: "?", label: "Non reconnu sur cet appareil" },
  };
  const style = styles[result.kind];
  const ticketNumber = "ticketNumber" in result ? result.ticketNumber : null;

  return (
    <div className={`rounded-[1.75rem] p-7 text-center space-y-3 ${style.bg} animate-in fade-in`}>
      <div
        className={`w-14 h-14 rounded-full mx-auto flex items-center justify-center text-2xl font-black ${style.text}`}
        style={{ backgroundColor: "rgba(255,255,255,0.5)" }}
      >
        {style.icon}
      </div>
      <p className={`font-display text-xl font-bold ${style.text}`}>{style.label}</p>
      {ticketNumber && <p className="text-sm font-mono text-muted-foreground">{ticketNumber}</p>}
    </div>
  );
}
