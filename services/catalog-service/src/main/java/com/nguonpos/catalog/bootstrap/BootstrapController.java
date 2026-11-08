package com.nguonpos.catalog.bootstrap;

import com.nguonpos.catalog.establishment.Establishment;
import com.nguonpos.catalog.establishment.EstablishmentRepository;
import com.nguonpos.catalog.gate.Gate;
import com.nguonpos.catalog.gate.GateRepository;
import com.nguonpos.catalog.tickettype.TicketTypeRepository;
import io.jsonwebtoken.Claims;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

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

    @GetMapping("/bootstrap")
    public BootstrapResponse bootstrap(@AuthenticationPrincipal Claims claims) {
        UUID establishmentId = UUID.fromString(claims.get("establishmentId", String.class));
        String assignedGateIdRaw = claims.get("assignedGateId", String.class);
        if (assignedGateIdRaw == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cet utilisateur n'est affecté à aucune porte.");
        }
        UUID gateId = UUID.fromString(assignedGateIdRaw);

        Establishment establishment = establishmentRepository.findById(establishmentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Établissement introuvable."));
        Gate gate = gateRepository.findById(gateId)
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
