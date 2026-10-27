import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { useSession } from "../../context/SessionContext";

const NAV_ITEMS = [
  { to: "/admin/sales", label: "Ventes" },
  { to: "/admin/sync-status", label: "Synchronisation" },
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
    <div className="min-h-screen bg-background lg:flex">
      <aside className="lg:w-64 flex-shrink-0 bg-sidebar text-sidebar-foreground min-h-screen p-5 flex flex-col relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.07] mix-blend-soft-light pointer-events-none"
          style={{ backgroundImage: "url(/img/diamond-pattern.svg)", backgroundSize: "200px" }}
        />
        <div className="relative flex items-center gap-2.5 px-1 mb-8">
          <img src="/logo.png" alt="Nguon" className="h-9 rounded-lg bg-white/10 p-1" />
          <div>
            <p className="font-display font-black text-sm leading-tight">NGUON POS</p>
            <p className="text-[11px] text-sidebar-foreground/60 leading-tight">Administration</p>
          </div>
        </div>
        <nav className="relative space-y-1 flex-1">
          {NAV_ITEMS.filter((item) => isSuperAdmin || !item.superAdminOnly).map((item) => {
            const active = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-2.5 text-sm font-semibold px-3.5 py-2.5 rounded-xl transition-colors ${
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                    : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${active ? "bg-sidebar-primary-foreground" : "bg-sidebar-foreground/30"}`} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="relative pt-4 border-t border-sidebar-border space-y-1">
          <Link
            to="/gate/sell"
            className="block text-xs font-semibold text-sidebar-foreground/70 hover:text-sidebar-primary px-3.5 py-2 rounded-lg hover:bg-sidebar-accent transition-colors"
          >
            ← Retour à la caisse
          </Link>
          <button
            onClick={logout}
            className="block w-full text-left text-xs font-semibold text-sidebar-foreground/70 hover:text-destructive px-3.5 py-2 rounded-lg hover:bg-sidebar-accent transition-colors"
          >
            Déconnexion
          </button>
        </div>
      </aside>
      <main className="flex-1 p-5 sm:p-8 max-w-6xl">
        <Outlet />
      </main>
    </div>
  );
}
