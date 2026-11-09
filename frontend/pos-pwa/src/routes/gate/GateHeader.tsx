import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, LogOut, RefreshCw, ScanLine, ShoppingCart, UserRound, Printer } from "lucide-react";
import { useSession } from "../../context/SessionContext";
import { BrandLockup } from "../../components/ui";
import { useI18n } from "../../i18n";
import { isEdgeMode } from "../../lib/platform";
import { PrinterSettingsDialog } from "../../components/PrinterSettingsDialog";
import { UpdateNotice } from "../../components/UpdateNotice";
import { LanguageSwitcher } from "../../components/LanguageSwitcher";

/**
 * Sticky till header. Its right-hand side never changes size: the
 * online/offline chip has a fixed width and the "pending" count is a small
 * badge on the sync button — so a sale (pending 0 → 1 → 0 within a second
 * while it syncs) doesn't make the header jump.
 */
export default function GateHeader() {
  const { session, isOnline, pendingCount, logout, syncNow } = useSession();
  const location = useLocation();
  const { t } = useI18n();
  const [printerOpen, setPrinterOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const sync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      // Keep spinning a moment even when it's instant, so the click visibly did something.
      await Promise.all([syncNow(), new Promise((r) => setTimeout(r, 700))]);
    } finally {
      setSyncing(false);
    }
  };

  const navLinkClass = (active: boolean) =>
    `flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
      active ? "bg-primary text-primary-foreground shadow-sm" : "text-white/85 hover:bg-white/10 hover:text-white"
    }`;

  return (
    <header className="no-print sticky top-0 z-40 overflow-hidden bg-royal text-white shadow-md shadow-royal/20">
      <img src="/img/banners/blue.jpg" alt="" className="absolute inset-0 h-full w-full object-cover opacity-80" />
      <div className="absolute inset-0 bg-gradient-to-r from-royal/40 via-royal/60 to-royal-deep/80" />
      <div className="relative flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6">
        <BrandLockup compact />
        <div className="hidden h-8 w-px bg-white/25 sm:block" />
        <p className="hidden truncate text-sm font-semibold text-white/90 sm:block">{session?.bootstrap?.gate.name}</p>

        {session?.assignedGateId && (
          <nav className="order-3 flex w-full items-center gap-1 overflow-x-auto sm:order-none sm:w-auto">
            <Link to="/gate/sell" className={navLinkClass(location.pathname === "/gate/sell")}>
              <ShoppingCart className="h-3.5 w-3.5" /> {t("shell.till.sell")}
            </Link>
            <Link to="/gate/scan" className={navLinkClass(location.pathname === "/gate/scan")}>
              <ScanLine className="h-3.5 w-3.5" /> {t("shell.till.scan")}
            </Link>
            {!isEdgeMode() && (session?.role === "SUPER_ADMIN" || session?.role === "COORDINATOR") && (
              <Link to="/admin/dashboard" className={navLinkClass(false)}>
                <LayoutDashboard className="h-3.5 w-3.5" /> {t("shell.till.admin")}
              </Link>
            )}
          </nav>
        )}

        <div className="ml-auto flex items-center gap-2">
          <UpdateNotice />
          <LanguageSwitcher tone="light" />
          <span className="hidden max-w-[220px] items-center gap-1.5 truncate rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-foreground md:flex">
            <UserRound className="h-3.5 w-3.5 flex-shrink-0 text-secondary" />
            <span className="truncate">{session?.fullName}</span>
          </span>
          <span
            className={`flex w-[104px] items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold ${
              isOnline ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-destructive"
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${isOnline ? "bg-emerald-500" : "bg-destructive"}`} />
            {isOnline ? t("common.online") : t("common.offline")}
          </span>
          <button
            onClick={sync}
            disabled={syncing || !isOnline}
            className="relative rounded-lg bg-white/10 p-2 text-white hover:bg-white/20 disabled:opacity-60"
            aria-label={pendingCount > 0 ? t("shell.till.syncPending", { count: pendingCount }) : t("shell.till.syncNow")}
            title={pendingCount > 0 ? t("shell.till.pendingTitle", { count: pendingCount }) : t("shell.till.allSynced")}
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin text-primary" : ""}`} />
            {pendingCount > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                {pendingCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setPrinterOpen(true)}
            className="rounded-lg bg-white/10 p-2 text-white hover:bg-white/20"
            aria-label={t("gate.printer.open")}
            title={t("gate.printer.open")}
          >
            <Printer className="h-4 w-4" />
          </button>
          <button
            onClick={logout}
            className="rounded-lg bg-white/10 p-2 text-white hover:bg-white/20"
            aria-label={t("shell.logout")}
            title={t("shell.logout")}
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
      {printerOpen && <PrinterSettingsDialog onClose={() => setPrinterOpen(false)} />}
    </header>
  );
}
