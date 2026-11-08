import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { PaymentMethod } from "../../lib/api/types";
import { PAYMENT_LABELS, formatMoney } from "../../lib/format";
import { fillPlaceholders, type ResolvedTicketDesign } from "../../lib/ticketDesign";
import { locale, useI18n } from "../../i18n";

export type ReceiptLine = { name: string; quantity: number; unitPrice: number };
/** An entry printed on the receipt itself (print mode "Standard"). */
export type ReceiptEntry = {
  ticketNumber: string;
  typeName: string;
  qrImage: string | undefined;
};

export type ReceiptProps = {
  design: ResolvedTicketDesign;
  logoUrl: string | null;
  establishmentName: string;
  gateName: string;
  cashierName: string;
  reference: string; // server reference once synced, else the local LOC-… one
  createdAtClient: string;
  lines: ReceiptLine[];
  currency: string;
  paymentMethod: PaymentMethod;
  ticketCount: number;
  received?: number | null; // cash only
  /** Entries whose QR codes go on this receipt rather than on separate tickets. */
  entries?: ReceiptEntry[];
};

/**
 * Compact thermal receipt — the payment/till slip. 72mm print area on an
 * 80mm roll, 48mm on a 58mm roll (chosen in "Billet & reçu"). It proves
 * what was paid. In print mode "Individuel" it is never an entry credential:
 * entry QR codes are on the individual TicketCards. In mode "Standard" the
 * entries are printed here instead (`entries`), one signed QR per entry, so
 * a single slip covers the purchase. The optional reference QR only encodes
 * the sale reference, for looking the sale up in the back office.
 * The transaction hasn't necessarily synced yet when this prints — offline
 * sales must still produce a usable receipt — so it shows the
 * client-generated reference (LOC-…) rather than blocking on or faking a
 * server reference number; the two stay linked in the back office.
 */
export default function Receipt({
  design,
  logoUrl,
  establishmentName,
  gateName,
  cashierName,
  reference,
  createdAtClient,
  lines,
  currency,
  paymentMethod,
  ticketCount,
  received = null,
  entries = [],
}: ReceiptProps) {
  const { t } = useI18n();
  const o = design.receipt;
  const total = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const date = new Date(createdAtClient);
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    if (!o.showQr) return setQr(null);
    QRCode.toDataURL(reference, { width: 160, margin: 0 })
      .then(setQr)
      .catch(() => setQr(null));
  }, [o.showQr, reference]);

  const header = o.headerLines
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const legal = o.legalLines
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const showCash = o.showCashDetails && paymentMethod === "CASH" && received !== null && received >= total;

  return (
    <div
      data-paper={o.paperWidth}
      className={`receipt mx-auto border border-border bg-white p-4 font-mono leading-tight text-black print:rounded-none print:border-0 print:p-0 ${
        o.fontSize === "s" ? "text-[10px]" : "text-xs"
      } rounded-lg`}
    >
      <div className="mb-3 space-y-1 text-center">
        {o.showLogo && logoUrl && <img src={logoUrl} alt="" className="mx-auto h-10 object-contain" />}
        {o.showName && <p className="text-sm font-bold">{establishmentName}</p>}
        {header.map((l, i) => (
          <p key={i} className="text-[10px]">
            {l}
          </p>
        ))}
        {o.showGate && <p className="text-[10px]">{gateName}</p>}
      </div>

      <Rule />

      <div className="space-y-0.5">
        <Row label={t("gate.receipt.ref")} value={reference} />
        <Row
          label={t("gate.receipt.date")}
          value={date.toLocaleString(locale(), {
            dateStyle: "short",
            timeStyle: "short",
          })}
        />
        {o.showCashier && <Row label={t("role.CASHIER")} value={cashierName} />}
      </div>

      <Rule />

      <div className="space-y-1">
        {lines.map((l, i) =>
          o.showUnitPrices ? (
            <div key={i}>
              <p>{l.name}</p>
              <div className="flex justify-between gap-2">
                <span>
                  {l.quantity} × {formatMoney(l.unitPrice, currency)}
                </span>
                <span className="whitespace-nowrap">{formatMoney(l.unitPrice * l.quantity, currency)}</span>
              </div>
            </div>
          ) : (
            <div key={i} className="flex justify-between gap-2">
              <span>
                {l.quantity} × {l.name}
              </span>
              <span className="whitespace-nowrap">{formatMoney(l.unitPrice * l.quantity, currency)}</span>
            </div>
          ),
        )}
      </div>

      <Rule />

      <div className="flex justify-between text-sm font-bold">
        <span>{t("gate.receipt.total")}</span>
        <span>{formatMoney(total, currency)}</span>
      </div>
      {o.showPayment && <Row label={t("gate.receipt.payment")} value={PAYMENT_LABELS[paymentMethod]} />}
      {showCash && (
        <>
          <Row label={t("gate.receipt.received")} value={formatMoney(received!, currency)} />
          <Row label={t("gate.receipt.change")} value={formatMoney(received! - total, currency)} />
        </>
      )}

      {entries.length > 0 && (
        <>
          <Rule />
          <p className="text-center text-[10px] font-bold uppercase">{t("gate.receipt.entries", { count: entries.length })}</p>
          <div className={`mt-2 grid gap-x-2 gap-y-3 ${o.paperWidth === 58 || entries.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
            {entries.map((e, i) => (
              <div key={e.ticketNumber} className="break-inside-avoid text-center">
                {e.qrImage ? (
                  <img src={e.qrImage} alt={e.ticketNumber} className="mx-auto h-28 w-28" />
                ) : (
                  <div className="mx-auto h-28 w-28 animate-pulse bg-black/5" />
                )}
                <p className="mt-1 text-[10px] font-bold">{e.typeName}</p>
                <p className="text-[9px]">
                  {e.ticketNumber}
                  {entries.length > 1 ? ` · ${i + 1}/${entries.length}` : ""}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-center text-[9px]">{t("gate.receipt.singleUse")}</p>
        </>
      )}
      {o.showTicketCount && ticketCount > entries.length && (
        <>
          <Rule />
          <p className="text-center text-[9px]">{t("gate.receipt.seeTickets", { count: ticketCount - entries.length })}</p>
        </>
      )}
      {qr && (
        <div className="mt-2 flex justify-center">
          <img src={qr} alt={reference} className="h-20 w-20" />
        </div>
      )}
      {legal.length > 0 && (
        <>
          <Rule />
          {legal.map((l, i) => (
            <p key={i} className="text-center text-[9px]">
              {l}
            </p>
          ))}
        </>
      )}
      <Rule />
      <p className="text-center text-[9px]">{fillPlaceholders(design.receiptFooter, gateName)}</p>
    </div>
  );
}

function Rule() {
  return <div className="my-2 border-t border-dashed border-black/40" />;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-black/60">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
