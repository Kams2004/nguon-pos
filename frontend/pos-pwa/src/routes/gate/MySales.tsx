import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { CheckCircle2, Clock, History, Printer, Search } from "lucide-react";
import { useSession } from "../../context/SessionContext";
import { useBranding } from "../../context/BrandingContext";
import { till, type TodaySale } from "../../lib/till/backend";
import { usePrinterSettings } from "../../lib/till/printerSettings";
import type { GateSession } from "../../lib/offline/session";
import { formatDateTime, formatMoney, formatTime } from "../../lib/format";
import { resolveTicketDesign } from "../../lib/ticketDesign";
import { SkeletonRows } from "../../components/ui";
import { useI18n } from "../../i18n";
import GateHeader from "./GateHeader";
import { SaleComplete, type CompletedSale } from "./Sell";

type Period = "today" | "all";
const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

/**
 * "Mes ventes": every sale of the signed-in cashier on this till, newest
 * first, each one printable again — for when the printer jammed, ran out
 * of paper, or the customer lost a ticket. Works offline (local data).
 */
export default function MySales() {
  const { t } = useI18n();
  const { session, pendingCount } = useSession();
  const { logoUrl } = useBranding();
  const [printer] = usePrinterSettings();
  const [sales, setSales] = useState<TodaySale[] | null>(null);
  const [period, setPeriod] = useState<Period>("today");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [shown, setShown] = useState<{ sale: CompletedSale; qr: Record<string, string> } | null>(null);

  const gateSession = session?.assignedGateId && session.bootstrap ? (session as GateSession) : null;

  const load = useCallback(() => {
    if (!gateSession) return;
    till
      .mySales(gateSession)
      .then((s) => {
        setSales(s);
        setError(null);
      })
      .catch(() => setError(t("gate.mySales.loadError")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gateSession?.token]);

  // Reload as sales sync (their reference changes from the till's to central's).
  useEffect(() => {
    load();
  }, [load, pendingCount]);

  if (!gateSession) return null;
  const shared = resolveTicketDesign(gateSession.bootstrap.establishment);
  const design = printer ? { ...shared, receipt: { ...shared.receipt, paperWidth: printer.paperWidth } } : shared;

  const open = async (id: string) => {
    setOpening(id);
    setError(null);
    try {
      const s = await till.saleForReprint(gateSession, id);
      if (!s) throw new Error("not found");
      const qr: Record<string, string> = {};
      for (const tk of s.tickets) qr[tk.id] = await QRCode.toDataURL(tk.qrContent, { width: 320, margin: 1 });
      setShown({ sale: { ...s, received: null }, qr });
    } catch {
      setError(t("gate.mySales.openError"));
    } finally {
      setOpening(null);
    }
  };

  if (shown) {
    return (
      <SaleComplete
        mode="reprint"
        sale={shown.sale}
        session={gateSession}
        qrImages={shown.qr}
        logoUrl={logoUrl}
        design={design}
        onNewSale={() => setShown(null)}
      />
    );
  }

  const q = query.trim().toLowerCase();
  const visible = (sales ?? [])
    .filter((s) => period === "all" || isToday(s.at))
    .filter((s) => !q || (s.reference ?? s.id).toLowerCase().includes(q));
  const total = visible.reduce((sum, s) => sum + s.total, 0);
  const tickets = visible.reduce((sum, s) => sum + s.tickets, 0);

  return (
    <div className="min-h-screen bg-background">
      <GateHeader />
      <div className="mx-auto max-w-[1400px] space-y-5 p-4 sm:p-6">
        <section className="card p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="flex items-center gap-2 font-display text-2xl font-bold text-royal">
                <History className="h-6 w-6" /> {t("gate.mySales.title")}
              </h1>
              <p className="mt-1 max-w-[65ch] text-sm text-muted-foreground">
                {t("gate.mySales.subtitle", { name: gateSession.fullName })}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-xl bg-muted p-1" role="group" aria-label={t("gate.mySales.period")}>
                {(["today", "all"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    aria-pressed={period === p}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold ${period === p ? "bg-card text-royal shadow-sm" : "text-muted-foreground"}`}
                  >
                    {t(p === "today" ? "gate.mySales.today" : "gate.mySales.all")}
                  </button>
                ))}
              </div>
              <label className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("gate.mySales.search")}
                  aria-label={t("gate.mySales.search")}
                  className="field w-60 py-2 pl-9"
                />
              </label>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2 sm:max-w-lg">
            <div className="rounded-xl bg-muted/60 px-3 py-2.5">
              <p className="font-display text-lg font-bold">{visible.length}</p>
              <p className="text-[10px] font-semibold uppercase text-muted-foreground">{t("gate.done.sales")}</p>
            </div>
            <div className="rounded-xl bg-muted/60 px-3 py-2.5">
              <p className="font-display text-lg font-bold">{tickets}</p>
              <p className="text-[10px] font-semibold uppercase text-muted-foreground">{t("gate.done.tickets")}</p>
            </div>
            <div className="rounded-xl bg-blue-50 px-3 py-2.5">
              <p className="font-display text-lg font-bold text-royal">{formatMoney(total)}</p>
              <p className="text-[10px] font-semibold uppercase text-secondary">{t("gate.mySales.amount")}</p>
            </div>
          </div>
        </section>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-destructive">{error}</p>}

        <section className="card overflow-hidden">
          {sales === null ? (
            <SkeletonRows rows={6} cols={5} />
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-10 text-center">
              <History className="h-10 w-10 text-royal/25" strokeWidth={1.5} />
              <p className="text-sm text-muted-foreground">
                {q ? t("gate.mySales.noMatch") : period === "today" ? t("gate.mySales.emptyToday") : t("gate.mySales.empty")}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border/70">
              {visible.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-3.5">
                  <span className="w-28 text-sm tabular-nums text-muted-foreground">
                    {period === "today" ? formatTime(s.at) : formatDateTime(s.at)}
                  </span>
                  <span className="min-w-[10rem] flex-1 font-mono text-sm font-semibold text-foreground">
                    {s.reference ?? `LOC-${s.id.slice(0, 8)}`}
                  </span>
                  <span className="w-24 text-sm text-muted-foreground">{t("gate.mySales.tickets", { count: s.tickets })}</span>
                  <span className="w-28 text-right font-display font-bold tabular-nums text-foreground">{formatMoney(s.total)}</span>
                  <span className="w-6" title={s.synced ? t("gate.done.synced") : t("gate.done.waitingToSend")}>
                    {s.synced ? (
                      <CheckCircle2 className="h-4 w-4 text-success" aria-label={t("gate.done.synced")} />
                    ) : (
                      <Clock className="h-4 w-4 text-amber-600" aria-label={t("gate.done.waitingToSend")} />
                    )}
                  </span>
                  <button onClick={() => open(s.id)} disabled={opening !== null} className="btn-blue px-4 py-2 text-xs">
                    <Printer className="h-3.5 w-3.5" /> {opening === s.id ? t("gate.mySales.opening") : t("gate.mySales.reprint")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
