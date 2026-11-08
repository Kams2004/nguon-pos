import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  ArrowRight,
  Banknote,
  Check,
  CheckCircle2,
  Clock,
  CreditCard,
  Minus,
  MoreHorizontal,
  Plus,
  Printer,
  Receipt as ReceiptIcon,
  Search,
  ShoppingCart,
  Smartphone,
  Ticket,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { useSession } from "../../context/SessionContext";
import { useBranding } from "../../context/BrandingContext";
import type { CartLine, IssuedTicket } from "../../lib/offline/sale";
import { till, type TodaySale } from "../../lib/till/backend";
import { usePrinterSettings } from "../../lib/till/printerSettings";
import type { GateSession } from "../../lib/offline/session";
import type { PaymentMethod } from "../../lib/api/types";
import { PAYMENT_LABELS, formatMoney, formatTime } from "../../lib/format";
import { resolveTicketDesign } from "../../lib/ticketDesign";
import { TicketTypeBadge, ticketColor, ticketIcon } from "../../lib/ticketIcons";
import GateHeader from "./GateHeader";
import Receipt, { type ReceiptLine } from "./Receipt";
import { effectivePrintMode } from "../../lib/printMode";
import TicketCard from "./TicketCard";
import { locale, useI18n } from "../../i18n";

const PAYMENT_METHODS: { value: PaymentMethod; icon: LucideIcon }[] = [
  { value: "CASH", icon: Banknote },
  { value: "MOBILE_MONEY", icon: Smartphone },
  { value: "CARD", icon: CreditCard },
  { value: "OTHER", icon: MoreHorizontal },
];

type CartItem = { ticketTypeId: string; quantity: number };

type CompletedSale = {
  transactionId: string;
  tickets: IssuedTicket[];
  lines: (ReceiptLine & { ticketTypeId: string })[];
  currency: string;
  paymentMethod: PaymentMethod;
  createdAtClient: string;
  received: number | null; // cash only
};

type PrintTarget = "all" | "receipt" | "tickets";

/** Quick cash buttons: the exact amount, then the next round banknote totals above it. */
function cashSuggestions(total: number): number[] {
  if (total <= 0) return [];
  const out = new Set<number>([total]);
  for (const step of [1_000, 5_000, 10_000]) {
    const up = Math.ceil(total / step) * step;
    if (up > total) out.add(up);
  }
  out.add(Math.ceil(total / 10_000) * 10_000 + 10_000);
  return [...out].sort((a, b) => a - b).slice(0, 4);
}

