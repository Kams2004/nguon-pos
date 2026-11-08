package com.nguonpos.catalog.subscription;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "subscription_settings")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SubscriptionSettings {

    @Id
    private UUID establishmentId;

    @Column(nullable = false)
    private boolean moduleEnabled;

    @Column(nullable = false)
    private BigDecimal annualPrice;

    @Column(nullable = false)
    private String currency;

    @Column(nullable = false)
    private int durationMonths;

    @Column(nullable = false)
    private int reminderDays;

    @Column(nullable = false)
    private int graceDays;

    @Column(nullable = false)
    private boolean autoRenew;

    @Column(nullable = false)
    private Instant updatedAt;

    /** What an establishment that never saved its settings gets: module off. */
    static SubscriptionSettings defaults(UUID establishmentId) {
        return SubscriptionSettings.builder()
                .establishmentId(establishmentId).moduleEnabled(false).annualPrice(BigDecimal.ZERO).currency("XAF")
                .durationMonths(12).reminderDays(30).graceDays(15).autoRenew(false).updatedAt(Instant.now())
                .build();
    }
}
