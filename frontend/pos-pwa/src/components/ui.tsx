import { useEffect, useState, type ReactNode } from "react";
import { RefreshCw, Search, X, type LucideIcon } from "lucide-react";
import { useBranding } from "../context/BrandingContext";
import { useSession } from "../context/SessionContext";
import { translate, useI18n } from "../i18n";

/** Logo + "NGUON FESTIVAL" wordmark, as on every screen of the mockup. The logo is the one set in Paramètres. */
export function BrandLockup({ tone = "light", compact = false }: { tone?: "light" | "dark"; compact?: boolean }) {
  const { logoUrl } = useBranding();
  const text = tone === "light" ? "text-white" : "text-royal";
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <img src={logoUrl} alt="Nguon" className={`${compact ? "h-9 w-9" : "h-11 w-11"} flex-shrink-0 rounded-lg bg-white p-0.5 shadow-sm`} />
      <div className={`min-w-0 leading-none ${text}`}>
        <p className={`font-display font-extrabold tracking-wide ${compact ? "text-sm" : "text-base"}`}>NGUON</p>
        <p className={`font-display font-extrabold tracking-wide ${compact ? "text-sm" : "text-base"}`}>FESTIVAL</p>
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="masthead print:bg-transparent print:text-foreground print:shadow-none">
      <img src="/img/banners/blue.jpg" alt="" className="absolute inset-0 h-full w-full object-cover opacity-70 print:hidden" />
      <div className="absolute inset-0 bg-gradient-to-r from-royal-deep/95 via-royal/75 to-royal/35 print:hidden" />
      <div className="relative flex flex-wrap items-end justify-between gap-4 px-5 py-5 sm:px-7 sm:py-6">
        <div className="min-w-0 max-w-3xl">
          <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-[1.75rem]">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-white/80 print:text-muted-foreground">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 no-print">{actions}</div>}
      </div>
      <span className="absolute inset-x-0 bottom-0 h-1 bg-primary print:hidden" />
    </header>
  );
}

const TONES = {
  green: "bg-emerald-50 text-emerald-700",
  blue: "bg-royal/10 text-royal",
  violet: "bg-royal/10 text-royal",
  gold: "bg-amber-100 text-amber-700",
} as const;

/** One cell of a `.stat-strip` scoreboard — the strip's first cell is the lead figure, on royal blue. */
export function StatCard({
  icon: Icon,
  tone,
  label,
  value,
  hint,
}: {
  icon: LucideIcon;
  tone: keyof typeof TONES;
  label: string;
  value: string;
  hint?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3.5 px-5 py-4">
      <div className={`stat-icon flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${TONES[tone]}`}>
        <Icon className="h-5 w-5" strokeWidth={2} />
      </div>
      <div className="min-w-0">
        <p className="stat-label text-xs font-semibold text-muted-foreground">{label}</p>
        <p className="stat-value mt-0.5 truncate font-display text-2xl font-extrabold tabular-nums tracking-tight text-foreground">
          {value}
        </p>
        {hint && <div className="stat-hint mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
      </div>
    </div>
  );
}

/** "+18% vs yesterday" — up is green, down is red, with an arrow so it never relies on color alone. */
export function Delta({ current, previous, suffix }: { current: number; previous: number; suffix: string }) {
  if (previous === 0) return <span className="text-muted-foreground">{current > 0 ? translate("ui.noComparison") : ""}</span>;
  const pct = Math.round(((current - previous) / previous) * 100);
  const up = pct >= 0;
  return (
    <span>
      <span className={`font-semibold ${up ? "text-success" : "text-destructive"}`}>
        {up ? "↗" : "↘"} {up ? "+" : ""}
        {pct}%
      </span>{" "}
      {suffix}
    </span>
  );
}

const PILL_TONES = {
  success: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
  danger: "bg-red-50 text-red-600 ring-red-600/15",
  warning: "bg-amber-50 text-amber-700 ring-amber-600/20",
  neutral: "bg-muted text-muted-foreground ring-border",
  info: "bg-blue-50 text-secondary ring-secondary/15",
} as const;

export function Pill({ tone, children, dot = false }: { tone: keyof typeof PILL_TONES; children: ReactNode; dot?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${PILL_TONES[tone]}`}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  return (
    <span
      className={`inline-flex flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-royal to-secondary font-bold text-white ${
        size === "sm" ? "h-8 w-8 text-[11px]" : "h-10 w-10 text-sm"
      }`}
    >
      {initials || "?"}
    </span>
  );
}

export function CardHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
      <h2 className="font-display text-sm font-bold text-foreground">{title}</h2>
      {action}
    </div>
  );
}

export function Loading() {
  return (
    <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-secondary/30 border-t-secondary" />
      Chargement…
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="p-8 text-center text-sm text-muted-foreground">{children}</p>;
}

const MODAL_WIDTHS = { md: "max-w-md", lg: "max-w-2xl", xl: "max-w-4xl" } as const;

/** Closes on the ×, on Échap, or on a click in the empty area around it. */
export function Modal({
  title,
  onClose,
  children,
  size = "md",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  size?: keyof typeof MODAL_WIDTHS;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-royal-deep/50 p-4 backdrop-blur-sm"
      // mousedown, not click: a text selection dragged from inside the
      // dialog and released outside must not close it.
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* Own text colour: a dialog opened from a coloured header must not inherit its white text. */}
      <div className={`card my-auto w-full ${MODAL_WIDTHS[size]} overflow-hidden text-foreground animate-in fade-in zoom-in-95`}>
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-display text-base font-bold">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:bg-muted" aria-label={translate("common.close")}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

/** "Refresh" — the icon spins while the reload runs (at least briefly, so a fast reload still visibly happened). */
export function RefreshButton({ onRefresh, label }: { onRefresh: () => unknown; label?: string }) {
  const { t } = useI18n();
  const [spinning, setSpinning] = useState(false);
  const run = async () => {
    if (spinning) return;
    setSpinning(true);
    const minSpin = new Promise((r) => setTimeout(r, 700));
    try {
      await Promise.all([Promise.resolve(onRefresh()), minSpin]);
    } finally {
      setSpinning(false);
    }
  };
  return (
    <button onClick={run} className="btn-outline" disabled={spinning} aria-busy={spinning}>
      <RefreshCw className={`h-4 w-4 ${spinning ? "animate-spin text-secondary" : ""}`} />
      {label ?? t("common.refresh")}
    </button>
  );
}

/** Shows that this screen updates by itself (live stream connected). */
export function LiveBadge() {
  const { liveConnected } = useSession();
  const { t } = useI18n();
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
        liveConnected ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"
      }`}
      title={liveConnected ? t("ui.liveTitle") : t("ui.reconnectingTitle")}
    >
      <span className="relative flex h-2 w-2">
        {liveConnected && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${liveConnected ? "bg-emerald-500" : "bg-muted-foreground/50"}`} />
      </span>
      {liveConnected ? t("common.live") : t("ui.reconnecting")}
    </span>
  );
}

/** Search box with a leading magnifier, as in the mockup's list headers. */
export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative w-full max-w-sm">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="field pl-9" />
    </div>
  );
}
