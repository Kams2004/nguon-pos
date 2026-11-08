package com.nguonpos.edge.core;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

/**
 * This till's gate and what it sells, as last received from central. The
 * gate's QR signing secret is split off into signing_key and never leaves
 * the edge; the screen gets the rest.
 */
@Component
public class Catalog {

    private final JdbcTemplate jdbc;
    private final JsonMapper json;

    public Catalog(JdbcTemplate jdbc, JsonMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    /** Stores central's bootstrap response (catalog-service BootstrapResponse). */
    public void store(JsonNode bootstrap) {
        ObjectNode copy = (ObjectNode) bootstrap.deepCopy();
        ObjectNode gate = (ObjectNode) copy.get("gate");
        String secret = gate.get("signingSecret").asString();
        gate.remove("signingSecret");
        String gateId = gate.get("id").asString();
        jdbc.update("""
                INSERT INTO gate_config (id, gate_id, gate_code, json, updated_at) VALUES (1, ?, ?, ?, ?)
                ON CONFLICT (id) DO UPDATE SET gate_id = excluded.gate_id, gate_code = excluded.gate_code,
                    json = excluded.json, updated_at = excluded.updated_at""",
                gateId, gate.get("code").asString(), json.writeValueAsString(copy), Instant.now().toString());
        // One key per gate for now; QR v2 will carry a key id for rotation.
        jdbc.update("""
                INSERT INTO signing_key (kid, secret_hex, active) VALUES ('gate', ?, 1)
                ON CONFLICT (kid) DO UPDATE SET secret_hex = excluded.secret_hex, active = 1""", secret);
    }

    public Optional<JsonNode> bootstrap() {
        List<String> rows = jdbc.queryForList("SELECT json FROM gate_config WHERE id = 1", String.class);
        return rows.stream().findFirst().map(json::readTree);
    }

    public Optional<GateInfo> gate() {
        return bootstrap().map(b -> new GateInfo(b.get("gate").get("id").asString(), b.get("gate").get("name").asString(),
                b.get("gate").get("code").asString()));
    }

    public Optional<String> signingSecret() {
        return jdbc.queryForList("SELECT secret_hex FROM signing_key WHERE active = 1", String.class).stream().findFirst();
    }

    public Optional<TicketType> ticketType(String id) {
        return bootstrap().flatMap(b -> {
            for (JsonNode t : b.get("ticketTypes")) {
                if (t.get("id").asString().equals(id)) {
                    return Optional.of(new TicketType(id, t.get("name").asString(), t.get("price").decimalValue(),
                            t.get("currency").asString()));
                }
            }
            return Optional.empty();
        });
    }

    public record GateInfo(String id, String name, String code) {
    }

    public record TicketType(String id, String name, java.math.BigDecimal price, String currency) {
    }
}
