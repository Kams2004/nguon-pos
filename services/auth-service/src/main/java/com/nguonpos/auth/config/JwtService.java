package com.nguonpos.auth.config;

import com.nguonpos.auth.user.AppUser;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.UUID;

// Signing key is read ONCE from an externalized env var (JWT_SIGNING_SECRET)
// instead of generated randomly per boot — tokens survive restarts and work
// identically across multiple replicas of a service. This is the specific
// fix for the weakness verified in the old Nguon festival backend's
// JwtUtil.java (Keys.secretKeyFor(...) regenerated every boot).
@Component
public class JwtService {

    private final SecretKey key;
    private static final long EXPIRATION_MS = 24L * 60 * 60 * 1000; // 24h — gate terminals run long offline shifts

    public JwtService(@Value("${jwt.signing-secret}") String signingSecret) {
        if (signingSecret == null || signingSecret.isBlank() || signingSecret.equals("change-me-to-a-real-random-secret")) {
            throw new IllegalStateException(
                    "JWT_SIGNING_SECRET is not set to a real value. Refusing to start with a weak/default signing key."
            );
        }
        this.key = Keys.hmacShaKeyFor(signingSecret.getBytes(StandardCharsets.UTF_8));
    }

    public String generateToken(AppUser user) {
        return Jwts.builder()
                .subject(user.getUsername())
                .claim("userId", user.getId().toString())
                .claim("establishmentId", user.getEstablishmentId().toString())
                .claim("role", user.getRole().name())
                .claim("assignedGateId", user.getAssignedGateId() != null ? user.getAssignedGateId().toString() : null)
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + EXPIRATION_MS))
                .signWith(key)
                .compact();
    }

    public Claims parseClaims(String token) {
        return Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }
}
