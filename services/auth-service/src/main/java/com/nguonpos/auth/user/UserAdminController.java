package com.nguonpos.auth.user;

import com.nguonpos.auth.audit.AuditService;
import io.jsonwebtoken.Claims;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotNull;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

// User management: Super Admin only — matches the cahier's RBAC (section 6):
// only the Super Admin creates/modifies accounts and assigns roles/gates.
// Note on gateId: not validated against catalog-service here (no
// cross-service call) — this is a Phase 1 simplification consistent with
// cross-service references being logical, not DB-enforced, elsewhere in
// this system; the admin UI only ever offers gate ids it fetched from
// catalog-service's own gate list, so this stays safe in practice.
@RestController
@RequestMapping("/auth/admin/users")
@PreAuthorize("hasRole('SUPER_ADMIN')")
public class UserAdminController {

    private final AppUserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuditService audit;

    public UserAdminController(AppUserRepository userRepository, PasswordEncoder passwordEncoder, AuditService audit) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.audit = audit;
    }

    @GetMapping
    public List<UserSummary> list(@AuthenticationPrincipal Claims claims) {
        UUID establishmentId = UUID.fromString(claims.get("establishmentId", String.class));
        return userRepository.findByEstablishmentIdOrderByFullNameAsc(establishmentId).stream()
                .map(UserSummary::from)
                .toList();
    }

    @PostMapping
    public UserSummary create(@AuthenticationPrincipal Claims claims, @Valid @RequestBody CreateRequest request) {
        if (userRepository.existsByUsername(request.username())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Cet identifiant est déjà utilisé.");
        }
        UUID establishmentId = UUID.fromString(claims.get("establishmentId", String.class));
        Instant now = Instant.now();
        AppUser user = AppUser.builder()
                .establishmentId(establishmentId)
                .username(request.username())
                .passwordHash(passwordEncoder.encode(request.password()))
                .fullName(request.fullName())
                .role(request.role())
                .assignedGateId(request.assignedGateId())
                .active(true)
                .createdAt(now)
                .updatedAt(now)
                .build();
        userRepository.save(user);
        audit.usersChanged();
        audit.record(claims, "USER", "USER_CREATED", "USER", user.getId(),
                "Utilisateur « " + user.getFullName() + " » (" + user.getUsername() + ", " + user.getRole() + ") créé");
        return UserSummary.from(user);
    }

    @PutMapping("/{id}")
    public UserSummary update(@PathVariable UUID id, @Valid @RequestBody UpdateRequest request, @AuthenticationPrincipal Claims claims) {
        AppUser user = userRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Utilisateur introuvable."));
        if (id.equals(AuditService.actorId(claims)) && (!request.active() || request.role() != user.getRole())) {
            // Never let the Super Admin lock themselves out by accident.
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Vous ne pouvez pas désactiver votre propre compte ni changer votre rôle.");
        }
        java.util.List<String> changes = new java.util.ArrayList<>();
        if (!user.getFullName().equals(request.fullName())) changes.add("nom « " + user.getFullName() + " » → « " + request.fullName() + " »");
        if (user.getRole() != request.role()) changes.add("rôle " + user.getRole() + " → " + request.role());
        if (!java.util.Objects.equals(user.getAssignedGateId(), request.assignedGateId())) changes.add("porte modifiée");
        if (user.isActive() != request.active()) changes.add(request.active() ? "réactivé" : "désactivé");
        if (request.password() != null && !request.password().isBlank()) changes.add("mot de passe réinitialisé");
        user.setFullName(request.fullName());
        user.setRole(request.role());
        user.setAssignedGateId(request.assignedGateId());
        user.setActive(request.active());
        user.setUpdatedAt(Instant.now());
        if (request.password() != null && !request.password().isBlank()) {
            user.setPasswordHash(passwordEncoder.encode(request.password()));
        }
        userRepository.save(user);
        audit.usersChanged();
        audit.record(claims, "USER", "USER_UPDATED", "USER", user.getId(),
                "Utilisateur « " + user.getFullName() + " » modifié" + (changes.isEmpty() ? "" : " : " + String.join(", ", changes)));
        return UserSummary.from(user);
    }

    public record CreateRequest(
            @NotBlank @Size(max = 100) String username, @NotBlank @Size(min = 4, max = 200) String password,
            @NotBlank @Size(max = 200) String fullName,
            @NotNull Role role, UUID assignedGateId
    ) {
    }

    public record UpdateRequest(
            @NotBlank @Size(max = 200) String fullName, @NotNull Role role, UUID assignedGateId, boolean active,
            @Size(max = 200) String password
    ) {
    }

    // Deliberately excludes passwordHash — never serialize it back out.
    public record UserSummary(UUID id, String username, String fullName, Role role, UUID assignedGateId, boolean active) {
        static UserSummary from(AppUser u) {
            return new UserSummary(u.getId(), u.getUsername(), u.getFullName(), u.getRole(), u.getAssignedGateId(), u.isActive());
        }
    }
}
