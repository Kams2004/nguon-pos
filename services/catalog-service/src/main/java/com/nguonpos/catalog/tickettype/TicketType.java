package com.nguonpos.catalog.tickettype;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "ticket_type")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TicketType {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(nullable = false)
    private UUID establishmentId;

    // Nullable = sellable at any gate; set = gate-exclusive ticket type.
    private UUID gateId;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private BigDecimal price;

    @Column(nullable = false)
    private String currency;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private PrintMode printMode;

    @Column(nullable = false)
    private boolean active;

    // How the ticket type looks on the till's grid: an icon name from the
    // app's curated set and a colour key. null = app default (ticket, blue).
    private String icon;
    private String color;

    @Column(nullable = false)
    private Instant createdAt;

    @Column(nullable = false)
    private Instant updatedAt;
}
