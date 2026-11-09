package com.nguonpos.auth.user;

import io.jsonwebtoken.Claims;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * Who may log in at a gate's desktop tills, offline included: that gate's
 * cashiers and coordinators with their bcrypt password hash. Fetched by
 * sales-service with a service token and sent only over the tills'
 * mutual-TLS channel; nginx refuses /internal/ from outside. Super
 * administrators are never sent to a till.
 */
@RestController
public class EdgeUsersController {

    private final AppUserRepository users;

    public EdgeUsersController(AppUserRepository users) {
        this.users = users;
    }

    @GetMapping("/auth/internal/gates/{gateId}/edge-users")
    @PreAuthorize("hasRole('SERVICE')")
    public List<EdgeUser> edgeUsers(@AuthenticationPrincipal Claims claims, @PathVariable UUID gateId) {
        UUID establishmentId = UUID.fromString(claims.get("establishmentId", String.class));
        return users.findByEstablishmentIdOrderByFullNameAsc(establishmentId).stream()
                .filter(u -> gateId.equals(u.getAssignedGateId()) && u.getRole() != Role.SUPER_ADMIN)
                .map(u -> new EdgeUser(u.getId(), u.getUsername(), u.getFullName(), u.getRole(), u.getPasswordHash(), u.isActive()))
                .toList();
    }

    public record EdgeUser(UUID id, String username, String fullName, Role role, String passwordHash, boolean active) {
    }
}
