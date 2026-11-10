package com.nguonpos.edge.peer;

import com.nguonpos.edge.core.DeviceIdentity;
import com.nguonpos.edge.core.EventLog;
import com.nguonpos.edge.till.TillService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.security.Signature;
import java.security.cert.X509Certificate;
import java.time.Instant;
import java.util.Base64;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The replication log as seen by peers: what each origin's records this till
 * holds (summary), pages of them (with the certificates that prove who
 * signed), and the intake of records fetched from a peer — each one checked
 * against its origin till's certificate and signature, in sequence, then
 * stored and applied in one transaction. Records of other tills are kept as
 * "to send" so whichever till reaches central first delivers them.
 */
@Component
public class PeerRecords {

    private static final Logger log = LoggerFactory.getLogger(PeerRecords.class);
    static final int MAX_PAGE = 500;

    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final DeviceIdentity device;
    private final PeerCredentials credentials;
    private final PeerStore store;
    private final TillService till;
    private final JsonMapper json;

    public PeerRecords(JdbcTemplate jdbc, TransactionTemplate tx, DeviceIdentity device, PeerCredentials credentials, PeerStore store,
                       TillService till, JsonMapper json) {
        this.jdbc = jdbc;
        this.tx = tx;
        this.device = device;
        this.credentials = credentials;
        this.store = store;
        this.till = till;
        this.json = json;
    }

    /** origin → highest sequence held here. */
    public Map<String, Long> summary() {
        Map<String, Long> m = new LinkedHashMap<>();
        jdbc.query("SELECT origin, MAX(seq) FROM event_log GROUP BY origin ORDER BY origin", rs -> {
            m.put(rs.getString(1), rs.getLong(2));
        });
        return m;
    }

    public long maxSeq(String origin) {
        Long v = jdbc.queryForObject("SELECT MAX(seq) FROM event_log WHERE origin = ?", Long.class, origin);
        return v == null ? 0 : v;
    }

    /** Records of `origin` after `after`, with the certificate of their signer. */
    public Map<String, Object> page(String origin, long after, int limit) {
        int n = Math.max(1, Math.min(limit, MAX_PAGE));
        List<Map<String, Object>> records = jdbc.query("""
                SELECT origin, seq, type, hlc, actor_user_id, payload, sig, uplink_status FROM event_log
                WHERE origin = ? AND seq > ? ORDER BY seq LIMIT ?""", (rs, i) -> {
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("origin", rs.getString(1));
            r.put("seq", rs.getLong(2));
            r.put("type", rs.getString(3));
            r.put("hlc", rs.getString(4));
            r.put("actorUserId", rs.getString(5));
            r.put("payload", rs.getString(6));
            r.put("sig", rs.getString(7));
            r.put("centralHas", "ACKED".equals(rs.getString(8)));
            return r;
        }, origin, after, n);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("records", records);
        String self = device.deviceId().toString();
        (origin.equals(self) ? java.util.Optional.of(credentials.certificatePem()) : store.certificate(origin))
                .ifPresent(pem -> out.put("cert", pem));
        return out;
    }

    /**
     * Records fetched from a peer, all of one origin and in order. Stops at the
     * first one that is not the next in sequence or fails a check.
     *
     * @return how many were new and stored
     */
    public int ingest(String origin, JsonNode page) {
        String self = device.deviceId().toString();
        if (origin.equals(self)) return 0;
        if (store.revoked(origin)) return 0;
        String pem = page.path("cert").asString(null);
        if (pem == null) pem = store.certificate(origin).orElse(null);
        if (pem == null) return 0;
        X509Certificate cert;
        try {
            cert = PeerCredentials.parse(pem);
        } catch (RuntimeException e) {
            return 0;
        }
        var who = credentials.verify(cert);
        if (who.isEmpty() || !who.get().deviceId().equals(origin)) {
            log.warn("Refused records of {}: its certificate is not a valid one for this gate", origin);
            return 0;
        }
        if (store.certificate(origin).isEmpty()) store.setCertificate(origin, pem);

        int stored = 0;
        long expected = maxSeq(origin) + 1;
        for (JsonNode r : page.path("records")) {
            long seq = r.path("seq").asLong(-1);
            if (seq < expected) continue; // already here
            if (seq != expected || !origin.equals(r.path("origin").asString(""))) break;
            String type = r.path("type").asString(""), hlc = r.path("hlc").asString(""), actor = r.path("actorUserId").asString("");
            String payload = r.path("payload").asString(""), sig = r.path("sig").asString("");
            if (!signatureValid(cert, origin, seq, type, hlc, actor, payload, sig)) {
                log.warn("Refused record {}#{}: bad signature", origin, seq);
                break;
            }
            boolean centralHas = r.path("centralHas").asBoolean(false);
            tx.executeWithoutResult(s -> {
                int inserted = jdbc.update("""
                        INSERT INTO event_log (origin, seq, type, hlc, actor_user_id, payload, sig, created_at, uplink_status)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (origin, seq) DO NOTHING""",
                        origin, seq, type, hlc, actor, payload, sig, Instant.now().toString(), centralHas ? "ACKED" : "PENDING");
                if (inserted == 1) apply(origin, type, hlc, actor, payload); // the same record via two peers: applied once
            });
            stored++;
            expected++;
        }
        return stored;
    }

    private void apply(String origin, String type, String hlc, String actor, String payload) {
        JsonNode p = json.readTree(payload);
        switch (type) {
            case EventLog.SALE -> till.applyPeerSale(actor, p);
            case EventLog.SCAN -> till.applyPeerScan(origin, hlc, actor, p);
            default -> {
                // newer record types: kept and forwarded, applied once this version knows them
            }
        }
    }

    static boolean signatureValid(X509Certificate cert, String origin, long seq, String type, String hlc, String actor, String payload, String sig) {
        try {
            Signature s = Signature.getInstance("SHA256withECDSA");
            s.initVerify(cert.getPublicKey());
            s.update(EventLog.signedBytes(origin, seq, type, hlc, actor, payload));
            return s.verify(Base64.getDecoder().decode(sig));
        } catch (Exception e) {
            return false;
        }
    }

    /** For status: how many records of other tills this till holds. */
    public Map<String, Long> foreignCounts() {
        Map<String, Long> m = new HashMap<>();
        jdbc.query("SELECT origin, COUNT(*) FROM event_log WHERE origin <> ? GROUP BY origin", rs -> {
            m.put(rs.getString(1), rs.getLong(2));
        }, device.deviceId().toString());
        return m;
    }
}
