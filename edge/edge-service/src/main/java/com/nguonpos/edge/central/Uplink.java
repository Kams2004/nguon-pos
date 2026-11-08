package com.nguonpos.edge.central;

import com.nguonpos.edge.core.Catalog;
import com.nguonpos.edge.core.DeviceIdentity;
import com.nguonpos.edge.core.EventLog;
import com.nguonpos.edge.core.EventLog.Record;
import com.nguonpos.edge.core.LiveEvents;
import com.nguonpos.edge.core.LocalAuth;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

/**
 * Forwards this till's pending records to central whenever it can be
 * reached, through the same sync endpoints the browser till uses (central
 * deduplicates on the sale's key and the scan's id, so resending is safe).
 *
 * Central attributes a sale to the user of the token it arrives with, so
 * each record goes with its own cashier's token; a record whose cashier has
 * no valid token waits until that cashier logs in again online. The device
 * certificate channel of milestone 2 removes that wait.
 */
@Component
public class Uplink {

    private static final Logger logger = LoggerFactory.getLogger(Uplink.class);
    static final int BATCH = 25;

    private final CentralClient central;
    private final EventLog log;
    private final LocalAuth auth;
    private final Catalog catalog;
    private final DeviceIdentity device;
    private final LiveEvents live;
    private final JdbcTemplate jdbc;
    private final JsonMapper json;

    private volatile boolean reachable;
    private volatile String lastSyncAt;
    private volatile String activeUserId;

    public Uplink(CentralClient central, EventLog log, LocalAuth auth, Catalog catalog, DeviceIdentity device, LiveEvents live,
                  JdbcTemplate jdbc, JsonMapper json) {
        this.central = central;
        this.log = log;
        this.auth = auth;
        this.catalog = catalog;
        this.device = device;
        this.live = live;
        this.jdbc = jdbc;
        this.json = json;
    }

    /** The cashier currently logged in at the till — used for the presence signal. */
    public void setActiveUser(String userId) {
        this.activeUserId = userId;
    }

    @Scheduled(fixedDelayString = "${edge.sync-interval-ms:5000}", initialDelay = 2_000)
    public synchronized void run() {
        if (!central.configured()) return;
        Optional<Catalog.GateInfo> gate = catalog.gate();
        if (gate.isEmpty()) return;
        boolean wasReachable = reachable;
        try {
            push(EventLog.SALE, gate.get().id());
            push(EventLog.SCAN, gate.get().id());
            heartbeat(gate.get());
            reachable = true;
            lastSyncAt = Instant.now().toString();
        } catch (CentralClient.Unreachable e) {
            reachable = false;
            logger.debug("Central unreachable: {}", e.getMessage());
        }
        if (wasReachable != reachable || pendingCount() == 0) publishStatus();
    }

    private void push(String type, String gateId) {
        List<Record> pending = log.pending(type, 500);
        if (pending.isEmpty()) return;
        Map<String, List<Record>> byActor = pending.stream().collect(Collectors.groupingBy(Record::actorUserId, LinkedHashMap::new, Collectors.toList()));
        boolean progressed = false;
        for (var e : byActor.entrySet()) {
            Optional<String> token = auth.centralToken(e.getKey());
            if (token.isEmpty()) continue;
            List<Record> records = e.getValue();
            for (int i = 0; i < records.size(); i += BATCH) {
                List<Record> batch = records.subList(i, Math.min(i + BATCH, records.size()));
                if (!send(type, gateId, token.get(), e.getKey(), batch)) break;
                progressed = true;
            }
        }
        if (progressed) publishStatus();
    }

    /** @return false when the token was refused (dropped; the cashier must log in online again) */
    private boolean send(String type, String gateId, String token, String userId, List<Record> batch) {
        List<JsonNode> entries = new ArrayList<>();
        for (Record r : batch) {
            ObjectNode entry = (ObjectNode) json.readTree(r.payload());
            entry.remove("localDecision"); // not part of central's v1 scan contract
            entries.add(entry);
        }
        Map<String, Object> body = Map.of("terminalId", device.deviceId().toString(), "gateId", gateId, "entries", entries);
        CentralClient.Response res = type.equals(EventLog.SALE) ? central.syncTransactions(token, body) : central.syncScans(token, body);
        if (res.status() == 401 || res.status() == 403) {
            auth.dropCentralToken(userId);
            return false;
        }
        if (!res.ok() || res.body() == null) throw new CentralClient.Unreachable("sync answered " + res.status());
        JsonNode results = res.body().get("results");
        for (int i = 0; i < batch.size() && i < results.size(); i++) {
            Record r = batch.get(i);
            JsonNode result = results.get(i);
            if (type.equals(EventLog.SALE)) {
                String status = result.get("status").asString();
                if (status.equals("REJECTED")) {
                    log.markRejected(r, result.path("reason").asString(""));
                } else {
                    String ref = result.path("referenceNumber").asString(null);
                    log.markAcked(r, ref);
                    jdbc.update("UPDATE sale SET central_reference = ? WHERE id = ?", ref, result.get("idempotencyKey").asString());
                }
            } else {
                log.markAcked(r, result.path("scanResult").asString(null));
            }
        }
        return true;
    }

    private void heartbeat(Catalog.GateInfo gate) {
        String user = activeUserId;
        Optional<String> token = user == null ? Optional.empty() : auth.centralToken(user);
        if (token.isEmpty()) return;
        central.heartbeat(token.get(), Map.of("terminalId", device.deviceId().toString(), "gateId", gate.id(),
                "localPendingCount", pendingCount(), "deviceLabel", gate.name() + " · caisse " + device.shortCode()));
    }

    public int pendingCount() {
        return log.pendingCount(EventLog.SALE) + log.pendingCount(EventLog.SCAN);
    }

    public boolean reachable() {
        return reachable;
    }

    public String lastSyncAt() {
        return lastSyncAt;
    }

    private void publishStatus() {
        live.publish("SYNC_STATUS", Map.of("centralReachable", reachable, "pending", pendingCount(),
                "lastSyncAt", lastSyncAt == null ? "" : lastSyncAt));
    }
}
