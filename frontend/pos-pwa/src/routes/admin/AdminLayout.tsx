import { useState } from "react";
import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import {
  BadgeCheck,
  BarChart3,
  Bell,
  CalendarDays,
  DoorOpen,
  Images,
  LayoutDashboard,
  LogOut,
  Palette,
  Menu,
  RefreshCw,
  ScanLine,
  ScrollText,
  Settings,
  ShoppingCart,
  Ticket,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useSession } from "../../context/SessionContext";
import { Avatar, BrandLockup, LiveBadge } from "../../components/ui";
import { SubscriptionAlert } from "../../components/SubscriptionAlert";
import { ROLE_LABELS } from "../../lib/format";

const NAV_ITEMS: { to: string; label: string; icon: LucideIcon; superAdminOnly?: boolean }[] = [
  { to: "/admin/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
  { to: "/admin/sales", label: "Ventes", icon: ShoppingCart },
  { to: "/admin/reports", label: "Rapports", icon: BarChart3 },
  { to: "/admin/ticket-types", label: "Billetterie", icon: Ticket, superAdminOnly: true },
  { to: "/admin/gates", label: "Portes & caisses", icon: DoorOpen, superAdminOnly: true },
  { to: "/admin/sync-status", label: "Caisses en direct", icon: RefreshCw },
  { to: "/admin/scans", label: "Contrôle des entrées", icon: ScanLine },
  { to: "/admin/logs", label: "Journal d'activité", icon: ScrollText },
  { to: "/admin/users", label: "Utilisateurs", icon: Users, superAdminOnly: true },
  { to: "/admin/design", label: "Billet & reçu", icon: Palette, superAdminOnly: true },
  { to: "/admin/media", label: "Médiathèque", icon: Images, superAdminOnly: true },
  { to: "/admin/subscription", label: "Abonnement", icon: BadgeCheck, superAdminOnly: true },
  { to: "/admin/establishment", label: "Paramètres", icon: Settings, superAdminOnly: true },
];

export default function AdminLayout() {
  const { session, logout } = useSession();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!session) return <Navigate to="/login" replace />;
  // Matches the backend's own @PreAuthorize rules: SUPER_ADMIN and
  // COORDINATOR can both reach the admin area (sales + sync-status are
  // hasAnyRole on the backend); CASHIER cannot.
  if (session.role !== "SUPER_ADMIN" && session.role !== "COORDINATOR") {
    return <Navigate to="/gate/sell" replace />;
  }
  const isSuperAdmin = session.role === "SUPER_ADMIN";
  const items = NAV_ITEMS.filter((item) => isSuperAdmin || !item.superAdminOnly);

  const sidebar = (
    <aside className="relative flex h-full w-64 flex-col overflow-hidden bg-gradient-to-b from-royal via-royal to-royal-deep text-sidebar-foreground">
      {/* Bamoun diamond motif fading in toward the bottom, as in the mockup */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-64 bg-cover bg-bottom opacity-60 [mask-image:linear-gradient(to_top,black,transparent)]"
        style={{ backgroundImage: "url(/img/banners/blue.jpg)" }}
      />
      <div className="relative flex items-center justify-between px-5 pt-5 pb-7">
        <BrandLockup />
        <button onClick={() => setMobileOpen(false)} className="lg:hidden text-white/80" aria-label="Fermer le menu">
          <X className="h-5 w-5" />
        </button>
      </div>
      <nav className="relative flex-1 space-y-1 px-3">
        {items.map(({ to, label, icon: Icon }) => {
          const active = location.pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-colors ${
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-md shadow-black/10"
                  : "text-white/85 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={1.9} />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="relative space-y-1 border-t border-white/15 px-3 py-4">
        {session.assignedGateId && (
          <Link
            to="/gate/sell"
            className="flex items-center gap-3 rounded-xl px-3.5 py-2 text-xs font-semibold text-white/80 hover:bg-white/10 hover:text-white"
          >
            <ShoppingCart className="h-4 w-4" /> Retour à la caisse
          </Link>
        )}
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2 text-left text-xs font-semibold text-white/80 hover:bg-white/10 hover:text-white"
        >
          <LogOut className="h-4 w-4" /> Déconnexion
        </button>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen bg-background lg:flex">
      <div className="no-print hidden lg:block lg:sticky lg:top-0 lg:h-screen">{sidebar}</div>
      {mobileOpen && (
        <div className="no-print fixed inset-0 z-40 flex lg:hidden">
          <div className="h-full">{sidebar}</div>
          <button className="flex-1 bg-black/40" onClick={() => setMobileOpen(false)} aria-label="Fermer le menu" />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-card/90 px-4 py-3 backdrop-blur sm:px-6">
          <button onClick={() => setMobileOpen(true)} className="rounded-lg p-1.5 hover:bg-muted lg:hidden" aria-label="Ouvrir le menu">
            <Menu className="h-5 w-5" />
          </button>
          <div className="ml-auto flex items-center gap-2 sm:gap-4">
            <LiveBadge />
            <div className="hidden items-center gap-2.5 rounded-xl border border-border px-3 py-1.5 md:flex">
              <CalendarDays className="h-4 w-4 text-secondary" />
              <div className="leading-tight">
                <p className="text-xs font-bold text-foreground">Nguon Festival {new Date().getFullYear()}</p>
                <p className="text-[10px] text-muted-foreground">Foumban, Cameroun</p>
              </div>
            </div>
            <Link
              to="/admin/logs"
              className="relative rounded-full p-2 text-muted-foreground hover:bg-muted"
              aria-label="Journal d'activité"
            >
              <Bell className="h-5 w-5" />
            </Link>
            <div className="flex items-center gap-2.5">
              <Avatar name={session.fullName} />
              <div className="hidden leading-tight sm:block">
                <p className="text-sm font-bold text-foreground">{session.fullName}</p>
                <p className="text-[11px] text-muted-foreground">{ROLE_LABELS[session.role]}</p>
              </div>
            </div>
          </div>
        </header>
        <main className="mx-auto flex w-full max-w-[1920px] flex-1 flex-col gap-6 p-4 sm:p-6 xl:px-8">
          <SubscriptionAlert />
          <Outlet />
        </main>
      </div>
    </div>
  );
}
