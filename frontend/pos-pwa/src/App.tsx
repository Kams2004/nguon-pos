import { Navigate, Route, BrowserRouter, Routes } from "react-router-dom";
import { SessionProvider, useSession } from "./context/SessionContext";
import { BrandingProvider } from "./context/BrandingContext";
import { ConfirmProvider } from "./context/ConfirmContext";
import { I18nProvider } from "./i18n";
import Login from "./routes/gate/Login";
import Sell from "./routes/gate/Sell";
import Scan from "./routes/gate/Scan";
import AdminLayout from "./routes/admin/AdminLayout";
import Gates from "./routes/admin/Gates";
import TicketTypes from "./routes/admin/TicketTypes";
import Users from "./routes/admin/Users";
import Establishment from "./routes/admin/Establishment";
import Sales from "./routes/admin/Sales";
import Dashboard from "./routes/admin/Dashboard";
import Reports from "./routes/admin/Reports";
import SyncStatus from "./routes/admin/SyncStatus";
import TerminalDetail from "./routes/admin/TerminalDetail";
import Logs from "./routes/admin/Logs";
import Scans from "./routes/admin/Scans";
import Subscription from "./routes/admin/Subscription";
import Media from "./routes/admin/Media";
import TicketDesign from "./routes/admin/TicketDesign";

// Gate screens (Sell/Scan) need real bootstrap data (ticket types, the
// gate's QR signing secret) — a gateless user (SUPER_ADMIN, and
// potentially COORDINATOR) never has that, so send them to the admin area
// instead of letting these screens render against a null bootstrap.
function RequireGateSession({ children }: { children: React.ReactNode }) {
  const { session } = useSession();
  if (!session) return <Navigate to="/login" replace />;
  if (!session.assignedGateId) return <Navigate to="/admin/dashboard" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { session } = useSession();
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/gate/sell"
        element={
          <RequireGateSession>
            <Sell />
          </RequireGateSession>
        }
      />
      <Route
        path="/gate/scan"
        element={
          <RequireGateSession>
            <Scan />
          </RequireGateSession>
        }
      />
      {/* AdminLayout itself enforces SUPER_ADMIN/COORDINATOR, matching the
          backend's own @PreAuthorize rules on these endpoints. */}
      <Route path="/admin" element={<AdminLayout />}>
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="sales" element={<Sales />} />
        <Route path="reports" element={<Reports />} />
        <Route path="sync-status" element={<SyncStatus />} />
        <Route path="sync-status/:terminalId" element={<TerminalDetail />} />
        <Route path="logs" element={<Logs />} />
        <Route path="scans" element={<Scans />} />
        <Route path="subscription" element={<Subscription />} />
        <Route path="media" element={<Media />} />
        <Route path="design" element={<TicketDesign />} />
        <Route path="gates" element={<Gates />} />
        <Route path="ticket-types" element={<TicketTypes />} />
        <Route path="users" element={<Users />} />
        <Route path="establishment" element={<Establishment />} />
        <Route index element={<Navigate to="dashboard" replace />} />
      </Route>
      <Route
        path="*"
        element={<Navigate to={session ? (session.assignedGateId ? "/gate/sell" : "/admin/dashboard") : "/login"} replace />}
      />
    </Routes>
  );
}

function App() {
  return (
    <I18nProvider>
      <SessionProvider>
        <BrandingProvider>
          <ConfirmProvider>
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
          </ConfirmProvider>
        </BrandingProvider>
      </SessionProvider>
    </I18nProvider>
  );
}

export default App;
