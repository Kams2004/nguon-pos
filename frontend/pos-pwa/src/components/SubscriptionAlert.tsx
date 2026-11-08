import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { BellRing } from "lucide-react";
import { useSession } from "../context/SessionContext";
import { api } from "../lib/api/client";
import type { SubscriptionOverview } from "../lib/api/types";
import { locale, useI18n } from "../i18n";

/**
 * Due-date alert for the Super Admin (cahier §9.4 "alertes d'échéance"),
 * shown only once the module is switched on. Re-checked on navigation.
 */
export function SubscriptionAlert() {
  const { t } = useI18n();
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
  const until = coveredUntil ? new Date(`${coveredUntil}T12:00:00`).toLocaleDateString(locale()) : "";
  const message =
    state === "TO_RENEW"
      ? t("settings.subscriptionAlert.toRenew", { date: until, count: daysRemaining ?? 0 })
      : state === "EXPIRED"
        ? t("settings.subscriptionAlert.expired", { date: until })
        : state === "PENDING_PAYMENT"
          ? t("settings.subscriptionAlert.pending")
          : null;
  if (!message) return null;

  return (
    <div className="no-print flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <BellRing className="h-4 w-4 flex-shrink-0" />
      <span className="flex-1">
        {message} {t("settings.subscriptionAlert.tillsUnaffected")}
      </span>
      <Link to="/admin/subscription" className="btn-outline bg-white px-3 py-1.5 text-xs">
        {t("settings.subscriptionAlert.view")}
      </Link>
    </div>
  );
}
