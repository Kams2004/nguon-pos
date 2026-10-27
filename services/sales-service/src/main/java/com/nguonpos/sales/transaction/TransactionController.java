package com.nguonpos.sales.transaction;

import io.jsonwebtoken.Claims;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

// Basic filterable list, per Milestone 1's demo criterion, plus the
// authorized void/cancel flow (Milestone 3) — the cahier is explicit that
// a validated sale is never hard-deleted (section 6.3: prefer a status
// flip + audit trail over deletion, to preserve traceability), and that a
// cashier alone cannot freely modify a validated sale (section 6.1).
@RestController
@RequestMapping("/sales/transactions")
public class TransactionController {

    private final TransactionRepository transactionRepository;

    public TransactionController(TransactionRepository transactionRepository) {
        this.transactionRepository = transactionRepository;
    }

    @GetMapping
    public Page<TransactionSummary> list(
            @AuthenticationPrincipal Claims claims,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "25") int size
    ) {
        UUID establishmentId = UUID.fromString(claims.get("establishmentId", String.class));
        return transactionRepository.findByEstablishmentIdOrderByCreatedAtClientDesc(establishmentId, PageRequest.of(page, size))
                .map(TransactionSummary::from);
    }

    @PostMapping("/{id}/void")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'COORDINATOR')")
    public TransactionSummary voidTransaction(
            @PathVariable UUID id, @Valid @RequestBody VoidRequest request, @AuthenticationPrincipal Claims claims
    ) {
        Transaction t = transactionRepository.findById(id)
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
        return TransactionSummary.from(t);
    }

    public record VoidRequest(@NotBlank String reason) {
    }

    public record TransactionSummary(
            UUID id, String referenceNumber, TransactionStatus status, PaymentMethod paymentMethod,
            BigDecimal totalAmount, String currency, UUID gateId, Instant createdAtClient, Instant syncedAt,
            UUID voidedByUserId, Instant voidedAt, String voidReason
    ) {
        static TransactionSummary from(Transaction t) {
            return new TransactionSummary(
                    t.getId(), t.getReferenceNumber(), t.getStatus(), t.getPaymentMethod(),
                    t.getTotalAmount(), t.getCurrency(), t.getGateId(), t.getCreatedAtClient(), t.getSyncedAt(),
                    t.getVoidedByUserId(), t.getVoidedAt(), t.getVoidReason()
            );
        }
    }
}
