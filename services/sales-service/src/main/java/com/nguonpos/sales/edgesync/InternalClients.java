package com.nguonpos.sales.edgesync;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;
import javax.crypto.SecretKey;

/**
 * Calls to the other services' /internal/ endpoints, inside the compose
 * network, with a short-lived token for the SERVICE role (signed with the
 * shared JWT secret). nginx refuses /internal/ paths from outside.
 */
@Component
public class InternalClients {

    private final String catalogUrl;
    private final String authUrl;
    private final SecretKey key;
    private final JsonMapper json;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();

    public InternalClients(
            @Value("${internal.catalog-url:http://catalog-service:8080}") String catalogUrl,
            @Value("${internal.auth-url:http://auth-service:8080}") String authUrl,
            @Value("${jwt.signing-secret}") String secret,
            JsonMapper json
    ) {
        this.catalogUrl = catalogUrl;
        this.authUrl = authUrl;
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.json = json;
    }

    /** The gate's bootstrap (catalog, design, QR signing secret) for its desktop tills. */
    public JsonNode gateConfig(UUID establishmentId, UUID gateId) {
        return get(catalogUrl + "/catalog/internal/gates/" + gateId + "/edge-config", establishmentId);
    }

    /** The gate's cashiers and coordinators with their password hashes, for offline login at its tills. */
    public JsonNode gateUsers(UUID establishmentId, UUID gateId) {
        return get(authUrl + "/auth/internal/gates/" + gateId + "/edge-users", establishmentId);
    }

    private JsonNode get(String url, UUID establishmentId) {
        String token = Jwts.builder()
                .subject("sales-service")
                .claim("role", "SERVICE")
                .claim("establishmentId", establishmentId.toString())
                .claim("userId", new UUID(0, 0).toString())
                .expiration(Date.from(Instant.now().plusSeconds(120)))
                .signWith(key)
                .compact();
        try {
            HttpResponse<String> res = http.send(HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(10))
                    .header("Authorization", "Bearer " + token).GET().build(), HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() != 200) throw new IllegalStateException(url + " answered " + res.statusCode());
            return json.readTree(res.body());
        } catch (IOException e) {
            throw new IllegalStateException(url + " unreachable", e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(e);
        }
    }
}
