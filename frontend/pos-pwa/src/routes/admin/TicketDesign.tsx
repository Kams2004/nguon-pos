import { useEffect, useMemo, useState } from "react";
import { Printer, Receipt as ReceiptIcon, RotateCcw, Save, Ticket } from "lucide-react";
import { useSession } from "../../context/SessionContext";
import { useConfirm } from "../../context/ConfirmContext";
import { useBranding } from "../../context/BrandingContext";
import { api, errorMessage } from "../../lib/api/client";
import type { AdminEstablishment, TicketDesign as TicketTexts } from "../../lib/api/types";
import {
  RECEIPT_OPTION_DEFAULTS,
  TICKET_DEFAULTS,
  TICKET_OPTION_DEFAULTS,
  resolveTicketDesign,
  type ReceiptOptions,
  type TicketOptions,
} from "../../lib/ticketDesign";
import { CardHeader, Loading, PageHeader } from "../../components/ui";
import { ImageField } from "../../components/MediaLibrary";
import TicketCard from "../gate/TicketCard";
import Receipt from "../gate/Receipt";
import { translate, useI18n } from "../../i18n";

type Tab = "ticket" | "receipt";

const ACCENTS = ["#0A4DA2", "#1E5FD9", "#B8860B", "#0F766E", "#15803D", "#7C3AED", "#BE123C", "#C2410C", "#111827"];

