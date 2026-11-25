package com.nguonpos.catalog.bootstrap;

import com.nguonpos.catalog.establishment.Establishment;
import com.nguonpos.catalog.establishment.EstablishmentRepository;
import com.nguonpos.catalog.gate.Gate;
import com.nguonpos.catalog.gate.GateRepository;
import com.nguonpos.catalog.tickettype.TicketTypeRepository;
import io.jsonwebtoken.Claims;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import java.util.List;
import java.util.UUID;

// Fetched once at login and cached locally by the PWA — this is everything
// a gate terminal needs to operate fully offline afterward: its ticket
// catalog, its own QR signing secret, and branding. No further network call
// is needed to sell or validate a ticket. See docs/QR_TICKET_SPEC.md.
@RestController
@RequestMapping("/catalog")
public class BootstrapController {

    private final EstablishmentRepository establishmentRepository;
    private final GateRepository gateRepository;
    private final TicketTypeRepository ticketTypeRepository;

    public BootstrapController(
            EstablishmentRepository establishmentRepository,
            GateRepository gateRepository,
            TicketTypeRepository ticketTypeRepository
    ) {
        this.establishmentRepository = establishmentRepository;
        this.gateRepository = gateRepository;
        this.ticketTypeRepository = ticketTypeRepository;
    }

    /**
     * The till's document for the gate it works at: ?gateId= (a desktop till
     * passes its own gate; a browser till the gate the cashier picked), or
     * the user's only gate. The user must be allowed there.
     */
    @GetMapping("/bootstrap")
    public BootstrapResponse bootstrap(@AuthenticationPrincipal Claims claims, @RequestParam(required = false) UUID gateId) {
        UUID establishmentId = UUID.fromString(claims.get("establishmentId", String.class));
        List<String> allowed = allowedGates(claims);
        UUID gate = gateId != null ? gateId : allowed.size() == 1 ? UUID.fromString(allowed.getFirst()) : null;
        if (gate == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "GATE_REQUIRED");
        }
        if (!allowed.isEmpty() && !allowed.contains(gate.toString())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Ce compte n'est pas autorisé à cette porte.");
        }
        return build(establishmentId, gate);
    }

    /** The active gates this user may work at — for a browser till's "which gate?" step. */
    @GetMapping("/my-gates")
    public List<GateChoice> myGates(@AuthenticationPrincipal Claims claims) {
        UUID establishmentId = UUID.fromString(claims.get("establishmentId", String.class));
        List<String> allowed = allowedGates(claims);
        return gateRepository.findByEstablishmentIdOrderByNameAsc(establishmentId).stream()
                .filter(Gate::isActive)
                .filter(g -> allowed.isEmpty() || allowed.contains(g.getId().toString()))
                .map(g -> new GateChoice(g.getId(), g.getName(), g.getCode()))
                .toList();
    }

    public record GateChoice(UUID id, String name, String code) {
    }

    /** The token's allowed gates; [] = every gate. Tokens from before multi-gate users carry only assignedGateId. */
    static List<String> allowedGates(Claims claims) {
        Object raw = claims.get("gateIds");
        if (raw instanceof List<?> list) return list.stream().map(String::valueOf).toList();
        String one = claims.get("assignedGateId", String.class);
        return one == null ? List.of() : List.of(one);
    }

    /**
     * The same document for a desktop till's local server, fetched by
     * sales-service (service token) to push it over the till's live channel
     * whenever the catalog changes. Never reachable from outside: nginx
     * refuses every /internal/ path.
     */
    @GetMapping("/internal/gates/{gateId}/edge-config")
    @PreAuthorize("hasRole('SERVICE')")
    public BootstrapResponse edgeConfig(@AuthenticationPrincipal Claims claims, @PathVariable UUID gateId) {
        UUID establishmentId = UUID.fromString(claims.get("establishmentId", String.class));
        Gate gate = gateRepository.findById(gateId)
                .filter(g -> establishmentId.equals(g.getEstablishmentId()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Porte introuvable."));
        return build(establishmentId, gate.getId());
    }

    private BootstrapResponse build(UUID establishmentId, UUID gateId) {
        Establishment establishment = establishmentRepository.findById(establishmentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Établissement introuvable."));
        Gate gate = gateRepository.findById(gateId)
                .filter(g -> g.getEstablishmentId().equals(establishmentId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Porte introuvable."));

        var ticketTypes = ticketTypeRepository.findSellableAtGate(establishmentId, gateId).stream()
                .map(t -> new BootstrapResponse.TicketTypeInfo(t.getId(), t.getName(), t.getPrice(), t.getCurrency(), t.getPrintMode().name(), t.getIcon(), t.getColor()))
                .toList();

        return new BootstrapResponse(
                new BootstrapResponse.EstablishmentInfo(
                        establishment.getId(), establishment.getName(), establishment.getLogoUrl(),
                        establishment.getBrandPrimaryColor(), establishment.getBrandSecondaryColor(),
                        establishment.getTicketTitle(), establishment.getTicketSubtitle(), establishment.getTicketTagline(),
                        establishment.getTicketLocation(), establishment.getTicketFooter(), establishment.getTicketBannerUrl(),
                        establishment.getReceiptFooter(), establishment.getTicketOptions(), establishment.getReceiptOptions(),
                        establishment.getReceiptMode().name()
                ),
                new BootstrapResponse.GateInfo(gate.getId(), gate.getName(), gate.getCode(), gate.getSigningSecret()),
                ticketTypes
        );
    }
}
