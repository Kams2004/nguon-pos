import type { DesignOptions, TicketDesign } from "./api/types";

// What the ticket and receipt say when the Super Admin hasn't customised a
// field (every field is optional server-side). Edited in "Billet & reçu".
export const TICKET_DEFAULTS = {
  ticketTitle: "NGUON FESTIVAL",
  ticketSubtitle: "Le NGUON",
  ticketTagline: "Patrimoine Culturel du Royaume Bamoun",
  ticketLocation: "Foumban",
  ticketFooter: "Valable uniquement à {porte} — usage unique",
  ticketBannerUrl: "/img/banners/palace.jpg",
  receiptFooter: "Merci de votre visite — Nguon {annee}",
} satisfies Record<keyof TicketDesign, string>;

/** Ticket layout: colours, frame and which blocks are printed. */
export type TicketOptions = {
  accent: string; // hex — title, frame and highlights
  frame: "pattern" | "solid" | "none";
  qrSize: "s" | "m" | "l";
  showLogo: boolean;
  showSubtitle: boolean;
  showTagline: boolean;
  showDate: boolean;
  showLocation: boolean;
  showPrice: boolean;
  showBanner: boolean;
  showFooter: boolean;
  note: string; // free extra line, e.g. "Non remboursable — à présenter à l'entrée"
};

/** Receipt layout: paper, header/legal lines and which blocks are printed. */
export type ReceiptOptions = {
  paperWidth: 58 | 80;
  fontSize: "s" | "m";
  showLogo: boolean;
  showName: boolean;
  headerLines: string; // one per line: address, phone, NIU/RCCM…
  showGate: boolean;
  showCashier: boolean;
  showUnitPrices: boolean;
  showPayment: boolean;
  showCashDetails: boolean; // amount received + change
  showTicketCount: boolean;
  showQr: boolean; // verification QR with the sale reference
  legalLines: string; // tax / legal mentions, one per line
};

export const TICKET_OPTION_DEFAULTS: TicketOptions = {
  accent: "#0A4DA2",
  frame: "pattern",
  qrSize: "m",
  showLogo: true,
  showSubtitle: true,
  showTagline: true,
  showDate: true,
  showLocation: true,
  showPrice: true,
  showBanner: true,
  showFooter: true,
  note: "",
};

export const RECEIPT_OPTION_DEFAULTS: ReceiptOptions = {
  paperWidth: 80,
  fontSize: "m",
  showLogo: true,
  showName: true,
  headerLines: "",
  showGate: true,
  showCashier: true,
  showUnitPrices: true,
  showPayment: true,
  showCashDetails: true,
  showTicketCount: true,
  showQr: false,
  legalLines: "",
};

function parseOptions<T extends object>(raw: string | null | undefined, defaults: T): T {
  if (!raw) return { ...defaults };
  try {
    const parsed = JSON.parse(raw);
    // Unknown keys are dropped, missing keys fall back to defaults.
    const out = { ...defaults };
    for (const k of Object.keys(defaults) as (keyof T)[]) {
      if (parsed[k] !== undefined && typeof parsed[k] === typeof defaults[k]) out[k] = parsed[k];
    }
    return out;
  } catch {
    return { ...defaults };
  }
}

export type ResolvedTicketDesign = typeof TICKET_DEFAULTS & { ticket: TicketOptions; receipt: ReceiptOptions };

export function resolveTicketDesign(design: (Partial<TicketDesign> & Partial<DesignOptions>) | null | undefined): ResolvedTicketDesign {
  const texts = { ...TICKET_DEFAULTS };
  for (const key of Object.keys(TICKET_DEFAULTS) as (keyof TicketDesign)[]) {
    const v = design?.[key];
    if (v) texts[key] = v;
  }
  return {
    ...texts,
    ticket: parseOptions(design?.ticketOptions, TICKET_OPTION_DEFAULTS),
    receipt: parseOptions(design?.receiptOptions, RECEIPT_OPTION_DEFAULTS),
  };
}

/** {porte} → the gate's name, {annee} → the current year. */
export function fillPlaceholders(text: string, gateName: string): string {
  return text.replace(/\{porte\}/g, gateName).replace(/\{annee\}/g, String(new Date().getFullYear()));
}
