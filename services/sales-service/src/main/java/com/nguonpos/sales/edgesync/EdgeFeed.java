package com.nguonpos.sales.edgesync;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

import java.util.List;
import java.util.UUID;

/**
 * What a gate's desktop tills must hear about: the other tills' sales and
 * scans, and voids. Appended in the transaction of the change itself
 * (a transactional outbox); pg_notify wakes the live channel at commit.
 */
@Component
public class EdgeFeed {

    public static final String SALE = "SALE";
    public static final String SCAN = "SCAN";
    public static final String SALE_VOIDED = "SALE_VOIDED";
    static final int PAGE = 200;

    private final JdbcTemplate jdbc;
    private final JsonMapper json;

    public EdgeFeed(JdbcTemplate jdbc, JsonMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    /** Call inside the transaction that made the change. */
    public void append(UUID establishmentId, UUID gateId, String type, UUID originDeviceId, Object payload) {
        jdbc.update("INSERT INTO sales.edge_feed (establishment_id, gate_id, type, origin_device_id, payload) VALUES (?, ?, ?, ?, ?)",
                establishmentId, gateId, type, originDeviceId, json.writeValueAsString(payload));
        jdbc.query("SELECT pg_notify('nguon_edge', ?)", rs -> {
        }, gateId.toString());
    }

    /** Next page for a till: its gate's entries after `cursor`, minus its own records. */
    public List<Entry> page(UUID gateId, long cursor, UUID deviceId) {
        return jdbc.query("""
                SELECT id, type, payload FROM sales.edge_feed
                WHERE gate_id = ? AND id > ? AND (origin_device_id IS NULL OR origin_device_id <> ?)
                ORDER BY id LIMIT ?""", (rs, i) -> new Entry(rs.getLong(1), rs.getString(2), rs.getString(3)), gateId, cursor, deviceId, PAGE);
    }

    /** Where a till starting from scratch would end up (so a new till doesn't replay months of history it can't use). */
    public long head(UUID gateId) {
        Long id = jdbc.queryForObject("SELECT COALESCE(MAX(id), 0) FROM sales.edge_feed WHERE gate_id = ?", Long.class, gateId);
        return id == null ? 0 : id;
    }

    public record Entry(long cursor, String type, String payload) {
    }
}
