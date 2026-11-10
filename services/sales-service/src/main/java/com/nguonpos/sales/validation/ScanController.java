package com.nguonpos.sales.validation;

import com.nguonpos.sales.ticket.Ticket;
import com.nguonpos.sales.ticket.TicketRepository;
import io.jsonwebtoken.Claims;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

// Contrôle des entrées: every synced scan, accepted or refused — in
// particular tickets refused because another till had already let them in.
@RestController
@RequestMapping("/sales/admin/scans")
@PreAuthorize("hasAnyRole('SUPER_ADMIN', 'COORDINATOR')")
public class ScanController {

    static final int MAX_PAGE_SIZE = 200;


    private final EntryScanRepository scanRepository;
    private final TicketRepository ticketRepository;

    public ScanController(EntryScanRepository scanRepository, TicketRepository ticketRepository) {
        this.scanRepository = scanRepository;
        this.ticketRepository = ticketRepository;
    }

    /**
     * One page of scans, newest first, with accepted/refused totals for the
     * same filters. `result` is ACCEPTED, REJECTED (any refusal) or one
     * exact ScanResult — an unknown value is a 400 from enum binding, so it
     * never reaches the query.
     */
    @GetMapping
    public ScanPage list(
            @AuthenticationPrincipal Claims claims,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "25") int size,
            @RequestParam(required = false) ResultFilter result,
            @RequestParam(required = false) UUID gateId,
            @RequestParam(required = false) UUID terminalId,
            @RequestParam(required = false) Instant from,
            @RequestParam(required = false) Instant to
    ) {
        UUID establishmentId = UUID.fromString(claims.get("establishmentId", String.class));
        Specification<EntryScan> base = (root, query, cb) -> {
            List<Predicate> where = new ArrayList<>();
            where.add(cb.equal(root.get("establishmentId"), establishmentId));
            if (gateId != null) where.add(cb.equal(root.get("gateId"), gateId));
            if (terminalId != null) where.add(cb.equal(root.get("terminalId"), terminalId));
            if (from != null) where.add(cb.greaterThanOrEqualTo(root.get("scannedAt"), from));
            if (to != null) where.add(cb.lessThan(root.get("scannedAt"), to));
            return cb.and(where.toArray(Predicate[]::new));
        };
        Specification<EntryScan> accepted = (root, query, cb) -> cb.equal(root.get("result"), ScanResult.ACCEPTED);
        Specification<EntryScan> refused = (root, query, cb) -> cb.not(root.get("result").in(ScanResult.ACCEPTED, ScanResult.PENDING_TICKET,
                ScanResult.DUPLICATE_ENTRY));
        Specification<EntryScan> pending = (root, query, cb) -> cb.equal(root.get("result"), ScanResult.PENDING_TICKET);
        Specification<EntryScan> duplicate = (root, query, cb) -> cb.equal(root.get("result"), ScanResult.DUPLICATE_ENTRY);

        Specification<EntryScan> spec = base;
        if (result != null) {
            spec = switch (result) {
                case ACCEPTED -> base.and(accepted);
                case REJECTED -> base.and(refused);
                default -> base.and((root, query, cb) -> cb.equal(root.get("result"), ScanResult.valueOf(result.name())));
            };
        }

        Page<EntryScan> scans = scanRepository.findAll(spec,
                PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), MAX_PAGE_SIZE), Sort.by(Sort.Direction.DESC, "scannedAt")));

        // Ticket number and type for the whole page in one query.
        Map<UUID, Ticket> tickets = ticketRepository.findByIdIn(scans.getContent().stream().map(EntryScan::getTicketId).toList()).stream()
                .collect(Collectors.toMap(Ticket::getId, Function.identity()));

        return new ScanPage(
                scans.getContent().stream().map(s -> ScanSummary.from(s, tickets.get(s.getTicketId()))).toList(),
                scans.getTotalElements(),
                scans.getTotalPages(),
                scanRepository.count(base.and(accepted)),
                scanRepository.count(base.and(refused)),
                scanRepository.count(base.and(pending)),
                scanRepository.count(base.and(duplicate))
        );
    }

    // REJECTED = any refusal (every outcome except ACCEPTED, PENDING_TICKET and DUPLICATE_ENTRY — someone got in).
    public enum ResultFilter {
        ACCEPTED, REJECTED, REJECTED_ALREADY_REDEEMED, REJECTED_INVALID_SIGNATURE, REJECTED_WRONG_GATE, REJECTED_UNKNOWN_TICKET,
        REJECTED_VOIDED, PENDING_TICKET, DUPLICATE_ENTRY
    }

    public record ScanPage(
            List<ScanSummary> content, long totalElements, int totalPages, long acceptedCount, long rejectedCount, long pendingCount,
            long duplicateCount
    ) {
    }

    public record ScanSummary(
            UUID id, Instant scannedAt, ScanResult result, UUID gateId, UUID terminalId, UUID scannedByUserId,
            UUID ticketId, String ticketNumber, UUID ticketTypeId, UUID ticketGateId,
            Instant redeemedAt, UUID redeemedByTerminalId
    ) {
        static ScanSummary from(EntryScan s, Ticket t) {
            return new ScanSummary(
                    s.getId(), s.getScannedAt(), s.getResult(), s.getGateId(), s.getTerminalId(), s.getScannedByUserId(),
                    s.getTicketId(),
                    t != null ? t.getTicketNumber() : null,
                    t != null ? t.getTicketTypeId() : null,
                    t != null ? t.getGateId() : null,
                    // For a ticket refused as already used: when and where it first got in.
                    t != null ? t.getRedeemedAt() : null,
                    t != null ? t.getRedeemedByTerminalId() : null
            );
        }
    }
}
