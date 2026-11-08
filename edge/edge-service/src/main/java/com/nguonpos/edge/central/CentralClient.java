package com.nguonpos.edge.central;

import com.nguonpos.edge.EdgeProperties;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;

/**
 * Calls to central over HTTPS with a user's JWT — the existing endpoints the
 * browser till uses. (Milestone 2 replaces this with the device-certificate
 * WebSocket.) Any network failure surfaces as {@link Unreachable}, which
 * callers treat as "offline", never as an error shown to the cashier.
 */
@Component
public class CentralClient {

    private final EdgeProperties props;
    private final JsonMapper json;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(4)).build();

    public CentralClient(EdgeProperties props, JsonMapper json) {
        this.props = props;
        this.json = json;
    }

    public boolean configured() {
        return props.hasCentral();
    }

    public Response login(String username, String password) {
        return post("/api/auth/auth/login", null, Map.of("username", username, "password", password));
    }

    public Response bootstrap(String token) {
        return send(request("/api/catalog/catalog/bootstrap", token).GET().build());
    }

    public Response syncTransactions(String token, Object body) {
        return post("/api/sales/sales/sync/transactions", token, body);
    }

    public Response syncScans(String token, Object body) {
        return post("/api/sales/sales/sync/scans", token, body);
    }

    public Response heartbeat(String token, Object body) {
        return post("/api/sales/sales/sync/heartbeat", token, body);
    }

    private Response post(String path, String token, Object body) {
        return send(request(path, token)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body))).build());
    }

    private HttpRequest.Builder request(String path, String token) {
        if (!configured()) throw new Unreachable("no central configured");
        String base = props.centralUrl().replaceAll("/+$", "");
        HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(base + path)).timeout(Duration.ofSeconds(15));
        return token == null ? b : b.header("Authorization", "Bearer " + token);
    }

    private Response send(HttpRequest req) {
        try {
            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() >= 500) throw new Unreachable("central answered " + res.statusCode());
            JsonNode body = res.body() == null || res.body().isBlank() ? null : tryParse(res.body());
            return new Response(res.statusCode(), body);
        } catch (IOException e) {
            throw new Unreachable(e.getMessage());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new Unreachable("interrupted");
        }
    }

    private JsonNode tryParse(String body) {
        try {
            return json.readTree(body);
        } catch (RuntimeException e) {
            return null;
        }
    }

    public record Response(int status, JsonNode body) {
        public boolean ok() {
            return status >= 200 && status < 300;
        }
    }

    /** Central could not be reached (no network, DNS, TLS, timeout or a 5xx). */
    public static class Unreachable extends RuntimeException {
        public Unreachable(String message) {
            super(message);
        }
    }
}
