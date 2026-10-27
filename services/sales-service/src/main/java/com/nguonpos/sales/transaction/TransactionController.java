package com.nguonpos.sales.transaction;

import io.jsonwebtoken.Claims;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

// Basic filterable list for Milestone 1's demo criterion — "synced
// transactions appear in a raw admin list with correct totals." Charts,
// exports and richer filtering are Milestone 3.
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
                .map(t -> new TransactionSummary(
                        t.getId(), t.getReferenceNumber(), t.getStatus(), t.getPaymentMethod(),
                        t.getTotalAmount(), t.getCurrency(), t.getGateId(), t.getCreatedAtClient(), t.getSyncedAt()
                ));
    }

    public record TransactionSummary(
            UUID id, String referenceNumber, TransactionStatus status, PaymentMethod paymentMethod,
            BigDecimal totalAmount, String currency, UUID gateId, Instant createdAtClient, Instant syncedAt
    ) {
    }
}
