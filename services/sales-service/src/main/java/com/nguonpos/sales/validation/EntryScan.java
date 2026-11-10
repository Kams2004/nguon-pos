package com.nguonpos.sales.validation;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

// id is the CLIENT-generated clientScanId — same idempotency pattern as
// Transaction.id. Append-only: a row here is never updated once written.
@Entity
@Table(name = "entry_scan")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class EntryScan {

    @Id
    private UUID id;

    @Column(nullable = false)
    private UUID ticketId;

    private UUID establishmentId;

    @Column(nullable = false)
    private UUID gateId;

    @Column(nullable = false)
    private UUID terminalId;

    @Column(nullable = false)
    private UUID scannedByUserId;

    @Column(nullable = false)
    private Instant scannedAt;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ScanResult result;

    /** What the till decided at the gate (ACCEPTED: the person went in), when it says. */
    @Column(name = "local_decision")
    private String localDecision;

    /** The till's hybrid-clock stamp (desktop tills), to order entries made while tills were cut off. */
    @Column(name = "hlc")
    private String hlc;
}
