package com.nguonpos.catalog.tickettype;

import com.nguonpos.catalog.audit.AuditService;
import com.nguonpos.catalog.gate.Gate;
import com.nguonpos.catalog.gate.GateRepository;
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
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/catalog/admin/ticket-types")
@PreAuthorize("hasRole('SUPER_ADMIN')")
public class TicketTypeAdminController {

    private final TicketTypeRepository ticketTypeRepository;
    private final GateRepository gateRepository;
    private final AuditService audit;

    public TicketTypeAdminController(TicketTypeRepository ticketTypeRepository, GateRepository gateRepository, AuditService audit) {
        this.ticketTypeRepository = ticketTypeRepository;
        this.gateRepository = gateRepository;
        this.audit = audit;
    }

    /** The chosen gates, checked to be this establishment's; none = every gate. */
    private Set<UUID> gates(UUID establishmentId, UpsertRequest request) {
        Set<UUID> chosen = new HashSet<>();
        if (request.gateIds() != null) chosen.addAll(request.gateIds());
        else if (request.gateId() != null) chosen.add(request.gateId()); // older clients
        if (chosen.isEmpty()) return chosen;
        Set<UUID> own = gateRepository.findByEstablishmentIdOrderByNameAsc(establishmentId).stream()
                .map(Gate::getId).collect(Collectors.toSet());
        if (!own.containsAll(chosen)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Porte inconnue.");
        return chosen;
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
                .gateIds(gates(establishmentId, request))
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
        t.getGateIds().clear();
        t.getGateIds().addAll(gates(t.getEstablishmentId(), request));
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
            UUID gateId, // older clients: a single gate
            @Size(max = 100) List<UUID> gateIds, // empty or null = sold at every gate
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
            UUID id, List<UUID> gateIds, String name, BigDecimal price, String currency, PrintMode printMode, boolean active, String icon, String color
    ) {
        static TicketTypeSummary from(TicketType t) {
            return new TicketTypeSummary(t.getId(), t.getGateIds().stream().sorted().toList(), t.getName(), t.getPrice(), t.getCurrency(), t.getPrintMode(), t.isActive(), t.getIcon(), t.getColor());
        }
    }
}
