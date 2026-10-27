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
}
