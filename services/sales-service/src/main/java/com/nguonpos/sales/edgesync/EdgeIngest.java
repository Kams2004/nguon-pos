package com.nguonpos.sales.edgesync;

import com.nguonpos.sales.device.DeviceRegistry;
import com.nguonpos.sales.device.DeviceRegistry.Device;
import com.nguonpos.sales.live.EventHub;
import com.nguonpos.sales.sync.SaleSyncRequest;
import com.nguonpos.sales.sync.SaleSyncResponse;
import com.nguonpos.sales.sync.ScanSyncRequest;
import com.nguonpos.sales.sync.ScanSyncResponse;
import com.nguonpos.sales.sync.SyncEntryProcessor;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.PublicKey;
import java.security.Signature;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Takes in the records a till pushes (its own, or relayed for another till
 * of its gate). Each is checked before anything is applied:
 *   - signed by its origin device's key (registered at enrollment),
 *   - the origin belongs to the pushing till's gate,
 *   - it is the next one in that origin's sequence (older: duplicate; a
 *     jump: refused until the gap is filled).
 * Sales and scans then go through the same processing as the browser tills'.
 */
@Component
public class EdgeIngest {

    private final SyncEntryProcessor processor;
    private final DeviceRegistry registry;
    private final EdgeSessions sessions;
    private final EventHub hub;
    private final JdbcTemplate jdbc;
    private final JsonMapper json;

    public EdgeIngest(SyncEntryProcessor processor, DeviceRegistry registry, EdgeSessions sessions, EventHub hub, JdbcTemplate jdbc,
                      JsonMapper json) {
        this.processor = processor;
        this.registry = registry;
        this.sessions = sessions;
        this.hub = hub;
        this.jdbc = jdbc;
        this.json = json;
    }

    public List<Map<String, Object>> ingest(Device pusher, JsonNode records) {
        List<Map<String, Object>> results = new ArrayList<>();
        Map<UUID, Optional<Device>> origins = new HashMap<>();
        boolean sales = false;
        boolean scans = false;
        for (JsonNode r : records) {
            UUID origin = UUID.fromString(r.get("origin").asString());
            long seq = r.get("seq").asLong();
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("origin", origin.toString());
            result.put("seq", seq);
            results.add(result);

            Optional<Device> originDevice = origins.computeIfAbsent(origin, id -> id.equals(pusher.id()) ? Optional.of(pusher) : registry.byId(id));
            if (originDevice.isEmpty() || !originDevice.get().gateId().equals(pusher.gateId())) {
                result.put("status", "REJECTED");
                result.put("reason", "FOREIGN_ORIGIN");
                continue;
            }
            if (!signatureValid(originDevice.get(), r)) {
                result.put("status", "REJECTED");
                result.put("reason", "BAD_SIGNATURE");
                continue;
            }
            long watermark = watermark(origin);
            if (seq <= watermark) {
                result.put("status", "DUPLICATE");
                continue;
            }
            if (seq > watermark + 1) {
                result.put("status", "GAP");
                result.put("expected", watermark + 1);
                continue;
            }

            UUID actor = UUID.fromString(r.get("actorUserId").asString());
            Claims claims = actorClaims(pusher, actor);
            String type = r.get("type").asString();
            if (type.equals("SALE")) {
                SaleSyncRequest.SaleEntry entry = json.readValue(r.get("payload").asString(), SaleSyncRequest.SaleEntry.class);
                SaleSyncResponse.EntryResult res = processor.processSaleEntry(entry, origin, pusher.gateId(), pusher.establishmentId(), actor, claims);
                result.put("status", res.status() == SaleSyncResponse.Status.REJECTED ? "REJECTED" : "ACCEPTED");
                if (res.referenceNumber() != null) result.put("referenceNumber", res.referenceNumber());
                if (res.reason() != null) result.put("reason", res.reason());
                sales |= res.status() == SaleSyncResponse.Status.ACCEPTED;
            } else if (type.equals("SCAN")) {
                ScanSyncRequest.ScanEntry entry = json.readValue(r.get("payload").asString(), ScanSyncRequest.ScanEntry.class);
                ScanSyncResponse.EntryResult res = processor.processScanEntry(entry, r.path("hlc").asString(null), origin, pusher.gateId(),
                        pusher.establishmentId(), actor, claims);
                result.put("status", "ACCEPTED");
                result.put("scanResult", res.scanResult().name());
                scans = true;
            } else {
                result.put("status", "REJECTED");
                result.put("reason", "UNKNOWN_TYPE");
            }
            // Handled — even if refused, it will not be resent.
            jdbc.update("""
                    INSERT INTO sales.edge_origin_watermark (origin_device_id, last_seq) VALUES (?, ?)
                    ON CONFLICT (origin_device_id) DO UPDATE SET last_seq = excluded.last_seq""", origin, seq);
        }
        if (sales) hub.publish("SALES_CHANGED", Map.of("terminalId", pusher.id()), true);
        if (sales || scans) hub.publish("SCANS_CHANGED", Map.of("terminalId", pusher.id()), true);
        return results;
    }

    public long watermark(UUID origin) {
        List<Long> v = jdbc.queryForList("SELECT last_seq FROM sales.edge_origin_watermark WHERE origin_device_id = ?", Long.class, origin);
        return v.isEmpty() ? 0 : v.getFirst();
    }

    /** The cashier, as the journal and presence should name them. */
    public Claims actorClaims(Device till, UUID userId) {
        String name = Optional.ofNullable(sessions.userName(till.gateId(), userId.toString())).orElse(till.label());
        return Jwts.claims()
                .subject(name)
                .add("userId", userId.toString())
                .add("fullName", name)
                .add("establishmentId", till.establishmentId().toString())
                .add("assignedGateId", till.gateId().toString())
                .build();
    }

    private boolean signatureValid(Device origin, JsonNode r) {
        try {
            PublicKey key = registry.publicKey(origin.id()).orElseThrow();
            String signed = String.join("\u001f", r.get("origin").asString(), Long.toString(r.get("seq").asLong()), r.get("type").asString(),
                    r.get("hlc").asString(), r.get("actorUserId").asString(), r.get("payload").asString());
            Signature s = Signature.getInstance("SHA256withECDSA");
            s.initVerify(key);
            s.update(signed.getBytes(StandardCharsets.UTF_8));
            return s.verify(Base64.getDecoder().decode(r.get("sig").asString()));
        } catch (GeneralSecurityException | RuntimeException e) {
            return false;
        }
    }
}
