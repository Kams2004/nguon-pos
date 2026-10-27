package com.nguonpos.auth.user;

import com.nguonpos.auth.config.JwtService;
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

    public AuthController(AppUserRepository userRepository, PasswordEncoder passwordEncoder, JwtService jwtService) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
    }

    @PostMapping("/login")
    public LoginResponse login(@Valid @RequestBody LoginRequest request) {
        AppUser user = userRepository.findByUsernameAndActiveTrue(request.username())
                .orElseThrow(() -> new BadCredentialsException("Identifiants invalides"));
        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw new BadCredentialsException("Identifiants invalides");
        }
        String token = jwtService.generateToken(user);
        return new LoginResponse(
                token, user.getId(), user.getUsername(), user.getFullName(),
                user.getRole(), user.getEstablishmentId(), user.getAssignedGateId()
        );
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
