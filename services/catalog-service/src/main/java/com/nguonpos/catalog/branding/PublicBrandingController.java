package com.nguonpos.catalog.branding;

import com.nguonpos.catalog.establishment.EstablishmentRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

// Unauthenticated on purpose: the login screen shows the establishment's
// logo and background before anyone has a token. Exposes only what's
// already printed on every public ticket — nothing operational.
@RestController
@RequestMapping("/catalog/public/branding")
public class PublicBrandingController {

    private final EstablishmentRepository establishmentRepository;

    public PublicBrandingController(EstablishmentRepository establishmentRepository) {
        this.establishmentRepository = establishmentRepository;
    }

    @GetMapping
    public Branding get() {
        // Phase 1 runs a single establishment per deployment.
        return establishmentRepository.findAll().stream().findFirst()
                .map(e -> new Branding(e.getName(), e.getLogoUrl(), e.getLoginBackgroundUrl()))
                .orElse(new Branding(null, null, null));
    }

    public record Branding(String name, String logoUrl, String loginBackgroundUrl) {
    }
}
