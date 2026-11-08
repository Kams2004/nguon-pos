package com.nguonpos.catalog.subscription;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "subscription_payment")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SubscriptionPayment {

    public enum Method { CASH, BANK_TRANSFER, MOBILE_MONEY, CARD, ONLINE, OTHER }

    public enum Status { PENDING, CONFIRMED, FAILED, REFUNDED }

    @Id
    private UUID id;

    @Column(nullable = false)
    private UUID periodId;

    @Column(nullable = false)
    private BigDecimal amount;

    @Column(nullable = false)
    private String currency;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Method method;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status;

    /** Filled by a future payment-API integration (e.g. the provider's name). */
    private String provider;

    /** Bank/Mobile Money receipt number, or the provider's transaction id. */
    private String providerReference;

    @Column(nullable = false)
    private Instant paidAt;

    private String note;

    @Column(nullable = false)
    private Instant recordedAt;

    private String recordedByName;
}