// A sample QR so the preview looks like the real thing (not a valid ticket).
const SAMPLE_QR =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21 21" shape-rendering="crispEdges"><rect width="21" height="21" fill="#fff"/>${Array.from(
      { length: 120 },
      (_, i) => `<rect x="${(i * 7) % 21}" y="${(i * 11) % 21}" width="1" height="1"/>`,
    ).join(
      "",
    )}<path d="M0 0h7v7H0zM14 0h7v7h-7zM0 14h7v7H0z" fill="#000"/><path d="M1 1h5v5H1zM15 1h5v5h-5zM1 15h5v5H1z" fill="#fff"/><path d="M2 2h3v3H2zM16 2h3v3h-3zM2 16h3v3H2z"/></svg>`,
  );

// A function so the sample names follow the current language.
const sampleLines = () => [
  { name: translate("settings.sample.generalAdmission"), quantity: 2, unitPrice: 2000 },
  { name: translate("settings.sample.vipPass"), quantity: 1, unitPrice: 10000 },
];

function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2.5 hover:bg-muted/50">
      <span>
        <span className="block text-sm font-medium text-foreground">{label}</span>
        {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors ${checked ? "bg-secondary" : "bg-muted-foreground/30"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </label>
  );
}

function Segmented<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-xl bg-muted p-1">
      {options.map((o) => (
        <button
          type="button"
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
            value === o.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * "Billet & reçu": everything printed on the entry ticket and the till
 * receipt, with a live preview of exactly what tills print and a test
 * print. Saving pushes the new design to every open till immediately
 * (CATALOG_CHANGED → tills re-fetch their bootstrap).
 */
export default function TicketDesignPage() {
  const { t } = useI18n();
  const { session } = useSession();
  const confirm = useConfirm();
  const { logoUrl } = useBranding();
  const [saved, setSaved] = useState<AdminEstablishment | null>(null);
  const [texts, setTexts] = useState<TicketTexts | null>(null);
  const [ticket, setTicket] = useState<TicketOptions>(TICKET_OPTION_DEFAULTS);
  const [receipt, setReceipt] = useState<ReceiptOptions>(RECEIPT_OPTION_DEFAULTS);
  const [tab, setTab] = useState<Tab>("ticket");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const adopt = (e: AdminEstablishment) => {
    setSaved(e);
    setTexts({
      ticketTitle: e.ticketTitle,
      ticketSubtitle: e.ticketSubtitle,
      ticketTagline: e.ticketTagline,
      ticketLocation: e.ticketLocation,
      ticketFooter: e.ticketFooter,
      ticketBannerUrl: e.ticketBannerUrl,
      receiptFooter: e.receiptFooter,
    });
    const resolved = resolveTicketDesign(e);
    setTicket(resolved.ticket);
    setReceipt(resolved.receipt);
  };

  useEffect(() => {
    if (session) api.getEstablishment(session.token).then(adopt);
  }, [session]);

  const design = useMemo(
    () => resolveTicketDesign({ ...(texts ?? {}), ticketOptions: JSON.stringify(ticket), receiptOptions: JSON.stringify(receipt) }),
    [texts, ticket, receipt],
  );

  if (!session) return null;
  if (!saved || !texts) return <Loading />;

  const dirty =
    JSON.stringify(texts) !==
      JSON.stringify({
        ticketTitle: saved.ticketTitle,
        ticketSubtitle: saved.ticketSubtitle,
        ticketTagline: saved.ticketTagline,
        ticketLocation: saved.ticketLocation,
        ticketFooter: saved.ticketFooter,
        ticketBannerUrl: saved.ticketBannerUrl,
        receiptFooter: saved.receiptFooter,
      }) ||
    JSON.stringify(ticket) !== JSON.stringify(resolveTicketDesign(saved).ticket) ||
    JSON.stringify(receipt) !== JSON.stringify(resolveTicketDesign(saved).receipt);

  const setText = (key: keyof TicketTexts, value: string | null) => {
    setNotice(null);
    setTexts({ ...texts, [key]: value || null });
  };
  const setT = (patch: Partial<TicketOptions>) => {
    setNotice(null);
    setTicket({ ...ticket, ...patch });
  };
  const setR = (patch: Partial<ReceiptOptions>) => {
    setNotice(null);
    setReceipt({ ...receipt, ...patch });
  };

  const save = async () => {
    const ok = await confirm({
      title: t("settings.design.confirmSaveTitle"),
      message: t("settings.design.confirmSaveMessage"),
      confirmLabel: t("common.save"),
    });
    if (!ok) return;
    setError(null);
    try {
      const updated = await api.updateEstablishment(session.token, {
        name: saved.name,
        logoUrl: saved.logoUrl,
        brandPrimaryColor: saved.brandPrimaryColor,
        brandSecondaryColor: saved.brandSecondaryColor,
        receiptMode: saved.receiptMode,
        loginBackgroundUrl: saved.loginBackgroundUrl,
        ...texts,
        ticketOptions: JSON.stringify(ticket),
        receiptOptions: JSON.stringify(receipt),
      });
      adopt(updated);
      setNotice(t("settings.design.savedNotice"));
    } catch (e) {
      setError(errorMessage(e, t("settings.saveError")));
    }
  };

  const reset = async () => {
    const ok = await confirm({
      title: tab === "ticket" ? t("settings.design.resetTicketTitle") : t("settings.design.resetReceiptTitle"),
      message: t("settings.design.resetMessage"),
      confirmLabel: t("settings.design.reset"),
      tone: "danger",
    });
    if (!ok) return;
    if (tab === "ticket") {
      setTicket(TICKET_OPTION_DEFAULTS);
      setTexts({
        ...texts,
        ticketTitle: null,
        ticketSubtitle: null,
        ticketTagline: null,
        ticketLocation: null,
        ticketFooter: null,
        ticketBannerUrl: null,
      });
    } else {
      setReceipt(RECEIPT_OPTION_DEFAULTS);
      setTexts({ ...texts, receiptFooter: null });
    }
  };

  const testPrint = () => window.print();

  const textField = (key: Exclude<keyof TicketTexts, "ticketBannerUrl">, label: string, hint?: string) => (
    <div>
      <label className="field-label">{label}</label>
      <input value={texts[key] ?? ""} onChange={(e) => setText(key, e.target.value)} placeholder={TICKET_DEFAULTS[key]} className="field" />
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );

  return (
    <>
      {/* Test print: only the preview goes to the printer, at thermal width */}
      <style>{"@page { margin: 0; }"}</style>
      <div className="no-print">
        <PageHeader
          title={t("settings.design.title")}
          subtitle={t("settings.design.subtitle")}
          actions={
            <>
              <button onClick={reset} className="btn-outline">
                <RotateCcw className="h-4 w-4" /> {t("settings.design.reset")}
              </button>
              <button onClick={save} disabled={!dirty} className="btn-gold">
                <Save className="h-4 w-4" /> {t("common.save")}
              </button>
            </>
          }
        />
      </div>

      <div className="no-print flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-xl border border-border bg-card p-1">
          {(
            [
              ["ticket", t("settings.design.tabTicket"), Ticket],
              ["receipt", t("settings.design.tabReceipt"), ReceiptIcon],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold ${
                tab === value ? "bg-secondary text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
        {dirty && (
          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">{t("settings.design.unsaved")}</span>
        )}
        {notice && <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">{notice}</span>}
        {error && <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-destructive">{error}</span>}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_400px]">
        <div className="no-print space-y-4">
          {tab === "ticket" ? (
            <>
              <div className="card">
                <CardHeader title={t("settings.design.ticketTexts")} />
                <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
                  {textField("ticketTitle", t("settings.design.ticketTitle"), t("settings.design.ticketTitleHint"))}
                  {textField("ticketSubtitle", t("settings.design.subtitleField"))}
                  {textField("ticketTagline", t("settings.design.tagline"))}
                  {textField("ticketLocation", t("settings.design.location"))}
                  <div className="sm:col-span-2">
                    {textField("ticketFooter", t("settings.design.footer"), t("settings.design.footerHint"))}
                  </div>
                  <div className="sm:col-span-2">
                    <label className="field-label">{t("settings.design.extraNote")}</label>
                    <input
                      value={ticket.note}
                      onChange={(e) => setT({ note: e.target.value })}
                      placeholder={t("settings.design.extraNotePlaceholder")}
                      maxLength={120}
                      className="field"
                    />
                  </div>
                </div>
              </div>

              <div className="card">
                <CardHeader title={t("settings.design.appearance")} />
                <div className="space-y-4 px-5 pb-5">
                  <div>
                    <label className="field-label">{t("settings.design.accent")}</label>
                    <div className="flex flex-wrap items-center gap-2">
                      {ACCENTS.map((c) => (
                        <button
                          type="button"
                          key={c}
                          onClick={() => setT({ accent: c })}
                          aria-label={c}
                          aria-pressed={ticket.accent.toLowerCase() === c.toLowerCase()}
                          className={`h-8 w-8 rounded-full ring-offset-2 ${ticket.accent.toLowerCase() === c.toLowerCase() ? "ring-2 ring-foreground" : ""}`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                      <label className="ml-1 flex items-center gap-2 text-xs text-muted-foreground">
                        {t("settings.design.otherColor")}
                        <input
                          type="color"
                          value={ticket.accent}
                          onChange={(e) => setT({ accent: e.target.value })}
                          className="h-8 w-10 cursor-pointer rounded border border-border"
                        />
                      </label>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-6">
                    <div>
                      <label className="field-label">{t("settings.design.frame")}</label>
                      <Segmented
                        value={ticket.frame}
                        onChange={(frame) => setT({ frame })}
                        options={[
                          { value: "pattern", label: t("settings.design.frame.pattern") },
                          { value: "solid", label: t("settings.design.frame.solid") },
                          { value: "none", label: t("settings.design.frame.none") },
                        ]}
                      />
                    </div>
                    <div>
                      <label className="field-label">{t("settings.design.qrSize")}</label>
                      <Segmented
                        value={ticket.qrSize}
                        onChange={(qrSize) => setT({ qrSize })}
                        options={[
                          { value: "s", label: t("settings.design.qrSize.s") },
                          { value: "m", label: t("settings.design.qrSize.m") },
                          { value: "l", label: t("settings.design.qrSize.l") },
                        ]}
                      />
                    </div>
                  </div>
                  <ImageField
                    label={t("settings.design.banner")}
                    value={texts.ticketBannerUrl}
                    onChange={(url) => setText("ticketBannerUrl", url)}
                    fallback={TICKET_DEFAULTS.ticketBannerUrl}
                    hint={t("settings.design.bannerHint")}
                  />
                </div>
              </div>

              <div className="card">
                <CardHeader title={t("settings.design.shownItems")} />
                <div className="grid gap-1 px-3 pb-3 sm:grid-cols-2">
                  <Toggle label={t("settings.design.logo")} checked={ticket.showLogo} onChange={(v) => setT({ showLogo: v })} />
                  <Toggle
                    label={t("settings.design.subtitleField")}
                    checked={ticket.showSubtitle}
                    onChange={(v) => setT({ showSubtitle: v })}
                  />
                  <Toggle label={t("settings.design.tagline")} checked={ticket.showTagline} onChange={(v) => setT({ showTagline: v })} />
                  <Toggle label={t("settings.design.dateTime")} checked={ticket.showDate} onChange={(v) => setT({ showDate: v })} />
                  <Toggle
                    label={t("settings.design.locationGate")}
                    checked={ticket.showLocation}
                    onChange={(v) => setT({ showLocation: v })}
                  />
                  <Toggle label={t("settings.price")} checked={ticket.showPrice} onChange={(v) => setT({ showPrice: v })} />
                  <Toggle label={t("settings.design.bottomImage")} checked={ticket.showBanner} onChange={(v) => setT({ showBanner: v })} />
                  <Toggle label={t("settings.design.bottomText")} checked={ticket.showFooter} onChange={(v) => setT({ showFooter: v })} />
                </div>
                <p className="px-5 pb-4 text-[11px] text-muted-foreground">{t("settings.design.alwaysPrinted")}</p>
              </div>
            </>
          ) : (
            <>
              <div className="card">
                <CardHeader title={t("settings.design.paper")} />
                <div className="flex flex-wrap gap-6 px-5 pb-5">
                  <div>
                    <label className="field-label">{t("settings.design.paperWidth")}</label>
                    <Segmented
                      value={receipt.paperWidth}
                      onChange={(paperWidth) => setR({ paperWidth })}
                      options={[
                        { value: 80, label: "80 mm" },
                        { value: 58, label: "58 mm" },
                      ]}
                    />
                  </div>
                  <div>
                    <label className="field-label">{t("settings.design.fontSize")}</label>
                    <Segmented
                      value={receipt.fontSize}
                      onChange={(fontSize) => setR({ fontSize })}
                      options={[
                        { value: "s", label: t("settings.design.fontSize.s") },
                        { value: "m", label: t("settings.design.fontSize.m") },
                      ]}
                    />
                  </div>
                </div>
              </div>

              <div className="card">
                <CardHeader title={t("settings.design.header")} />
                <div className="space-y-3 px-5 pb-5">
                  <div className="-mx-3 grid gap-1 sm:grid-cols-3">
                    <Toggle label={t("settings.design.logo")} checked={receipt.showLogo} onChange={(v) => setR({ showLogo: v })} />
                    <Toggle label={t("settings.name")} checked={receipt.showName} onChange={(v) => setR({ showName: v })} />
                    <Toggle label={t("settings.gate")} checked={receipt.showGate} onChange={(v) => setR({ showGate: v })} />
                  </div>
                  <div>
                    <label className="field-label">{t("settings.design.contactLines")}</label>
                    <textarea
                      rows={4}
                      value={receipt.headerLines}
                      onChange={(e) => setR({ headerLines: e.target.value })}
                      placeholder={t("settings.design.contactPlaceholder")}
                      className="field font-mono text-xs"
                    />
                  </div>
                </div>
              </div>

              <div className="card">
                <CardHeader title={t("settings.design.content")} />
                <div className="grid gap-1 px-3 pb-3 sm:grid-cols-2">
                  <Toggle label={t("settings.design.cashier")} checked={receipt.showCashier} onChange={(v) => setR({ showCashier: v })} />
                  <Toggle
                    label={t("settings.design.unitPrices")}
                    checked={receipt.showUnitPrices}
                    onChange={(v) => setR({ showUnitPrices: v })}
                    hint={t("settings.design.unitPricesHint")}
                  />
                  <Toggle
                    label={t("settings.design.paymentMethod")}
                    checked={receipt.showPayment}
                    onChange={(v) => setR({ showPayment: v })}
                  />
                  <Toggle
                    label={t("settings.design.cashDetails")}
                    checked={receipt.showCashDetails}
                    onChange={(v) => setR({ showCashDetails: v })}
                    hint={t("settings.design.cashDetailsHint")}
                  />
                  <Toggle
                    label={t("settings.design.ticketCount")}
                    checked={receipt.showTicketCount}
                    onChange={(v) => setR({ showTicketCount: v })}
                  />
                  <Toggle
                    label={t("settings.design.qr")}
                    checked={receipt.showQr}
                    onChange={(v) => setR({ showQr: v })}
                    hint={t("settings.design.qrHint")}
                  />
                </div>
              </div>

              <div className="card">
                <CardHeader title={t("settings.design.receiptFooter")} />
                <div className="space-y-3 px-5 pb-5">
                  <div>
                    <label className="field-label">{t("settings.design.legalLines")}</label>
                    <textarea
                      rows={3}
                      value={receipt.legalLines}
                      onChange={(e) => setR({ legalLines: e.target.value })}
                      placeholder={t("settings.design.legalPlaceholder")}
                      className="field font-mono text-xs"
                    />
                  </div>
                  {textField("receiptFooter", t("settings.design.endMessage"), t("settings.design.endMessageHint"))}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="space-y-3 xl:sticky xl:top-20 xl:self-start">
          <div className="no-print flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{t("settings.preview")}</p>
            <button onClick={testPrint} className="btn-blue px-3 py-2 text-xs">
              <Printer className="h-4 w-4" /> {t("settings.design.testPrint")}
            </button>
          </div>
          <div
            className={`print-thermal rounded-2xl bg-muted/50 p-4 print:bg-white print:p-0 ${
              tab === "receipt" && receipt.paperWidth === 58 ? "paper-58" : ""
            }`}
          >
            {tab === "ticket" ? (
              <TicketCard
                design={design}
                logoUrl={saved.logoUrl || logoUrl}
                gateName={t("settings.sample.gate")}
                ticketNumber="TEST-0000-0-0"
                ticketTypeName={t("settings.sample.generalAdmission")}
                price={2000}
                currency="XAF"
                createdAtClient={new Date().toISOString()}
                qrImage={SAMPLE_QR}
                index={0}
                total={1}
              />
            ) : (
              <Receipt
                design={design}
                logoUrl={saved.logoUrl || logoUrl}
                establishmentName={saved.name}
                gateName={t("settings.sample.gate")}
                cashierName={session.fullName}
                reference="TEST-000000"
                createdAtClient={new Date().toISOString()}
                lines={sampleLines()}
                currency="XAF"
                paymentMethod="CASH"
                ticketCount={3}
                received={20000}
              />
            )}
          </div>
          <p className="no-print text-center text-[11px] text-muted-foreground">
            {tab === "ticket" ? t("settings.design.exampleTicket") : t("settings.design.exampleReceipt")}
          </p>
        </div>
      </div>
    </>
  );
}
