package com.nguonpos.catalog.tickettype;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.HashSet;
import java.util.Set;
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

    /** The gates that sell it; empty = every gate of the establishment. */
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "ticket_type_gate", joinColumns = @JoinColumn(name = "ticket_type_id"))
    @Column(name = "gate_id", nullable = false)
    @Builder.Default
    private Set<UUID> gateIds = new HashSet<>();

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
