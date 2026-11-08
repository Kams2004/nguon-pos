import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { BellRing } from "lucide-react";
import { useSession } from "../context/SessionContext";
import { api } from "../lib/api/client";
import type { SubscriptionOverview } from "../lib/api/types";

/**
 * Due-date alert for the Super Admin (cahier §9.4 "alertes d'échéance"),
 * shown only once the module is switched on. Re-checked on navigation.
 */
export function SubscriptionAlert() {
  const { session } = useSession();
  const { pathname } = useLocation();
  const [data, setData] = useState<SubscriptionOverview | null>(null);

  useEffect(() => {
    if (session?.role !== "SUPER_ADMIN") return;
    api
      .getSubscription(session.token)
      .then(setData)
      .catch(() => setData(null));
  }, [session, pathname]);

  if (!data?.settings.moduleEnabled || pathname === "/admin/subscription") return null;
  const { state, daysRemaining, coveredUntil } = data.status;
  const until = coveredUntil ? new Date(`${coveredUntil}T12:00:00`).toLocaleDateString("fr-FR") : "";
  const message =
    state === "TO_RENEW"
      ? `L'abonnement arrive à échéance le ${until} (dans ${daysRemaining} jour${daysRemaining === 1 ? "" : "s"}).`
      : state === "EXPIRED"
        ? `L'abonnement a expiré le ${until}.`
        : state === "PENDING_PAYMENT"
          ? "Une période d'abonnement est en attente de paiement."
          : null;
  if (!message) return null;

  return (
    <div className="no-print flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <BellRing className="h-4 w-4 flex-shrink-0" />
      <span className="flex-1">{message} Les caisses continuent de fonctionner normalement.</span>
      <Link to="/admin/subscription" className="btn-outline bg-white px-3 py-1.5 text-xs">
        Voir l'abonnement
      </Link>
    </div>
  );
}
