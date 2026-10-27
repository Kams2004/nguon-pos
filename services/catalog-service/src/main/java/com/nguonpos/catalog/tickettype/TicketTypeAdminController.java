package com.nguonpos.catalog.tickettype;

import io.jsonwebtoken.Claims;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/catalog/admin/ticket-types")
@PreAuthorize("hasRole('SUPER_ADMIN')")
public class TicketTypeAdminController {

    private final TicketTypeRepository ticketTypeRepository;

    public TicketTypeAdminController(TicketTypeRepository ticketTypeRepository) {
        this.ticketTypeRepository = ticketTypeRepository;
    }

    @GetMapping
    public List<TicketTypeSummary> list(@AuthenticationPrincipal Claims claims) {
        UUID establishmentId = UUID.fromString(claims.get("establishmentId", String.class));
        return ticketTypeRepository.findByEstablishmentIdOrderByNameAsc(establishmentId).stream()
                .map(TicketTypeSummary::from)
                .toList();
    }

    @PostMapping
    public TicketTypeSummary create(@AuthenticationPrincipal Claims claims, @Valid @RequestBody UpsertRequest request) {
        UUID establishmentId = UUID.fromString(claims.get("establishmentId", String.class));
        Instant now = Instant.now();
        TicketType t = TicketType.builder()
                .establishmentId(establishmentId)
                .gateId(request.gateId())
                .name(request.name())
                .price(request.price())
                .currency(request.currency())
                .printMode(request.printMode())
                .active(true)
                .createdAt(now)
                .updatedAt(now)
                .build();
        ticketTypeRepository.save(t);
        return TicketTypeSummary.from(t);
    }

    @PutMapping("/{id}")
    public TicketTypeSummary update(@PathVariable UUID id, @Valid @RequestBody UpsertRequest request) {
        TicketType t = ticketTypeRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Type de billet introuvable."));
        t.setGateId(request.gateId());
        t.setName(request.name());
        t.setPrice(request.price());
        t.setCurrency(request.currency());
        t.setPrintMode(request.printMode());
        t.setUpdatedAt(Instant.now());
        ticketTypeRepository.save(t);
        return TicketTypeSummary.from(t);
    }

    @PutMapping("/{id}/active")
    public TicketTypeSummary setActive(@PathVariable UUID id, @RequestBody SetActiveRequest request) {
        TicketType t = ticketTypeRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Type de billet introuvable."));
        t.setActive(request.active());
        t.setUpdatedAt(Instant.now());
        ticketTypeRepository.save(t);
        return TicketTypeSummary.from(t);
    }

    public record UpsertRequest(
            UUID gateId, // null = sellable at any gate
            @NotBlank String name,
            @NotNull @PositiveOrZero BigDecimal price,
            @NotBlank String currency,
            @NotNull PrintMode printMode
    ) {
    }

    public record SetActiveRequest(boolean active) {
    }

    public record TicketTypeSummary(
            UUID id, UUID gateId, String name, BigDecimal price, String currency, PrintMode printMode, boolean active
    ) {
        static TicketTypeSummary from(TicketType t) {
            return new TicketTypeSummary(t.getId(), t.getGateId(), t.getName(), t.getPrice(), t.getCurrency(), t.getPrintMode(), t.isActive());
        }
    }
}
