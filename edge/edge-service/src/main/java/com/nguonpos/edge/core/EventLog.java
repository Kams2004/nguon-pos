package com.nguonpos.edge.core;

import com.nguonpos.synccore.resolve.Hlc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;

/**
 * The till's append-only journal of sales and scans. A record is written in
 * the same transaction as the sale or scan it describes, numbered with this
 * device's next sequence number, timestamped with the hybrid clock and
 * signed. Pending records are those central hasn't acknowledged yet.
 */
@Component
public class EventLog {

    public static final String SALE = "SALE";
    public static final String SCAN = "SCAN";

    private final JdbcTemplate jdbc;
    private final Meta meta;
    private final DeviceIdentity device;
    private final Hlc hlc = new Hlc();

    public EventLog(JdbcTemplate jdbc, Meta meta, DeviceIdentity device) {
        this.jdbc = jdbc;
        this.meta = meta;
        this.device = device;
        meta.get("last_hlc").ifPresent(hlc::observe);
    }

    /** Appends a record; must run inside the caller's transaction. */
    public Record append(String type, String actorUserId, String payloadJson) {
        String origin = device.deviceId().toString();
        long seq = meta.increment("origin_seq");
        String ts = hlc.next();
        meta.put("last_hlc", ts);
        String sig = device.sign(signedBytes(origin, seq, type, ts, actorUserId, payloadJson));
        jdbc.update("""
                INSERT INTO event_log (origin, seq, type, hlc, actor_user_id, payload, sig, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)""", origin, seq, type, ts, actorUserId, payloadJson, sig, Instant.now().toString());
        return new Record(origin, seq, type, ts, actorUserId, payloadJson);
    }

    public List<Record> pending(String type, int limit) {
        return jdbc.query("""
                SELECT origin, seq, type, hlc, actor_user_id, payload FROM event_log
                WHERE uplink_status = 'PENDING' AND type = ? ORDER BY origin, seq LIMIT ?""",
                (rs, i) -> new Record(rs.getString(1), rs.getLong(2), rs.getString(3), rs.getString(4), rs.getString(5), rs.getString(6)),
                type, limit);
    }

    public int pendingCount(String type) {
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM event_log WHERE uplink_status = 'PENDING' AND type = ?", Integer.class, type);
        return n == null ? 0 : n;
    }

    public void markAcked(Record r, String result) {
        jdbc.update("UPDATE event_log SET uplink_status = 'ACKED', uplink_result = ? WHERE origin = ? AND seq = ?", result, r.origin(), r.seq());
    }

    public void markRejected(Record r, String reason) {
        jdbc.update("UPDATE event_log SET uplink_status = 'REJECTED', uplink_result = ? WHERE origin = ? AND seq = ?", reason, r.origin(), r.seq());
    }

    /** Canonical bytes a record's signature covers (fields joined by U+001F). */
    public static byte[] signedBytes(String origin, long seq, String type, String hlc, String actor, String payload) {
        return String.join("\u001f", origin, Long.toString(seq), type, hlc, actor, payload).getBytes(StandardCharsets.UTF_8);
    }

    public record Record(String origin, long seq, String type, String hlc, String actorUserId, String payload) {
    }
}
