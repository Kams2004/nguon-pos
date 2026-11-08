import type { PrintMode, ReceiptMode } from "./api/types";

/** How one ticket type's entries come out of the printer at the till. */
export type EffectivePrintMode = "STANDARD" | "INDIVIDUAL";

/**
 * The establishment's mode decides, except in "Par type de billet" where
 * each ticket type's own setting applies:
 *  - STANDARD: the entries are printed on the sale's single receipt, one
 *    QR code per entry, so one slip covers the whole purchase.
 *  - INDIVIDUAL: one separate, full ticket per entry, after the receipt.
 * Either way every entry keeps its own QR code — each person is scanned
 * once at the gate.
 */
export function effectivePrintMode(receiptMode: ReceiptMode | undefined, typeMode: PrintMode | undefined): EffectivePrintMode {
  if (receiptMode === "STANDARD") return "STANDARD";
  if (receiptMode === "CONFIGURABLE_PER_TICKET_TYPE" && typeMode === "STANDARD") return "STANDARD";
  return "INDIVIDUAL";
}
