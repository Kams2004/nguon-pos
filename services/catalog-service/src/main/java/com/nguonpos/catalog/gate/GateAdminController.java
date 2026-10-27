package com.nguonpos.catalog.gate;

import io.jsonwebtoken.Claims;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

// Gate management: Super Admin only. Creating/editing a gate is a config
// action with real operational weight — most notably, a gate's
// signingSecret is generated once at creation and never exposed or
// editable through this API afterward (the bootstrap endpoint is the only
// place it's ever returned, to the gate's own authenticated terminal) —
// rotating it would invalidate every QR already printed for that gate.
@RestController
@RequestMapping("/catalog/admin/gates")
@PreAuthorize("hasRole('SUPER_ADMIN')")
public class GateAdminController {

    private final GateRepository gateRepository;

    public GateAdminController(GateRepository gateRepository) {
        this.gateRepository = gateRepository;
    }

    @GetMapping
    public List<GateSummary> list(@AuthenticationPrincipal Claims claims) {
        UUID establishmentId = UUID.fromString(claims.get("establishmentId", String.class));
        return gateRepository.findByEstablishmentIdOrderByNameAsc(establishmentId).stream()
                .map(GateSummary::from)
                .toList();
    }

    @PostMapping
    public GateSummary create(@AuthenticationPrincipal Claims claims, @RequestBody CreateGateRequest request) {
        UUID establishmentId = UUID.fromString(claims.get("establishmentId", String.class));
        Instant now = Instant.now();
        Gate gate = Gate.builder()
                .establishmentId(establishmentId)
                .name(request.name())
                .code(request.code())
                .signingSecret(generateSigningSecret())
                .active(true)
                .createdAt(now)
                .updatedAt(now)
                .build();
        gateRepository.save(gate);
        return GateSummary.from(gate);
    }

    @PutMapping("/{id}")
    public GateSummary update(@PathVariable UUID id, @RequestBody UpdateGateRequest request) {
        Gate gate = gateRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Porte introuvable."));
        gate.setName(request.name());
        gate.setActive(request.active());
        gate.setUpdatedAt(Instant.now());
        gateRepository.save(gate);
        return GateSummary.from(gate);
    }

    private static String generateSigningSecret() {
        byte[] bytes = new byte[32];
        new SecureRandom().nextBytes(bytes);
        StringBuilder sb = new StringBuilder();
        for (byte b : bytes) sb.append(String.format("%02x", b));
        return sb.toString();
    }

    public record CreateGateRequest(@NotBlank String name, @NotBlank String code) {
    }

    public record UpdateGateRequest(@NotBlank String name, boolean active) {
    }

    // Deliberately excludes signingSecret from any admin-list response —
    // that value only ever travels to the gate's own authenticated terminal
    // via /catalog/bootstrap, never to an admin screen.
    public record GateSummary(UUID id, String name, String code, boolean active) {
        static GateSummary from(Gate g) {
            return new GateSummary(g.getId(), g.getName(), g.getCode(), g.isActive());
        }
    }
}
