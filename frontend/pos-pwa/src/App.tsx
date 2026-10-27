import { Navigate, Route, BrowserRouter, Routes } from "react-router-dom";
import { SessionProvider, useSession } from "./context/SessionContext";
import Login from "./routes/gate/Login";
import Sell from "./routes/gate/Sell";
import Scan from "./routes/gate/Scan";
import AdminLayout from "./routes/admin/AdminLayout";
import Gates from "./routes/admin/Gates";
import TicketTypes from "./routes/admin/TicketTypes";
import Users from "./routes/admin/Users";
import Establishment from "./routes/admin/Establishment";
import Sales from "./routes/admin/Sales";
import SyncStatus from "./routes/admin/SyncStatus";

// Gate screens (Sell/Scan) need real bootstrap data (ticket types, the
// gate's QR signing secret) — a gateless user (SUPER_ADMIN, and
// potentially COORDINATOR) never has that, so send them to the admin area
// instead of letting these screens render against a null bootstrap.
function RequireGateSession({ children }: { children: React.ReactNode }) {
  const { session } = useSession();
  if (!session) return <Navigate to="/login" replace />;
  if (!session.assignedGateId) return <Navigate to="/admin/sales" replace />;
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
        <Route path="sales" element={<Sales />} />
        <Route path="sync-status" element={<SyncStatus />} />
        <Route path="gates" element={<Gates />} />
        <Route path="ticket-types" element={<TicketTypes />} />
        <Route path="users" element={<Users />} />
        <Route path="establishment" element={<Establishment />} />
        <Route index element={<Navigate to="sales" replace />} />
      </Route>
      <Route
        path="*"
        element={<Navigate to={session ? (session.assignedGateId ? "/gate/sell" : "/admin/sales") : "/login"} replace />}
      />
    </Routes>
  );
}

function App() {
  return (
    <SessionProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </SessionProvider>
  );
}

export default App;
