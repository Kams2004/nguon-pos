package com.nguonpos.sales.transaction;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

// id is the CLIENT-generated idempotency key, not server-generated — the
// primary key's own uniqueness is what makes a replayed sync batch safe:
// a second insert attempt with the same id simply fails the PK constraint,
// which the sync service catches and turns into a DUPLICATE_IGNORED result
// instead of a duplicate sale. See docs/SYNC_PROTOCOL.md.
@Entity
@Table(name = "transaction")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Transaction {

    @Id
    private UUID id;

    @Column(nullable = false)
    private UUID establishmentId;

    @Column(nullable = false)
    private UUID gateId;

    @Column(nullable = false)
    private UUID terminalId;

    @Column(nullable = false)
    private UUID cashierUserId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private TransactionStatus status;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private PaymentMethod paymentMethod;

    @Column(nullable = false)
    private BigDecimal totalAmount;

    @Column(nullable = false)
    private String currency;

    // Human-facing sale number, assigned server-side on first insert — NOT
    // the idempotency key, just a clean sequential display value.
    @Column(nullable = false, unique = true)
    private String referenceNumber;

    @Column(nullable = false)
    private Instant createdAtClient;

    @Column(nullable = false)
    private Instant syncedAt;

    private UUID voidedByUserId;
    private Instant voidedAt;
    private String voidReason;
}
