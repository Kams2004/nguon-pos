import { Navigate, Route, BrowserRouter, Routes } from "react-router-dom";
import { SessionProvider, useSession } from "./context/SessionContext";
import Login from "./routes/gate/Login";
import Sell from "./routes/gate/Sell";
import Scan from "./routes/gate/Scan";

function RequireSession({ children }: { children: React.ReactNode }) {
  const { session } = useSession();
  if (!session) return <Navigate to="/login" replace />;
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
          <RequireSession>
            <Sell />
          </RequireSession>
        }
      />
      <Route
        path="/gate/scan"
        element={
          <RequireSession>
            <Scan />
          </RequireSession>
        }
      />
      <Route path="*" element={<Navigate to={session ? "/gate/sell" : "/login"} replace />} />
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
