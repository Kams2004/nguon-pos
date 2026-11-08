package com.nguonpos.catalog.establishment;

import com.nguonpos.catalog.audit.AuditService;
import io.jsonwebtoken.Claims;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.UUID;

@RestController
@RequestMapping("/catalog/admin/establishment")
@PreAuthorize("hasRole('SUPER_ADMIN')")
public class EstablishmentAdminController {

    private final EstablishmentRepository establishmentRepository;
    private final AuditService audit;

    public EstablishmentAdminController(EstablishmentRepository establishmentRepository, AuditService audit) {
        this.establishmentRepository = establishmentRepository;
        this.audit = audit;
    }

    @GetMapping
    public EstablishmentDetail get(@AuthenticationPrincipal Claims claims) {
        return EstablishmentDetail.from(findForCaller(claims));
    }

    @PutMapping
    public EstablishmentDetail update(@AuthenticationPrincipal Claims claims, @Valid @RequestBody UpdateRequest request) {
        Establishment e = findForCaller(claims);
        e.setName(request.name());
        e.setLogoUrl(request.logoUrl());
        e.setBrandPrimaryColor(request.brandPrimaryColor());
        e.setBrandSecondaryColor(request.brandSecondaryColor());
        e.setReceiptMode(request.receiptMode());
        e.setTicketTitle(blankToNull(request.ticketTitle()));
        e.setTicketSubtitle(blankToNull(request.ticketSubtitle()));
        e.setTicketTagline(blankToNull(request.ticketTagline()));
        e.setTicketLocation(blankToNull(request.ticketLocation()));
        e.setTicketFooter(blankToNull(request.ticketFooter()));
        e.setTicketBannerUrl(blankToNull(request.ticketBannerUrl()));
        e.setReceiptFooter(blankToNull(request.receiptFooter()));
        e.setLoginBackgroundUrl(blankToNull(request.loginBackgroundUrl()));
        e.setTicketOptions(blankToNull(request.ticketOptions()));
        e.setReceiptOptions(blankToNull(request.receiptOptions()));
        e.setUpdatedAt(Instant.now());
        establishmentRepository.save(e);
        audit.record(claims, "SETTINGS", "ESTABLISHMENT_UPDATED", "ESTABLISHMENT", e.getId(),
                "Paramètres de l'établissement et du billet modifiés");
        audit.catalogChanged();
        return EstablishmentDetail.from(e);
    }

    private Establishment findForCaller(Claims claims) {
        UUID establishmentId = UUID.fromString(claims.get("establishmentId", String.class));
        return establishmentRepository.findById(establishmentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Établissement introuvable."));
    }

    public record UpdateRequest(
            @NotBlank String name,
            String logoUrl,
            String brandPrimaryColor,
            String brandSecondaryColor,
            @NotNull ReceiptMode receiptMode,
            String ticketTitle,
            String ticketSubtitle,
            String ticketTagline,
            String ticketLocation,
            String ticketFooter,
            String ticketBannerUrl,
            String receiptFooter,
            String loginBackgroundUrl,
            @Size(max = 8000) String ticketOptions,
            @Size(max = 8000) String receiptOptions
    ) {
    }

    private static String blankToNull(String v) {
        return v == null || v.isBlank() ? null : v.trim();
    }

    public record EstablishmentDetail(
            UUID id, String name, String logoUrl, String brandPrimaryColor, String brandSecondaryColor, ReceiptMode receiptMode,
            String ticketTitle, String ticketSubtitle, String ticketTagline, String ticketLocation, String ticketFooter,
            String ticketBannerUrl, String receiptFooter, String loginBackgroundUrl, String ticketOptions, String receiptOptions
    ) {
        static EstablishmentDetail from(Establishment e) {
            return new EstablishmentDetail(e.getId(), e.getName(), e.getLogoUrl(), e.getBrandPrimaryColor(), e.getBrandSecondaryColor(), e.getReceiptMode(),
                    e.getTicketTitle(), e.getTicketSubtitle(), e.getTicketTagline(), e.getTicketLocation(), e.getTicketFooter(),
                    e.getTicketBannerUrl(), e.getReceiptFooter(), e.getLoginBackgroundUrl(), e.getTicketOptions(), e.getReceiptOptions());
        }
    }
}
