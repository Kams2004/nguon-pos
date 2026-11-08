package com.nguonpos.catalog.tickettype;

import com.nguonpos.catalog.audit.AuditService;
import io.jsonwebtoken.Claims;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
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
    private final AuditService audit;

    public TicketTypeAdminController(TicketTypeRepository ticketTypeRepository, AuditService audit) {
        this.ticketTypeRepository = ticketTypeRepository;
        this.audit = audit;
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
                .icon(request.icon())
                .color(request.color())
                .active(true)
                .createdAt(now)
                .updatedAt(now)
                .build();
        ticketTypeRepository.save(t);
        audit.record(claims, "CATALOG", "TICKET_TYPE_CREATED", "TICKET_TYPE", t.getId(),
                "Billet « " + t.getName() + " » créé — " + t.getPrice().toPlainString() + " " + t.getCurrency());
        audit.catalogChanged();
        return TicketTypeSummary.from(t);
    }

    @PutMapping("/{id}")
    public TicketTypeSummary update(
            @PathVariable UUID id, @Valid @RequestBody UpsertRequest request, @AuthenticationPrincipal Claims claims
    ) {
        TicketType t = ticketTypeRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Type de billet introuvable."));
        String priceChange = t.getPrice().compareTo(request.price()) != 0
                ? " (prix " + t.getPrice().toPlainString() + " → " + request.price().toPlainString() + ")"
                : "";
        t.setGateId(request.gateId());
        t.setName(request.name());
        t.setPrice(request.price());
        t.setCurrency(request.currency());
        t.setPrintMode(request.printMode());
        t.setIcon(request.icon());
        t.setColor(request.color());
        t.setUpdatedAt(Instant.now());
        ticketTypeRepository.save(t);
        audit.record(claims, "CATALOG", "TICKET_TYPE_UPDATED", "TICKET_TYPE", t.getId(),
                "Billet « " + t.getName() + " » modifié" + priceChange);
        audit.catalogChanged();
        return TicketTypeSummary.from(t);
    }

    @PutMapping("/{id}/active")
    public TicketTypeSummary setActive(
            @PathVariable UUID id, @RequestBody SetActiveRequest request, @AuthenticationPrincipal Claims claims
    ) {
        TicketType t = ticketTypeRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Type de billet introuvable."));
        t.setActive(request.active());
        t.setUpdatedAt(Instant.now());
        ticketTypeRepository.save(t);
        audit.record(claims, "CATALOG", request.active() ? "TICKET_TYPE_ACTIVATED" : "TICKET_TYPE_DEACTIVATED", "TICKET_TYPE", t.getId(),
                "Billet « " + t.getName() + " » " + (request.active() ? "activé" : "désactivé"));
        audit.catalogChanged();
        return TicketTypeSummary.from(t);
    }

    public record UpsertRequest(
            UUID gateId, // null = sellable at any gate
            @NotBlank @Size(max = 200) String name,
            @NotNull @PositiveOrZero BigDecimal price,
            @NotBlank @Size(max = 10) String currency,
            @NotNull PrintMode printMode,
            @Size(max = 40) String icon,
            @Size(max = 20) String color
    ) {
    }

    public record SetActiveRequest(boolean active) {
    }

    public record TicketTypeSummary(
            UUID id, UUID gateId, String name, BigDecimal price, String currency, PrintMode printMode, boolean active, String icon, String color
    ) {
        static TicketTypeSummary from(TicketType t) {
            return new TicketTypeSummary(t.getId(), t.getGateId(), t.getName(), t.getPrice(), t.getCurrency(), t.getPrintMode(), t.isActive(), t.getIcon(), t.getColor());
        }
    }
}
