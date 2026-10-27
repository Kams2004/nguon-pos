import { Link, useLocation } from "react-router-dom";
import { useSession } from "../../context/SessionContext";

export default function GateHeader() {
  const { session, isOnline, pendingCount, logout } = useSession();
  const location = useLocation();

  return (
    <header className="border-b border-border bg-card px-4 py-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <img src="/logo.png" alt="Nguon" className="h-8 flex-shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground truncate">{session?.bootstrap.gate.name}</p>
          <p className="text-xs text-muted-foreground truncate">{session?.fullName}</p>
        </div>
      </div>

      <nav className="flex items-center gap-1 flex-shrink-0">
        <Link
          to="/gate/sell"
          className={`text-xs font-bold px-3 py-1.5 rounded-full transition-colors ${
            location.pathname === "/gate/sell" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
          }`}
        >
          Vendre
        </Link>
        <Link
          to="/gate/scan"
          className={`text-xs font-bold px-3 py-1.5 rounded-full transition-colors ${
            location.pathname === "/gate/scan" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
          }`}
        >
          Scanner
        </Link>
      </nav>

      <div className="flex items-center gap-2 flex-shrink-0">
        <span
          className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
            isOnline ? "bg-secondary/20 text-foreground" : "bg-destructive/10 text-destructive"
          }`}
        >
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
    </header>
  );
}
