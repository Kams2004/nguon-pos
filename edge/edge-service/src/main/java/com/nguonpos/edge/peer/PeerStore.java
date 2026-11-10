package com.nguonpos.edge.peer;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

/** The other tills of this gate, as learnt from central, LAN announcements and the configuration. */
@Component
public class PeerStore {

    /** A peer answered within this delay: shown as connected. */
    static final Duration FRESH = Duration.ofSeconds(30);

    private final JdbcTemplate jdbc;

    public PeerStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Where a peer can be reached. A source never erases a better-known label. */
    public void upsertAddress(String deviceId, String label, String address, String source) {
        if (address != null) releaseAddress(address, deviceId);
        jdbc.update("""
                INSERT INTO peer (device_id, label, address, source) VALUES (?, ?, ?, ?)
                ON CONFLICT (device_id) DO UPDATE SET address = COALESCE(excluded.address, peer.address),
                    label = COALESCE(excluded.label, peer.label), source = excluded.source""", deviceId, label, address, source);
    }

    /** An address answers as `owner` now (a till reinstalled, IPs swapped): no other peer keeps it. */
    public void releaseAddress(String address, String owner) {
        jdbc.update("UPDATE peer SET address = NULL WHERE address = ? AND device_id <> ?", address, owner);
    }

    public void setCertificate(String deviceId, String pem) {
        jdbc.update("""
                INSERT INTO peer (device_id, source, cert_pem) VALUES (?, 'RELAYED', ?)
                ON CONFLICT (device_id) DO UPDATE SET cert_pem = excluded.cert_pem""", deviceId, pem);
    }

    public Optional<String> certificate(String deviceId) {
        return jdbc.queryForList("SELECT cert_pem FROM peer WHERE device_id = ? AND cert_pem IS NOT NULL", String.class, deviceId)
                .stream().findFirst();
    }

    public void seen(String deviceId) {
        jdbc.update("UPDATE peer SET last_seen_at = ?, last_error = NULL WHERE device_id = ?", Instant.now().toString(), deviceId);
    }

    public void failed(String deviceId, String error) {
        jdbc.update("UPDATE peer SET last_error = ? WHERE device_id = ?", error == null ? "error" : error.length() > 200 ? error.substring(0, 200) : error,
                deviceId);
    }

    /** A configured address answered as `deviceId`: keep one row, under its real id. */
    public void resolvePlaceholder(String placeholderId, String deviceId, String address) {
        if (placeholderId.equals(deviceId)) return;
        jdbc.update("DELETE FROM peer WHERE device_id = ?", placeholderId);
        upsertAddress(deviceId, null, address, "CONFIG");
    }

    public boolean revoked(String deviceId) {
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM peer WHERE device_id = ? AND revoked = 1", Integer.class, deviceId);
        return n != null && n > 0;
    }

    /** Central's view of the gate: its active tills (with their LAN addresses) and the revoked ones. */
    public void replaceFromCentral(List<Info> active, Collection<String> revokedIds, String self) {
        for (Info p : active) {
            if (p.deviceId().equals(self)) continue;
            if (p.address() != null) releaseAddress(p.address(), p.deviceId());
            jdbc.update("""
                    INSERT INTO peer (device_id, label, address, source, revoked) VALUES (?, ?, ?, 'CENTRAL', 0)
                    ON CONFLICT (device_id) DO UPDATE SET label = excluded.label, revoked = 0,
                        address = COALESCE(excluded.address, peer.address)""", p.deviceId(), p.label(), p.address());
        }
        for (String id : revokedIds) {
            jdbc.update("""
                    INSERT INTO peer (device_id, source, revoked) VALUES (?, 'CENTRAL', 1)
                    ON CONFLICT (device_id) DO UPDATE SET revoked = 1""", id);
        }
    }

    /** Peers worth contacting: an address, not revoked, not this till. */
    public List<Peer> reachable(String self) {
        return jdbc.query("""
                SELECT device_id, label, address, last_seen_at, last_error FROM peer
                WHERE address IS NOT NULL AND revoked = 0 AND device_id <> ? ORDER BY device_id""",
                (rs, i) -> new Peer(rs.getString(1), rs.getString(2), rs.getString(3), rs.getString(4), rs.getString(5)), self);
    }

    public record Info(String deviceId, String label, String address) {
    }

    public record Peer(String deviceId, String label, String address, String lastSeenAt, String lastError) {
        public boolean connected() {
            return lastSeenAt != null && Instant.parse(lastSeenAt).isAfter(Instant.now().minus(FRESH));
        }

        public boolean placeholder() {
            return deviceId.startsWith("config:");
        }
    }
}
