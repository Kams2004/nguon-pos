package com.nguonpos.catalog.tickettype;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface TicketTypeRepository extends JpaRepository<TicketType, UUID> {

    // Sellable at this gate: either explicitly scoped to it, or unscoped
    // (gateId null = sellable at any gate of the establishment).
    @Query("""
            SELECT t FROM TicketType t
            WHERE t.establishmentId = :establishmentId
              AND t.active = true
              AND (t.gateId = :gateId OR t.gateId IS NULL)
            """)
    List<TicketType> findSellableAtGate(@Param("establishmentId") UUID establishmentId, @Param("gateId") UUID gateId);
}
