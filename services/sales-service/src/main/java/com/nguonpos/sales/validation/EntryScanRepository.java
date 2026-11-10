package com.nguonpos.sales.validation;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.List;
import java.util.UUID;

public interface EntryScanRepository extends JpaRepository<EntryScan, UUID>, JpaSpecificationExecutor<EntryScan> {

    /** Scans of a ticket still waiting for its sale, oldest first. */
    List<EntryScan> findByTicketIdAndEstablishmentIdAndResultOrderByScannedAtAscIdAsc(UUID ticketId, UUID establishmentId, ScanResult result);

    /** The scan counted as a ticket's entry. */
    java.util.Optional<EntryScan> findFirstByTicketIdAndResult(UUID ticketId, ScanResult result);
}
