package com.nguonpos.sales.transaction;

import com.nguonpos.sales.audit.AuditService;
import com.nguonpos.sales.live.EventHub;
import com.nguonpos.sales.ticket.Ticket;
import com.nguonpos.sales.ticket.TicketRepository;
import com.nguonpos.sales.ticket.TicketStatus;
import org.springframework.transaction.annotation.Transactional;
import io.jsonwebtoken.Claims;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.data.domain.Page;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import jakarta.persistence.criteria.Subquery;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

// Basic filterable list, per Milestone 1's demo criterion, plus the
// authorized void/cancel flow (Milestone 3) — the cahier is explicit that
// a validated sale is never hard-deleted (section 6.3: prefer a status
// flip + audit trail over deletion, to preserve traceability), and that a
// cashier alone cannot freely modify a validated sale (section 6.1).
@RestController
@RequestMapping("/sales/transactions")
public class TransactionController {

    private final TransactionRepository transactionRepository;
    private final TransactionLineRepository lineRepository;
    private final TicketRepository ticketRepository;
    // Reports and the dashboard load a whole period in one page.
    static final int MAX_PAGE_SIZE = 5000;

    private final AuditService audit;
    private final EventHub hub;

    public TransactionController(
            TransactionRepository transactionRepository, TransactionLineRepository lineRepository, TicketRepository ticketRepository,
            AuditService audit, EventHub hub
    ) {
        this.transactionRepository = transactionRepository;
        this.lineRepository = lineRepository;
        this.ticketRepository = ticketRepository;
        this.audit = audit;
        this.hub = hub;
    }

    /**
     * Filterable, paged sale list. Every filter is optional: by till, by
     * cashier, by gate, by ticket type (sales containing at least one such ticket) and
     * by date interval on the till's own sale time ([from, to)).
     */
    @GetMapping
    public Page<TransactionSummary> list(
            @AuthenticationPrincipal Claims claims,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "25") int size,
            @RequestParam(required = false) UUID terminalId,
            @RequestParam(required = false) UUID cashierUserId,
            @RequestParam(required = false) UUID gateId,
            @RequestParam(required = false) UUID ticketTypeId,
            @RequestParam(required = false) Instant from,
            @RequestParam(required = false) Instant to
    ) {
        UUID establishmentId = UUID.fromString(claims.get("establishmentId", String.class));
        Specification<Transaction> spec = (root, query, cb) -> {
            List<Predicate> where = new ArrayList<>();
            where.add(cb.equal(root.get("establishmentId"), establishmentId));
            if (terminalId != null) where.add(cb.equal(root.get("terminalId"), terminalId));
            if (cashierUserId != null) where.add(cb.equal(root.get("cashierUserId"), cashierUserId));
            if (gateId != null) where.add(cb.equal(root.get("gateId"), gateId));
            if (from != null) where.add(cb.greaterThanOrEqualTo(root.get("createdAtClient"), from));
            if (to != null) where.add(cb.lessThan(root.get("createdAtClient"), to));
            if (ticketTypeId != null) {
                Subquery<UUID> lines = query.subquery(UUID.class);
                Root<TransactionLine> line = lines.from(TransactionLine.class);
                lines.select(line.get("transactionId"))
                        .where(cb.equal(line.get("transactionId"), root.get("id")), cb.equal(line.get("ticketTypeId"), ticketTypeId));
                where.add(cb.exists(lines));
            }
            return cb.and(where.toArray(Predicate[]::new));
        };
        Page<Transaction> result = transactionRepository.findAll(
                spec, PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), MAX_PAGE_SIZE), Sort.by(Sort.Direction.DESC, "createdAtClient")));

        // Lines for the whole page in one query, not one per sale.
        Map<UUID, List<LineSummary>> linesByTx = lineRepository
                .findByTransactionIdIn(result.getContent().stream().map(Transaction::getId).toList()).stream()
                .collect(Collectors.groupingBy(TransactionLine::getTransactionId,
                        Collectors.mapping(LineSummary::from, Collectors.toList())));
        return result.map(t -> TransactionSummary.from(t, linesByTx.getOrDefault(t.getId(), List.of())));
    }

    @PostMapping("/{id}/void")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'COORDINATOR')")
    @Transactional
    public TransactionSummary voidTransaction(
            @PathVariable UUID id, @Valid @RequestBody VoidRequest request, @AuthenticationPrincipal Claims claims
    ) {
        UUID establishmentId = UUID.fromString(claims.get("establishmentId", String.class));
        Transaction t = transactionRepository.findById(id)
                .filter(tx -> establishmentId.equals(tx.getEstablishmentId()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Vente introuvable."));
        if (t.getStatus() == TransactionStatus.VOIDED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Cette vente est déjà annulée.");
        }
        UUID userId = UUID.fromString(claims.get("userId", String.class));
        t.setStatus(TransactionStatus.VOIDED);
        t.setVoidedByUserId(userId);
        t.setVoidedAt(Instant.now());
        t.setVoidReason(request.reason());
        transactionRepository.save(t);
        // Unused tickets of a voided sale no longer admit anyone. Ones already
        // used keep their REDEEMED history.
        int voidedTickets = 0;
        for (Ticket ticket : ticketRepository.findByTransactionId(t.getId())) {
            if (ticket.getStatus() == TicketStatus.ISSUED) {
                ticket.setStatus(TicketStatus.VOIDED);
                ticketRepository.save(ticket);
                voidedTickets++;
            }
        }
        audit.record(claims, "VOID", "SALE_VOIDED", "TRANSACTION", t.getId(),
                "Vente " + t.getReferenceNumber() + " annulée — motif : " + request.reason()
                        + (voidedTickets > 0 ? " — " + voidedTickets + " billet(s) invalidé(s)" : ""));
        TransactionSummary summary = TransactionSummary.from(t, lineRepository.findByTransactionId(t.getId()).stream().map(LineSummary::from).toList());
        hub.publish("SALES_CHANGED", summary, true);
        return summary;
    }

    public record VoidRequest(@NotBlank @Size(max = 500) String reason) {
    }

    public record TransactionSummary(
            UUID id, String referenceNumber, TransactionStatus status, PaymentMethod paymentMethod,
            BigDecimal totalAmount, String currency, UUID gateId, UUID terminalId, UUID cashierUserId,
            Instant createdAtClient, Instant syncedAt, UUID voidedByUserId, Instant voidedAt, String voidReason,
            List<LineSummary> lines
    ) {
        static TransactionSummary from(Transaction t, List<LineSummary> lines) {
            return new TransactionSummary(
                    t.getId(), t.getReferenceNumber(), t.getStatus(), t.getPaymentMethod(),
                    t.getTotalAmount(), t.getCurrency(), t.getGateId(), t.getTerminalId(), t.getCashierUserId(),
                    t.getCreatedAtClient(), t.getSyncedAt(), t.getVoidedByUserId(), t.getVoidedAt(), t.getVoidReason(),
                    lines
            );
        }
    }

    /** What was sold in a sale: which ticket type, how many, at what unit price. */
    public record LineSummary(UUID ticketTypeId, int quantity, BigDecimal unitPrice) {
        static LineSummary from(TransactionLine l) {
            return new LineSummary(l.getTicketTypeId(), l.getQuantity(), l.getUnitPrice());
        }
    }
}
