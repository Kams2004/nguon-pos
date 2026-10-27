package com.nguonpos.sales.ticket;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

// id is the CLIENT-generated ticket id from the signed QR payload (payload.tid)
// — the same id the gate's local cache and the QR itself reference, so
// there's never a mapping step between "the ticket the terminal printed"
// and "the ticket row the server holds."
@Entity
@Table(name = "ticket")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Ticket {

    @Id
    private UUID id;

    @Column(nullable = false)
    private UUID transactionId;

    @Column(nullable = false)
    private UUID transactionLineId;

    @Column(nullable = false)
    private UUID establishmentId;

    @Column(nullable = false)
    private UUID gateId;

    @Column(nullable = false)
    private UUID ticketTypeId;

    @Column(nullable = false, unique = true)
    private String ticketNumber;

    @Column(nullable = false)
    private String qrSignature;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private TicketStatus status;

    @Column(nullable = false)
    private Instant issuedAt;

    private Instant redeemedAt;
    private UUID redeemedByUserId;
    private UUID redeemedByTerminalId;
}
