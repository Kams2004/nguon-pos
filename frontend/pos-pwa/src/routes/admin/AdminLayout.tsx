import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { useSession } from "../../context/SessionContext";

const NAV_ITEMS = [
  { to: "/admin/sales", label: "Ventes" },
  { to: "/admin/sync-status", label: "État de synchronisation" },
  { to: "/admin/gates", label: "Portes", superAdminOnly: true },
  { to: "/admin/ticket-types", label: "Types de billets", superAdminOnly: true },
  { to: "/admin/users", label: "Utilisateurs", superAdminOnly: true },
  { to: "/admin/establishment", label: "Établissement", superAdminOnly: true },
];

export default function AdminLayout() {
  const { session, logout } = useSession();
  const location = useLocation();

  if (!session) return <Navigate to="/login" replace />;
  // Matches the backend's own @PreAuthorize rules: SUPER_ADMIN and
  // COORDINATOR can both reach the admin area (sales + sync-status are
  // hasAnyRole on the backend); CASHIER cannot.
  if (session.role !== "SUPER_ADMIN" && session.role !== "COORDINATOR") {
    return <Navigate to="/gate/sell" replace />;
  }
  const isSuperAdmin = session.role === "SUPER_ADMIN";

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="w-56 flex-shrink-0 border-r border-border bg-card min-h-screen p-4 space-y-6">
        <div className="flex items-center gap-2 px-2">
          <img src="/logo.png" alt="Nguon" className="h-8" />
          <span className="font-display font-bold text-sm">Admin</span>
        </div>
        <nav className="space-y-1">
          {NAV_ITEMS.filter((item) => isSuperAdmin || !item.superAdminOnly).map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`block text-sm font-semibold px-3 py-2 rounded-xl transition-colors ${
                location.pathname === item.to ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="pt-4 border-t border-border space-y-2">
          <Link to="/gate/sell" className="block text-xs font-semibold text-muted-foreground hover:text-primary px-3">
            ← Retour à la caisse
          </Link>
          <button onClick={logout} className="block text-xs font-semibold text-muted-foreground hover:text-destructive px-3">
            Déconnexion
          </button>
        </div>
      </aside>
      <main className="flex-1 p-8 max-w-5xl">
        <Outlet />
      </main>
    </div>
  );
}
