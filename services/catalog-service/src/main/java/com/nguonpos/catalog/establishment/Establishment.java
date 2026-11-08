package com.nguonpos.catalog.establishment;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "establishment")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Establishment {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false, unique = true)
    private String slug;

    private String logoUrl;
    private String brandPrimaryColor;
    private String brandSecondaryColor;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ReceiptMode receiptMode;

    // Ticket/receipt wording and artwork — null means the app's default.
    private String ticketTitle;
    private String ticketSubtitle;
    private String ticketTagline;
    private String ticketLocation;
    private String ticketFooter;
    private String ticketBannerUrl;
    private String receiptFooter;
    private String loginBackgroundUrl;

    // JSON documents edited in the PWA's "Billet & reçu" page — see V7 migration.
    private String ticketOptions;
    private String receiptOptions;

    @Column(nullable = false)
    private Instant createdAt;

    @Column(nullable = false)
    private Instant updatedAt;
}
