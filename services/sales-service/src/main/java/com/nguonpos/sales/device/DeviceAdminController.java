package com.nguonpos.sales.device;

import com.nguonpos.sales.edgesync.EdgeSessions;
import io.jsonwebtoken.Claims;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/** "Appareils": desktop tills of the establishment, enrollment codes, revocation. */
@RestController
@RequestMapping("/sales/admin/devices")
public class DeviceAdminController {

    private final DeviceRegistry registry;
    private final EdgeSessions sessions;

    public DeviceAdminController(DeviceRegistry registry, EdgeSessions sessions) {
        this.registry = registry;
        this.sessions = sessions;
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'COORDINATOR')")
    public List<Map<String, Object>> list(@AuthenticationPrincipal Claims claims) {
        return registry.list(establishmentOf(claims));
    }

    @PostMapping("/enrollment-codes")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public DeviceRegistry.EnrollmentCode createCode(@AuthenticationPrincipal Claims claims, @Valid @RequestBody CodeRequest req) {
        return registry.createCode(establishmentOf(claims), req.gateId(), req.label() == null ? "" : req.label().strip(), claims);
    }

    @GetMapping("/enrollment-codes")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'COORDINATOR')")
    public List<Map<String, Object>> pendingCodes(@AuthenticationPrincipal Claims claims) {
        return registry.pendingCodes(establishmentOf(claims));
    }

    @DeleteMapping("/enrollment-codes/{id}")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<Void> cancelCode(@AuthenticationPrincipal Claims claims, @PathVariable UUID id) {
        registry.cancelCode(establishmentOf(claims), id, claims);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/revoke")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<Void> revoke(@AuthenticationPrincipal Claims claims, @PathVariable UUID id) {
        registry.revoke(establishmentOf(claims), id, claims);
        sessions.disconnect(id);
        return ResponseEntity.noContent().build();
    }

    private static UUID establishmentOf(Claims claims) {
        return UUID.fromString(claims.get("establishmentId", String.class));
    }

    /** label is optional: without one the till is named "Caisse n° N" when it enrolls. */
    public record CodeRequest(@NotNull UUID gateId, @Size(max = 200) String label) {
    }
}
