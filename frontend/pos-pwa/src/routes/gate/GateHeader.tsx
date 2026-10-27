import { Link, useLocation } from "react-router-dom";
import { useSession } from "../../context/SessionContext";

export default function GateHeader() {
  const { session, isOnline, pendingCount, logout } = useSession();
  const location = useLocation();

  const navLinkClass = (active: boolean) =>
    `text-xs font-bold px-3 py-1.5 rounded-full transition-colors whitespace-nowrap ${
      active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted"
    }`;

  return (
    <header className="border-b border-border bg-card">
      <div className="px-4 py-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <img src="/logo.png" alt="Nguon" className="h-9 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground truncate leading-tight">
              {session?.bootstrap?.gate.name ?? "Administration"}
            </p>
            <p className="text-xs text-muted-foreground truncate leading-tight">{session?.fullName}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 order-3 sm:order-none sm:ml-auto">
          <span
            className={`text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5 ${
              isOnline ? "bg-green-100 text-green-800" : "bg-destructive/10 text-destructive"
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? "bg-green-500" : "bg-destructive"}`} />
            {isOnline ? "En ligne" : "Hors-ligne"}
          </span>
          {pendingCount > 0 && (
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-muted text-muted-foreground">
              {pendingCount} en attente
            </span>
          )}
          <button
            onClick={logout}
            className="text-xs font-semibold text-muted-foreground hover:text-destructive transition-colors px-2"
          >
            Déconnexion
          </button>
        </div>

        {session?.assignedGateId && (
          <nav className="flex items-center gap-1 flex-shrink-0 order-2 w-full sm:w-auto overflow-x-auto">
            <Link to="/gate/sell" className={navLinkClass(location.pathname === "/gate/sell")}>
              Vendre
            </Link>
            <Link to="/gate/scan" className={navLinkClass(location.pathname === "/gate/scan")}>
              Scanner
            </Link>
            {(session?.role === "SUPER_ADMIN" || session?.role === "COORDINATOR") && (
              <Link to="/admin/sales" className={navLinkClass(false)}>
                Admin
              </Link>
            )}
          </nav>
        )}
      </div>
    </header>
  );
}
