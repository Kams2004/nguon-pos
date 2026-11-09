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
    /** Absent in bootstraps cached before this field existed. */
    receiptMode?: ReceiptMode;
  } & TicketDesign &
    DesignOptions;
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
    icon: string | null;
    color: string | null;
  }[];
};

/** Ticket/receipt layout options as JSON documents (see lib/ticketDesign.ts for their shape). */
export type DesignOptions = { ticketOptions: string | null; receiptOptions: string | null };

/** What the printed ticket/receipt says — null fields fall back to the app's defaults (see lib/ticketDesign.ts). */
export type TicketDesign = {
  ticketTitle: string | null;
  ticketSubtitle: string | null;
  ticketTagline: string | null;
  ticketLocation: string | null;
  ticketFooter: string | null;
  ticketBannerUrl: string | null;
  receiptFooter: string | null;
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
  | "REJECTED_UNKNOWN_TICKET"
  | "REJECTED_VOIDED"
  /** Reached central before the sale of its ticket; settled when that sale arrives. */
  | "PENDING_TICKET";

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
  terminalId: string;
  cashierUserId: string;
  createdAtClient: string;
  syncedAt: string;
  voidedByUserId: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  /** What was sold: ticket type, quantity, unit price. */
  lines: { ticketTypeId: string; quantity: number; unitPrice: number }[];
};

export type PrintMode = "STANDARD" | "INDIVIDUAL" | "INHERIT_ESTABLISHMENT";
export type ReceiptMode = "STANDARD" | "INDIVIDUAL_TICKETS" | "CONFIGURABLE_PER_TICKET_TYPE";

export type AdminGate = { id: string; name: string; code: string; active: boolean };

export type AdminTicketType = {
  id: string;
  gateId: string | null;
  name: string;
  price: number;
  currency: string;
  printMode: PrintMode;
  active: boolean;
  icon: string | null;
  color: string | null;
};

export type AdminEstablishment = {
  id: string;
  name: string;
  logoUrl: string | null;
  brandPrimaryColor: string | null;
  brandSecondaryColor: string | null;
  receiptMode: ReceiptMode;
  loginBackgroundUrl: string | null;
} & TicketDesign &
  DesignOptions;

export type DirectoryUser = { id: string; fullName: string; role: Role; active: boolean };

export type AdminUser = {
  id: string;
  username: string;
  fullName: string;
  role: Role;
  assignedGateId: string | null;
  active: boolean;
};

/** A desktop till enrolled with a certificate ("Appareils"). */
export type Device = {
  id: string;
  gateId: string;
  deviceNo: number;
  label: string;
  status: "ACTIVE" | "REVOKED";
  certNotAfter: string;
  enrolledAt: string;
  os: string | null;
  appVersion: string | null;
  revokedAt: string | null;
  online: boolean;
  lastSeenAt: string | null;
};

export type ReleaseFile = { platform: "linux-deb" | "windows-nsis" | string; url: string; sha256: string; size: number };
export type Release = { version: string; notes: string | null; files: ReleaseFile[]; createdAt: string };
export type ReleaseOverview = { releases: Release[]; targetVersion: string | null };

export type EnrollmentCode = { code: string; expiresAt: string; gateId: string; label: string };

export type TerminalStatus = {
  terminalId: string;
  gateId: string;
  deviceLabel: string | null;
  lastSeenAt: string;
  localPendingCount: number;
  online: boolean;
  loggedIn: boolean;
  currentUserId: string | null;
  currentUserName: string | null;
};

export type ScanEntry = {
  id: string;
  scannedAt: string;
  result: ScanResultValue;
  gateId: string;
  terminalId: string;
  scannedByUserId: string;
  ticketId: string;
  ticketNumber: string | null;
  ticketTypeId: string | null;
  ticketGateId: string | null;
  /** When and on which till the ticket was first let in. */
  redeemedAt: string | null;
  redeemedByTerminalId: string | null;
};

export type ScanFilter = "ACCEPTED" | "REJECTED" | Exclude<ScanResultValue, "ACCEPTED">;

export type ScanPage = {
  content: ScanEntry[];
  totalElements: number;
  totalPages: number;
  acceptedCount: number;
  rejectedCount: number;
  pendingCount: number;
};

export type AuditCategory = "AUTH" | "USER" | "CATALOG" | "SETTINGS" | "MEDIA" | "SALE" | "VOID" | "SCAN" | "TERMINAL" | "SUBSCRIPTION";

export type SubscriptionSettings = {
  moduleEnabled: boolean;
  annualPrice: number;
  currency: string;
  durationMonths: number;
  reminderDays: number;
  graceDays: number;
  autoRenew: boolean;
  updatedAt?: string;
};
export type SubscriptionState = "NOT_ACTIVATED" | "ACTIVE" | "TO_RENEW" | "EXPIRED" | "PENDING_PAYMENT";
export type SubscriptionPeriod = {
  id: string;
  startDate: string; // yyyy-MM-dd
  endDate: string; // inclusive
  price: number;
  currency: string;
  status: "PENDING_PAYMENT" | "PAID" | "CANCELLED";
  paidAmount: number;
  note: string | null;
  createdAt: string;
  createdByName: string | null;
};
export type SubscriptionPaymentMethod = "CASH" | "BANK_TRANSFER" | "MOBILE_MONEY" | "CARD" | "ONLINE" | "OTHER";
export type SubscriptionPayment = {
  id: string;
  periodId: string;
  amount: number;
  currency: string;
  method: SubscriptionPaymentMethod;
  status: "PENDING" | "CONFIRMED" | "FAILED" | "REFUNDED";
  provider: string | null;
  providerReference: string | null;
  paidAt: string;
  note: string | null;
  recordedAt: string;
  recordedByName: string | null;
};
export type SubscriptionOverview = {
  settings: SubscriptionSettings;
  status: {
    state: SubscriptionState;
    currentPeriodId: string | null;
    coveredUntil: string | null;
    daysRemaining: number | null;
    graceUntil: string | null;
    nextStart: string | null;
  };
  periods: SubscriptionPeriod[];
  payments: SubscriptionPayment[];
};

export type AuditEntry = {
  id: string;
  occurredAt: string;
  service: "auth" | "catalog" | "sales";
  category: AuditCategory;
  action: string;
  actorUserId: string | null;
  actorName: string | null;
  entityType: string | null;
  entityId: string | null;
  summary: string;
};

export type MediaItem = {
  id: string;
  url: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  uploadedByName: string | null;
  createdAt: string;
};

export type Branding = { name: string | null; logoUrl: string | null; loginBackgroundUrl: string | null };
