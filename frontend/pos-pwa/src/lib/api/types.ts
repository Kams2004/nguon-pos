export type Role = "CASHIER" | "COORDINATOR" | "SUPER_ADMIN";

export type LoginResponse = {
  token: string;
  userId: string;
  username: string;
  fullName: string;
  role: Role;
  establishmentId: string;
  assignedGateId: string | null;
};

export type BootstrapResponse = {
  establishment: {
    id: string;
    name: string;
    logoUrl: string | null;
    brandPrimaryColor: string | null;
    brandSecondaryColor: string | null;
  };
  gate: {
    id: string;
    name: string;
    code: string;
    signingSecret: string;
  };
  ticketTypes: {
    id: string;
    name: string;
    price: number;
    currency: string;
    printMode: "STANDARD" | "INDIVIDUAL" | "INHERIT_ESTABLISHMENT";
  }[];
};

export type PaymentMethod = "CASH" | "MOBILE_MONEY" | "CARD" | "OTHER";

export type SaleSyncEntry = {
  idempotencyKey: string;
  paymentMethod: PaymentMethod;
  createdAtClient: string;
  lines: { ticketTypeId: string; quantity: number; unitPrice: number }[];
  tickets: { id: string; ticketTypeId: string; ticketNumber: string; qrSignature: string }[];
};

export type SaleSyncResult = {
  idempotencyKey: string;
  status: "ACCEPTED" | "DUPLICATE_IGNORED" | "REJECTED";
  referenceNumber: string | null;
  serverReceivedAt: string;
  reason: string | null;
};

export type ScanSyncEntry = {
  clientScanId: string;
  ticketId: string;
  scannedAt: string;
};

export type ScanResultValue =
  | "ACCEPTED"
  | "REJECTED_ALREADY_REDEEMED"
  | "REJECTED_INVALID_SIGNATURE"
  | "REJECTED_WRONG_GATE"
  | "REJECTED_UNKNOWN_TICKET";

export type ScanSyncResult = {
  clientScanId: string;
  syncStatus: "ACCEPTED" | "DUPLICATE_IGNORED";
  scanResult: ScanResultValue;
  reason: string | null;
};

export type TransactionSummary = {
  id: string;
  referenceNumber: string;
  status: "COMPLETED" | "VOIDED";
  paymentMethod: PaymentMethod;
  totalAmount: number;
  currency: string;
  gateId: string;
  createdAtClient: string;
  syncedAt: string;
};
