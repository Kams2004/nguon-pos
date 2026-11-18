import type { DesignOptions, TicketDesign } from "./api/types";
import { translate } from "../i18n";
import { mediaUrl } from "./platform";

// What the ticket and receipt say when the Super Admin hasn't customised a
// field (every field is optional server-side). Edited in "Billet & reçu".
// The wording ones are getters, read at use time in the current language.
export const TICKET_DEFAULTS = {
  ticketTitle: "NGUON FESTIVAL",
  get ticketSubtitle() {
    return translate("gate.design.ticketSubtitle");
  },
  get ticketTagline() {
    return translate("gate.design.ticketTagline");
  },
  ticketLocation: "Foumban",
  get ticketFooter() {
    return translate("gate.design.ticketFooter");
  },
  ticketBannerUrl: "/img/banners/palace.jpg",
  get receiptFooter() {
    return translate("gate.design.receiptFooter");
  },
} satisfies Record<keyof TicketDesign, string>;

/** Ticket layout: colours, frame and which blocks are printed. */
export type TicketOptions = {
  accent: string; // hex — title, frame and highlights
  frame: "pattern" | "solid" | "none";
  qrSize: "s" | "m" | "l";
  showLogo: boolean;
  logoUrl: string; // "" = the establishment's logo
  logoSize: number; // px on screen, LOGO_SIZE_MIN–LOGO_SIZE_MAX
  logoLayout: "stacked" | "inline"; // logo above the title, or beside it
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

export const LOGO_SIZE_MIN = 24;
export const LOGO_SIZE_MAX = 120;

export const TICKET_OPTION_DEFAULTS: TicketOptions = {
  accent: "#0A4DA2",
  frame: "pattern",
  qrSize: "m",
  showLogo: true,
  logoUrl: "",
  logoSize: 56,
  logoLayout: "stacked",
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
  const ticket = parseOptions(design?.ticketOptions, TICKET_OPTION_DEFAULTS);
  if (!Number.isFinite(ticket.logoSize)) ticket.logoSize = TICKET_OPTION_DEFAULTS.logoSize;
  ticket.logoSize = Math.round(Math.min(LOGO_SIZE_MAX, Math.max(LOGO_SIZE_MIN, ticket.logoSize)));
  if (ticket.logoLayout !== "inline") ticket.logoLayout = "stacked";
  ticket.logoUrl = mediaUrl(ticket.logoUrl);
  return {
    ...texts,
    // Images from the media library: on a desktop till, through its local copy.
    ticketBannerUrl: mediaUrl(texts.ticketBannerUrl),
    ticket,
    receipt: parseOptions(design?.receiptOptions, RECEIPT_OPTION_DEFAULTS),
  };
}

/** {porte} → the gate's name, {annee} → the current year. */
export function fillPlaceholders(text: string, gateName: string): string {
  return text.replace(/\{porte\}/g, gateName).replace(/\{annee\}/g, String(new Date().getFullYear()));
}
