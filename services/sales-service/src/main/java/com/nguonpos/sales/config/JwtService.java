package com.nguonpos.sales.config;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;

@Component
public class JwtService {

    private final SecretKey key;

    public JwtService(@Value("${jwt.signing-secret}") String signingSecret) {
        if (signingSecret == null || signingSecret.isBlank() || signingSecret.equals("change-me-to-a-real-random-secret")) {
            throw new IllegalStateException(
                    "JWT_SIGNING_SECRET is not set to a real value. Refusing to start with a weak/default signing key."
            );
        }
        this.key = Keys.hmacShaKeyFor(signingSecret.getBytes(StandardCharsets.UTF_8));
    }

    public Claims parseClaims(String token) {
        return Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }
}
