package com.nguonpos.auth.user;

import io.jsonwebtoken.Claims;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

// Read-only names for the back office (cashier filter and breakdown in
// Ventes/Rapports). Coordinators see those pages too but may not manage
// accounts, so this is separate from UserAdminController and exposes only
// what a sale list needs to put a name on a cashier id.
@RestController
@RequestMapping("/auth/admin/directory")
@PreAuthorize("hasAnyRole('SUPER_ADMIN', 'COORDINATOR')")
public class UserDirectoryController {

    private final AppUserRepository userRepository;

    public UserDirectoryController(AppUserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @GetMapping
    public List<DirectoryEntry> list(@AuthenticationPrincipal Claims claims) {
        UUID establishmentId = UUID.fromString(claims.get("establishmentId", String.class));
        return userRepository.findByEstablishmentIdOrderByFullNameAsc(establishmentId).stream()
                .map(u -> new DirectoryEntry(u.getId(), u.getFullName(), u.getRole(), u.isActive()))
                .toList();
    }

    public record DirectoryEntry(UUID id, String fullName, Role role, boolean active) {
    }
}