export default function Sell() {
  const { t } = useI18n();
  const { session, syncNow, refreshPendingCount } = useSession();
  const { logoUrl } = useBranding();
  const [printer] = usePrinterSettings();
  const ticketTypes = session?.bootstrap?.ticketTypes ?? [];
  const [cart, setCart] = useState<CartItem[]>([]);
  const [query, setQuery] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [received, setReceived] = useState("");
  const [completedSale, setCompletedSale] = useState<CompletedSale | null>(null);
  const [qrImages, setQrImages] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const startNewSale = useCallback(() => {
    setCompletedSale(null);
    setQrImages({});
    setCart([]);
    setReceived("");
    setPaymentMethod("CASH");
  }, []);

  // RequireGateSession (App.tsx) guarantees a gate-assigned session with
  // bootstrap data before this screen ever renders — this check is just
  // what lets TypeScript narrow `session` to GateSession for the rest of
  // the component.
  if (!session || !session.assignedGateId || !session.bootstrap) return null;
  // Explicit local, not just the narrowed `session` — narrowing from the
  // guard above doesn't reliably persist into the nested closures below.
  const gateSession = session as GateSession;
  const sharedDesign = resolveTicketDesign(gateSession.bootstrap.establishment);
  // This till's paper width wins over the establishment-wide one.
  const design = printer ? { ...sharedDesign, receipt: { ...sharedDesign.receipt, paperWidth: printer.paperWidth } } : sharedDesign;
  const typeById = (id: string) => ticketTypes.find((t) => t.id === id)!;
  const currency = ticketTypes[0]?.currency ?? "XAF";

  // A ticket type deactivated while it sat in the cart (live catalog update) drops out.
  const cartLines = cart
    .filter((c) => ticketTypes.some((t) => t.id === c.ticketTypeId))
    .map((c) => ({ ...c, type: typeById(c.ticketTypeId) }));
  const total = cartLines.reduce((s, l) => s + l.type.price * l.quantity, 0);
  const itemCount = cartLines.reduce((s, c) => s + c.quantity, 0);
  const receivedAmount = Number(received) || 0;
  const change = receivedAmount - total;
  const cashShort = paymentMethod === "CASH" && received !== "" && change < 0;

  const q = query.trim().toLowerCase();
  const visibleTypes = q ? ticketTypes.filter((t) => t.name.toLowerCase().includes(q)) : ticketTypes;

  const setQuantity = (ticketTypeId: string, quantity: number) =>
    setCart((prev) => {
      if (quantity <= 0) return prev.filter((c) => c.ticketTypeId !== ticketTypeId);
      if (prev.some((c) => c.ticketTypeId === ticketTypeId)) {
        return prev.map((c) => (c.ticketTypeId === ticketTypeId ? { ...c, quantity } : c));
      }
      return [...prev, { ticketTypeId, quantity }];
    });
  const quantityOf = (id: string) => cart.find((c) => c.ticketTypeId === id)?.quantity ?? 0;

  const handleConfirm = async () => {
    if (cartLines.length === 0 || cashShort) return;
    setSubmitting(true);
    try {
      const saleCart: CartLine[] = cartLines.map((l) => ({
        ticketTypeId: l.ticketTypeId,
        quantity: l.quantity,
        unitPrice: l.type.price,
      }));
      const result = await till.createSale(gateSession, saleCart, paymentMethod);
      // Only AFTER the offline write resolves do we render/print — see
      // docs/SYNC_PROTOCOL.md's "golden rule".
      setCompletedSale({
        transactionId: result.transactionId,
        tickets: result.tickets,
        lines: cartLines.map((l) => ({
          ticketTypeId: l.ticketTypeId,
          name: l.type.name,
          quantity: l.quantity,
          unitPrice: l.type.price,
        })),
        currency,
        paymentMethod,
        createdAtClient: new Date().toISOString(),
        received: paymentMethod === "CASH" && received !== "" ? receivedAmount : null,
      });
      const images: Record<string, string> = {};
      for (const t of result.tickets) {
        images[t.id] = await QRCode.toDataURL(t.qrContent, {
          width: 320,
          margin: 1,
        });
      }
      setQrImages(images);
      refreshPendingCount(); // reflect the new outbox entry immediately, online or not
      syncNow(); // fire-and-forget: sync immediately if online, otherwise it stays queued
    } finally {
      setSubmitting(false);
    }
  };

  if (completedSale) {
    return (
      <SaleComplete
        sale={completedSale}
        session={gateSession}
        qrImages={qrImages}
        logoUrl={logoUrl}
        design={design}
        onNewSale={startNewSale}
      />
    );
  }

  const suggestions = cashSuggestions(total);

  return (
    <div className="min-h-screen bg-background">
      <GateHeader />
      <div className="lg:flex lg:h-[calc(100dvh-62px)]">
        {/* Ticket tiles */}
        <section className={`min-w-0 flex-1 p-4 sm:p-5 lg:overflow-y-auto ${itemCount > 0 ? "pb-24 lg:pb-5" : ""}`}>
          <div className="mb-4 flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("gate.sell.searchPlaceholder")}
                className="field rounded-2xl py-3.5 pl-12 text-base"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
                  aria-label={t("common.clearSearch")}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <span className="hidden rounded-xl bg-card px-4 py-3.5 text-sm font-semibold text-muted-foreground shadow-sm sm:block">
              {t("gate.sell.ticketCount", { count: visibleTypes.length })}
            </span>
          </div>

          {ticketTypes.length === 0 ? (
            <p className="card p-8 text-center text-sm text-muted-foreground">{t("gate.sell.noTypes")}</p>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {visibleTypes.map((type) => {
                const qty = quantityOf(type.id);
                const Icon = ticketIcon(type.icon);
                const c = ticketColor(type.color);
                return (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => setQuantity(type.id, qty + 1)}
                    aria-label={
                      qty > 0 ? t("gate.sell.addAriaInCart", { name: type.name, qty }) : t("gate.sell.addAria", { name: type.name })
                    }
                    className={`group text-left transition-[transform,filter] duration-150 ease-out hover:-translate-y-0.5 active:scale-[0.98] ${
                      qty > 0
                        ? "-translate-y-0.5 [filter:drop-shadow(0_12px_18px_hsl(220_60%_20%/0.24))]"
                        : "[filter:drop-shadow(0_2px_5px_hsl(220_60%_20%/0.12))] hover:[filter:drop-shadow(0_8px_14px_hsl(220_60%_20%/0.18))]"
                    }`}
                  >
                    <div className="ticket-stub flex min-h-[176px] flex-col overflow-hidden rounded-2xl bg-card">
                      <div className={`flex h-[76px] items-center gap-3 px-4 ${c.solid}`}>
                        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/20">
                          <Icon className="h-6 w-6" strokeWidth={1.9} />
                        </span>
                        {qty > 0 && (
                          <span className="ml-auto flex h-9 min-w-9 items-center justify-center rounded-full bg-white px-2.5 text-base font-extrabold tabular-nums text-foreground shadow">
                            {qty}
                          </span>
                        )}
                      </div>
                      <div
                        className={`flex flex-1 flex-col justify-between border-t-2 border-dashed border-border px-4 pb-4 pt-3 transition-colors ${
                          qty > 0 ? c.soft.split(" ")[0] : ""
                        }`}
                      >
                        <p className="line-clamp-2 text-[15px] font-bold leading-tight text-foreground">{type.name}</p>
                        <p className="mt-2 font-display text-xl font-extrabold tabular-nums tracking-tight text-foreground">
                          {formatMoney(type.price, type.currency)}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Cart */}
        <aside
          id="panier"
          className="flex scroll-mt-20 flex-col border-t border-border bg-card lg:w-[440px] lg:border-l lg:border-t-0 xl:w-[480px]"
        >
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-secondary" />
              <h2 className="font-display text-lg font-bold text-foreground">{t("gate.sell.cartTitle")}</h2>
              <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-bold text-white">{itemCount}</span>
            </div>
            <button
              onClick={() => setCart([])}
              disabled={cartLines.length === 0}
              className="btn-outline px-3 py-2 text-xs text-destructive disabled:opacity-40"
            >
              <Trash2 className="h-4 w-4" /> {t("gate.sell.clearCart")}
            </button>
          </div>

          <div className="min-h-[120px] flex-1 divide-y divide-border overflow-y-auto px-5">
            {cartLines.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-center text-muted-foreground">
                <Ticket className="h-10 w-10 opacity-30" />
                <p className="text-sm">{t("gate.sell.emptyCart")}</p>
              </div>
            )}
            {cartLines.map((l) => (
              <div key={l.ticketTypeId} className="flex items-center gap-3 py-3">
                <TicketTypeBadge icon={l.type.icon} color={l.type.color} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-foreground">{l.type.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("gate.sell.perUnit", { price: formatMoney(l.type.price, l.type.currency) })}
                  </p>
                  <div className="mt-2 flex items-center gap-1.5">
                    <button
                      onClick={() => setQuantity(l.ticketTypeId, l.quantity - 1)}
                      className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-foreground hover:bg-muted active:scale-95"
                      aria-label={t("gate.sell.removeOne", { name: l.type.name })}
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="w-10 text-center text-base font-bold">{l.quantity}</span>
                    <button
                      onClick={() => setQuantity(l.ticketTypeId, l.quantity + 1)}
                      className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary text-white hover:brightness-110 active:scale-95"
                      aria-label={t("gate.sell.addOne", { name: l.type.name })}
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <button
                    onClick={() => setQuantity(l.ticketTypeId, 0)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-100 bg-red-50 text-destructive hover:bg-red-100"
                    aria-label={t("gate.sell.removeLine", { name: l.type.name })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <span className="whitespace-nowrap text-sm font-bold text-foreground">
                    {formatMoney(l.type.price * l.quantity, l.type.currency)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-4 border-t border-border bg-muted/30 px-5 py-4">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("gate.sell.totalDue")}</p>
                <p className="text-xs text-muted-foreground">
                  {t("gate.sell.ticketCount", { count: itemCount })}
                  {itemCount > 1 && ` · ${t("gate.sell.printedSeparately")}`}
                </p>
              </div>
              <p className="font-display text-3xl font-bold text-foreground">{formatMoney(total, currency)}</p>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {PAYMENT_METHODS.map(({ value, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPaymentMethod(value)}
                  aria-pressed={paymentMethod === value}
                  className={`flex h-16 flex-col items-center justify-center gap-1 rounded-xl border-2 text-[11px] font-bold leading-tight transition-colors ${
                    paymentMethod === value
                      ? "border-secondary bg-secondary text-white shadow-md shadow-secondary/30"
                      : "border-border bg-card text-muted-foreground hover:border-secondary/40 hover:text-foreground"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  {PAYMENT_LABELS[value]}
                </button>
              ))}
            </div>

            {paymentMethod === "CASH" && total > 0 && (
              <div className="space-y-2">
                <div className="grid grid-cols-4 gap-2">
                  {suggestions.map((amount, i) => (
                    <button
                      key={amount}
                      type="button"
                      onClick={() => setReceived(String(amount))}
                      className={`rounded-xl border px-1 py-2 text-xs font-bold transition-colors ${
                        receivedAmount === amount ? "border-secondary bg-blue-50 text-secondary" : "border-border bg-card hover:bg-muted"
                      }`}
                    >
                      {i === 0 ? t("gate.sell.exact") : amount.toLocaleString(locale())}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="field-label">{t("gate.sell.received")}</label>
                    <input
                      type="number"
                      min="0"
                      inputMode="numeric"
                      value={received}
                      onChange={(e) => setReceived(e.target.value)}
                      placeholder={String(total)}
                      className="field text-base font-bold"
                    />
                  </div>
                  <div>
                    <label className="field-label">{t("gate.sell.changeDue")}</label>
                    <p
                      className={`rounded-xl border px-3.5 py-2.5 text-base font-bold ${
                        cashShort
                          ? "border-red-200 bg-red-50 text-destructive"
                          : received !== ""
                            ? "border-amber-200 bg-amber-50 text-amber-800"
                            : "border-border bg-card text-muted-foreground"
                      }`}
                    >
                      {received === ""
                        ? "—"
                        : cashShort
                          ? t("gate.sell.short", { amount: formatMoney(-change, currency) })
                          : formatMoney(change, currency)}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={handleConfirm}
              disabled={submitting || cartLines.length === 0 || cashShort}
              className="btn-gold w-full py-4 text-lg"
            >
              {submitting ? (
                <>
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                  {t("gate.sell.saving")}
                </>
              ) : (
                <>
                  {t("gate.sell.charge")} {total > 0 && formatMoney(total, currency)} <ArrowRight className="h-5 w-5" />
                </>
              )}
            </button>
          </div>
        </aside>
      </div>

      {/* Phones/tablets: the cart sits below the grid, so keep the total and a jump to it always in reach */}
      {itemCount > 0 && (
        <a
          href="#panier"
          className="fixed inset-x-3 bottom-3 z-20 flex items-center justify-between rounded-2xl bg-royal px-5 py-3.5 text-white shadow-xl shadow-royal/30 lg:hidden"
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <ShoppingCart className="h-4 w-4" /> {t("gate.sell.cartWithCount", { n: itemCount })}
          </span>
          <span className="flex items-center gap-2 font-display font-bold">
            {formatMoney(total, currency)} <ArrowRight className="h-4 w-4 text-primary" />
          </span>
        </a>
      )}
    </div>
  );
}

/** This till's sales today, from its own local store — works offline, and shows what's still unsent. */
function useTodaySales(session: GateSession, refreshKey: unknown): TodaySale[] {
  const [sales, setSales] = useState<TodaySale[]>([]);
  useEffect(() => {
    till
      .todaySales(session)
      .then(setSales)
      .catch(() => {
        /* keep the last list; the next sale or sync refreshes it */
      });
  }, [session, refreshKey]);
  return sales;
}

function SaleComplete({
  sale,
  session,
  qrImages,
  logoUrl,
  design,
  onNewSale,
}: {
  sale: CompletedSale;
  session: GateSession;
  qrImages: Record<string, string>;
  logoUrl: string;
  design: ReturnType<typeof resolveTicketDesign>;
  onNewSale: () => void;
}) {
  const { t } = useI18n();
  const { pendingCount } = useSession();
  const [printTarget, setPrintTarget] = useState<PrintTarget>("all");
  const [printer] = usePrinterSettings();
  const autoPrinted = useRef(false);
  // Re-read the local store as this sale (and earlier ones) sync.
  const today = useTodaySales(session, `${sale.transactionId}-${pendingCount}`);
  const saleTotal = sale.lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const n = sale.tickets.length;
  const change = sale.received !== null ? sale.received - saleTotal : null;
  const thisSale = today.find((s) => s.id === sale.transactionId);
  const newSaleRef = useRef<HTMLButtonElement>(null);
  const paperClass = design.receipt.paperWidth === 58 ? "paper-58" : "";
  const receiptMode = session.bootstrap.establishment.receiptMode;
  const modeOf = (ticketTypeId: string) =>
    effectivePrintMode(receiptMode, session.bootstrap.ticketTypes.find((t) => t.id === ticketTypeId)?.printMode);
  const lineOf = (ticketTypeId: string) => sale.lines.find((l) => l.ticketTypeId === ticketTypeId)!;
  // "Standard" entries ride on the receipt; the rest get their own ticket each.
  const receiptEntries = sale.tickets
    .filter((t) => modeOf(t.ticketTypeId) === "STANDARD")
    .map((t) => ({
      ticketNumber: t.ticketNumber,
      typeName: lineOf(t.ticketTypeId).name,
      qrImage: qrImages[t.id],
    }));
  const separateTickets = sale.tickets.filter((t) => modeOf(t.ticketTypeId) === "INDIVIDUAL");
  const ns = separateTickets.length;

  // Enter = next customer, the most common action after a sale.
  useEffect(() => {
    newSaleRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        onNewSale();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onNewSale]);

  const print = (target: PrintTarget) => {
    setPrintTarget(target);
    // Let React apply the print:hidden classes before the dialog opens.
    setTimeout(() => window.print(), 50);
  };

  // Automatic printing, as set for this till — once every QR code is drawn.
  useEffect(() => {
    if (!printer || printer.autoPrint === "NONE" || autoPrinted.current) return;
    if (sale.tickets.some((tk) => !qrImages[tk.id])) return;
    autoPrinted.current = true;
    const target: PrintTarget =
      printer.autoPrint === "RECEIPT" ? "receipt" : printer.autoPrint === "ALL" ? "all" : ns > 0 ? "tickets" : "receipt";
    print(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printer, qrImages]);

  const receipt = (
    <Receipt
      design={design}
      logoUrl={session.bootstrap.establishment.logoUrl ?? logoUrl}
      establishmentName={session.bootstrap.establishment.name}
      gateName={session.bootstrap.gate.name}
      cashierName={session.fullName}
      reference={thisSale?.reference ?? `LOC-${sale.transactionId.slice(0, 8)}`}
      createdAtClient={sale.createdAtClient}
      lines={sale.lines}
      currency={sale.currency}
      paymentMethod={sale.paymentMethod}
      ticketCount={sale.tickets.length}
      received={sale.received}
      entries={receiptEntries}
    />
  );

  const todayTotal = today.reduce((s, x) => s + x.total, 0);
  const todayTickets = today.reduce((s, x) => s + x.tickets, 0);
  const todayPending = today.filter((x) => !x.synced).length;

  return (
    <div className="min-h-screen bg-background" style={{ "--print-offset": `${printer?.offsetMm ?? 0}mm` } as React.CSSProperties}>
      {/* Zero page margins for the thermal roll — only while this screen
          is mounted, so reports elsewhere keep the browser's default
          margins. The paper itself (80mm roll, cut at end of content) is
          the thermal printer driver's paper setting: CSS can't express
          "80mm wide, as long as the content" (`size: 80mm auto` is
          invalid and silently dropped). */}
      <style>{"@page { margin: 0; }"}</style>
      <GateHeader />

      <div className="mx-auto max-w-[1920px] space-y-5 p-4 sm:p-6">
        {/* Outcome + actions */}
        <section className="no-print card relative overflow-hidden">
          <div className="absolute inset-y-0 left-0 w-1.5 bg-success" />
          <div className="grid gap-5 p-5 sm:p-6 xl:grid-cols-[1fr_auto] xl:items-center">
            <div className="flex flex-wrap items-center gap-5">
              <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full bg-success text-white shadow-lg shadow-success/30">
                <Check className="h-9 w-9" strokeWidth={3} />
              </div>
              <div>
                <h2 className="font-display text-2xl font-bold text-royal">{t("gate.done.title")}</h2>
                <p className="text-sm text-muted-foreground">
                  {ns === 0
                    ? t("gate.done.summaryReceipt", { count: n })
                    : ns === n
                      ? n === 1
                        ? t("gate.done.summaryOneTicket")
                        : t("gate.done.summaryAllTickets", { n })
                      : t("gate.done.summaryMixed", { entries: t("gate.done.entries", { count: n }), count: ns })}{" "}
                  · {PAYMENT_LABELS[sale.paymentMethod]} · {formatTime(sale.createdAtClient)}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <div className="rounded-2xl bg-muted/60 px-4 py-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("gate.done.amount")}</p>
                  <p className="font-display text-2xl font-bold text-foreground">{formatMoney(saleTotal, sale.currency)}</p>
                </div>
                {change !== null && (
                  <div className="rounded-2xl bg-amber-50 px-4 py-2.5 ring-1 ring-amber-200">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">{t("gate.sell.changeDue")}</p>
                    <p className="font-display text-2xl font-bold text-amber-800">{formatMoney(change, sale.currency)}</p>
                  </div>
                )}
                <div className="rounded-2xl bg-muted/60 px-4 py-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("gate.done.reference")}</p>
                  <p className="font-mono text-sm font-bold text-foreground">
                    {thisSale?.reference ?? `LOC-${sale.transactionId.slice(0, 8)}`}
                  </p>
                  <p
                    className={`flex items-center gap-1 text-[11px] font-semibold ${thisSale?.synced ? "text-success" : "text-amber-700"}`}
                  >
                    {thisSale?.synced ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                    {thisSale?.synced ? t("gate.done.synced") : t("gate.done.waitingToSend")}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 xl:w-[420px]">
              <button onClick={() => print("all")} className="btn-blue py-3 sm:col-span-2">
                <Printer className="h-4 w-4" />
                {ns === 0 ? t("gate.done.printReceipt") : t("gate.done.printAll", { count: ns })}
              </button>
              {ns > 0 && (
                <>
                  <button onClick={() => print("receipt")} className="btn-outline py-2.5">
                    <ReceiptIcon className="h-4 w-4" /> {t("gate.done.receiptOnly")}
                  </button>
                  <button onClick={() => print("tickets")} className="btn-outline py-2.5">
                    <Ticket className="h-4 w-4" /> {t("gate.done.ticketsOnly", { count: ns })}
                  </button>
                </>
              )}
              <button ref={newSaleRef} onClick={onNewSale} className="btn-gold py-3.5 text-base sm:col-span-2">
                <ShoppingCart className="h-5 w-5" /> {t("gate.done.newSale")}
                <kbd className="ml-1 rounded border border-primary-foreground/30 px-1.5 text-[10px] font-semibold">
                  {t("gate.done.enterKey")}
                </kbd>
              </button>
            </div>
          </div>
        </section>

        {/* Printable column: the till receipt first, then one full ticket per entry, each on its own page */}
        <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
          <div className="space-y-5">
            <div className={`print-thermal ${paperClass} ${printTarget === "tickets" ? "print:hidden" : ""}`}>
              <p className="no-print mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                <ReceiptIcon className="h-4 w-4" /> {t("gate.done.receiptHeading")}
              </p>
              {receipt}
              {/* Extra copies of the receipt, as set for this till: printed only. */}
              {Array.from({ length: Math.max(0, (printer?.copies ?? 1) - 1) }, (_, i) => (
                <div key={i} className="print-page-break hidden print:block">
                  {receipt}
                </div>
              ))}
            </div>

            <div className="no-print card p-5">
              <h3 className="font-display text-sm font-bold text-foreground">{t("gate.done.tillToday")}</h3>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-muted/60 px-2 py-2.5">
                  <p className="font-display text-lg font-bold">{today.length}</p>
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground">{t("gate.done.sales")}</p>
                </div>
                <div className="rounded-xl bg-muted/60 px-2 py-2.5">
                  <p className="font-display text-lg font-bold">{todayTickets}</p>
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground">{t("gate.done.tickets")}</p>
                </div>
                <div className={`rounded-xl px-2 py-2.5 ${todayPending ? "bg-amber-50" : "bg-emerald-50"}`}>
                  <p className={`font-display text-lg font-bold ${todayPending ? "text-amber-800" : "text-emerald-700"}`}>{todayPending}</p>
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground">{t("gate.done.toSend")}</p>
                </div>
              </div>
              <p className="mt-3 flex items-baseline justify-between rounded-xl bg-blue-50 px-3 py-2.5">
                <span className="text-xs font-semibold text-secondary">{t("gate.done.takenToday")}</span>
                <span className="font-display text-lg font-bold text-royal">{formatMoney(todayTotal)}</span>
              </p>

              <h4 className="mt-4 text-xs font-bold uppercase tracking-wide text-muted-foreground">{t("gate.done.recentSales")}</h4>
              <ul className="mt-2 divide-y divide-border">
                {today.slice(0, 6).map((s) => (
                  <li key={s.id} className={`flex items-center gap-2 py-2 text-xs ${s.id === sale.transactionId ? "font-bold" : ""}`}>
                    <span className="w-11 text-muted-foreground">{formatTime(s.at)}</span>
                    <span className="min-w-0 flex-1 truncate font-mono">{s.reference ?? `LOC-${s.id.slice(0, 8)}`}</span>
                    <span className="whitespace-nowrap">{formatMoney(s.total)}</span>
                    {s.synced ? (
                      <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-success" aria-label={t("gate.done.synced")} />
                    ) : (
                      <Clock className="h-3.5 w-3.5 flex-shrink-0 text-amber-600" aria-label={t("gate.done.pending")} />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {ns === 0 ? (
            <div className="no-print card flex h-fit items-start gap-3 p-5 text-sm text-muted-foreground">
              <ReceiptIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-secondary" />
              <p>
                {t("gate.done.printMode")} <strong className="text-foreground">{t("gate.done.standard")}</strong>
                {t("gate.done.standardBody", { count: n })}
              </p>
            </div>
          ) : (
            <div className={`print-thermal ${paperClass} ${printTarget === "receipt" ? "print:hidden" : ""}`}>
              <p className="no-print mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                <Ticket className="h-4 w-4" /> {t("gate.done.ticketsHeading", { count: ns })}
              </p>
              <div className="grid gap-5 sm:grid-cols-2 2xl:grid-cols-3 print:block">
                {separateTickets.map((t, i) => {
                  const line = lineOf(t.ticketTypeId);
                  // Each ticket starts its own page — except the very first one when it's printed alone.
                  const pageBreak = i > 0 || printTarget === "all";
                  return (
                    <div key={t.id} className={pageBreak ? "print-page-break" : ""}>
                      <TicketCard
                        design={design}
                        logoUrl={logoUrl}
                        gateName={session.bootstrap.gate.name}
                        ticketNumber={t.ticketNumber}
                        ticketTypeName={line.name}
                        price={line.unitPrice}
                        currency={sale.currency}
                        createdAtClient={sale.createdAtClient}
                        qrImage={qrImages[t.id]}
                        index={i}
                        total={ns}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
