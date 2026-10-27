package com.nguonpos.catalog.establishment;

import io.jsonwebtoken.Claims;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
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

    public EstablishmentAdminController(EstablishmentRepository establishmentRepository) {
        this.establishmentRepository = establishmentRepository;
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
        e.setUpdatedAt(Instant.now());
        establishmentRepository.save(e);
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
            @NotNull ReceiptMode receiptMode
    ) {
    }

    public record EstablishmentDetail(
            UUID id, String name, String logoUrl, String brandPrimaryColor, String brandSecondaryColor, ReceiptMode receiptMode
    ) {
        static EstablishmentDetail from(Establishment e) {
            return new EstablishmentDetail(e.getId(), e.getName(), e.getLogoUrl(), e.getBrandPrimaryColor(), e.getBrandSecondaryColor(), e.getReceiptMode());
        }
    }
}
