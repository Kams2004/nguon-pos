package com.nguonpos.catalog.tickettype;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface TicketTypeRepository extends JpaRepository<TicketType, UUID> {

    // Sellable at this gate: one of its gates, or no gate chosen (= every gate).
    @Query("""
            SELECT t FROM TicketType t
            WHERE t.establishmentId = :establishmentId
              AND t.active = true
              AND (t.gateIds IS EMPTY OR :gateId MEMBER OF t.gateIds)
            """)
    List<TicketType> findSellableAtGate(@Param("establishmentId") UUID establishmentId, @Param("gateId") UUID gateId);

    List<TicketType> findByEstablishmentIdOrderByNameAsc(UUID establishmentId);
}
