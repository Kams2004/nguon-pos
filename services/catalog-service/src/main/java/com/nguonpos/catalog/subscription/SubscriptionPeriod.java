package com.nguonpos.catalog.subscription;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "subscription_period")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SubscriptionPeriod {

    public enum Status { PENDING_PAYMENT, PAID, CANCELLED }

    @Id
    private UUID id;

    @Column(nullable = false)
    private UUID establishmentId;

    @Column(nullable = false)
    private LocalDate startDate;

    /** Inclusive: the last day covered. */
    @Column(nullable = false)
    private LocalDate endDate;

    /** The price in force when the period was created — never recomputed. */
    @Column(nullable = false)
    private BigDecimal price;

    @Column(nullable = false)
    private String currency;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status;

    private String note;

    @Column(nullable = false)
    private Instant createdAt;

    private String createdByName;
}
