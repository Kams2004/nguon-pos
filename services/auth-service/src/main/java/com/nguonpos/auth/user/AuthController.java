package com.nguonpos.auth.user;

import com.nguonpos.auth.audit.AuditService;
import com.nguonpos.auth.config.JwtService;
import io.jsonwebtoken.Claims;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/auth")
public class AuthController {

    private final AppUserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final AuditService audit;

    public AuthController(AppUserRepository userRepository, PasswordEncoder passwordEncoder, JwtService jwtService, AuditService audit) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.audit = audit;
    }

    @PostMapping("/login")
    public LoginResponse login(@Valid @RequestBody LoginRequest request) {
        AppUser user = userRepository.findByUsernameAndActiveTrue(request.username()).orElse(null);
        if (user == null || !passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            audit.recordAs(user != null ? user.getId() : null, request.username(), "AUTH", "LOGIN_FAILED", "USER",
                    user != null ? user.getId() : null, "Échec de connexion pour l'identifiant « " + request.username() + " »");
            throw new BadCredentialsException("Identifiants invalides");
        }
        String token = jwtService.generateToken(user);
        audit.recordAs(user.getId(), user.getFullName(), "AUTH", "LOGIN", "USER", user.getId(),
                user.getFullName() + " s'est connecté(e)");
        return new LoginResponse(
                token, user.getId(), user.getUsername(), user.getFullName(),
                user.getRole(), user.getEstablishmentId(), user.getAssignedGateId()
        );
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(@AuthenticationPrincipal Claims claims) {
        // Tokens are stateless; this only journals the explicit logout.
        if (claims != null) {
            audit.record(claims, "AUTH", "LOGOUT", "USER", AuditService.actorId(claims),
                    AuditService.actorName(claims) + " s'est déconnecté(e)");
        }
        return ResponseEntity.ok().build();
    }

    @GetMapping("/me")
    public ResponseEntity<MeResponse> me(@RequestHeader("Authorization") String authHeader) {
        String token = authHeader.replaceFirst("^Bearer ", "");
        var claims = jwtService.parseClaims(token);
        UUID userId = UUID.fromString(claims.get("userId", String.class));
        return userRepository.findById(userId)
                .map(u -> new MeResponse(u.getId(), u.getUsername(), u.getFullName(), u.getRole(), u.getEstablishmentId(), u.getAssignedGateId()))
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    // Deliberately not the raw AppUser entity — never serialize passwordHash
    // back out, even though it's a one-way bcrypt hash.
    public record MeResponse(UUID id, String username, String fullName, Role role, UUID establishmentId, UUID assignedGateId) {
    }

    @ExceptionHandler(BadCredentialsException.class)
    public ResponseEntity<ErrorBody> handleBadCredentials(BadCredentialsException ex) {
        return ResponseEntity.status(401).body(new ErrorBody(ex.getMessage()));
    }

    public record ErrorBody(String message) {
    }
}
