package com.nguonpos.sales.edgesync;

import com.nguonpos.sales.device.DeviceRegistry.Device;
import com.nguonpos.sales.release.Releases;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

/**
 * The desktop tills connected right now, and what is pushed to them: the
 * gate's catalog, its accounts, and its feed (sent one page at a time, the
 * next page only once the till confirmed the previous one).
 */
@Component
public class EdgeSessions {

    /** WebSocket close code telling a till it was revoked. */
    public static final CloseStatus REVOKED = new CloseStatus(4403, "DEVICE_REVOKED");

    private static final Logger log = LoggerFactory.getLogger(EdgeSessions.class);

    private final Map<UUID, Live> byDevice = new ConcurrentHashMap<>();
    /** userId → full name, per gate, from the last accounts snapshot (journal entries name the cashier). */
    private final Map<UUID, Map<String, String>> names = new ConcurrentHashMap<>();
    private final EdgeFeed feed;
    private final InternalClients internal;
    private final JsonMapper json;
    private final Releases releases;

    public EdgeSessions(EdgeFeed feed, InternalClients internal, JsonMapper json, Releases releases) {
        this.releases = releases;
        this.feed = feed;
        this.internal = internal;
        this.json = json;
    }

    public Live register(WebSocketSession ws, Device device) {
        Live previous = byDevice.remove(device.id());
        if (previous != null) close(previous, CloseStatus.POLICY_VIOLATION.withReason("REPLACED"));
        Live live = new Live(new ConcurrentWebSocketSessionDecorator(ws, 10_000, 4 * 1024 * 1024), device, new AtomicLong(), new AtomicBoolean());
        byDevice.put(device.id(), live);
        return live;
    }

    /** The registered session for this socket (re-registered if it was replaced meanwhile). */
    public Live live(UUID deviceId, WebSocketSession ws) {
        Live l = byDevice.get(deviceId);
        return l != null && l.ws().getId().equals(ws.getId()) ? l : register(ws, l != null ? l.device() : (Device) ws.getAttributes().get("edge.device"));
    }

    public void unregister(WebSocketSession ws, Device device) {
        byDevice.computeIfPresent(device.id(), (id, l) -> l.ws().getId().equals(ws.getId()) ? null : l);
    }

    public boolean connected(UUID deviceId) {
        return byDevice.containsKey(deviceId);
    }

    public void disconnect(UUID deviceId) {
        Live l = byDevice.remove(deviceId);
        if (l != null) close(l, REVOKED);
    }

    /** After HELLO: snapshots the till lacks, then its feed from where it stopped. */
    public void start(Live live, String catalogVersion, String usersVersion, long cursor) {
        live.cursor().set(cursor < 0 ? feed.head(live.device().gateId()) : cursor);
        sendCatalog(live, internal.gateConfig(live.device().establishmentId(), live.device().gateId()), catalogVersion);
        sendUsers(live, internal.gateUsers(live.device().establishmentId(), live.device().gateId()), usersVersion);
        sendRelease(live);
        pump(live);
    }

    public void feedAcked(Live live, long cursor) {
        live.cursor().accumulateAndGet(cursor, Math::max);
        live.feedInFlight().set(false);
        pump(live);
    }

    /** A change for this gate was committed. */
    public void wakeGate(UUID gateId) {
        byDevice.values().stream().filter(l -> l.device().gateId().equals(gateId)).forEach(this::pump);
    }

    public void catalogChanged() {
        forEachGate((gate, lives) -> {
            JsonNode config = internal.gateConfig(lives.getFirst().device().establishmentId(), gate);
            lives.forEach(l -> sendCatalog(l, config, null));
        });
    }

    public void usersChanged() {
        forEachGate((gate, lives) -> {
            JsonNode users = internal.gateUsers(lives.getFirst().device().establishmentId(), gate);
            lives.forEach(l -> sendUsers(l, users, null));
        });
    }

    /** The version the establishment deploys changed (or was frozen): tell its connected tills. */
    public void releaseChanged(UUID establishmentId) {
        byDevice.values().stream().filter(l -> l.device().establishmentId().equals(establishmentId)).forEach(this::sendRelease);
    }

    private void sendRelease(Live live) {
        var target = releases.targetRelease(live.device().establishmentId());
        send(live, target.<Object>map(r -> Map.of("t", "RELEASE", "release", r)).orElse(Map.of("t", "RELEASE", "frozen", true)));
    }

    public String userName(UUID gateId, String userId) {
        return names.getOrDefault(gateId, Map.of()).get(userId);
    }

    private void pump(Live live) {
        if (!live.feedInFlight().compareAndSet(false, true)) return;
        List<EdgeFeed.Entry> page = feed.page(live.device().gateId(), live.cursor().get(), live.device().id());
        if (page.isEmpty()) {
            live.feedInFlight().set(false);
            return;
        }
        send(live, Map.of("t", "FEED", "events", page.stream().map(e -> Map.of("cursor", e.cursor(), "type", e.type(),
                "payload", json.readTree(e.payload()))).toList()));
    }

    private void sendCatalog(Live live, JsonNode config, String knownVersion) {
        String version = version(config);
        if (version.equals(knownVersion)) return;
        send(live, Map.of("t", "CATALOG", "version", version, "bootstrap", config));
    }

    private void sendUsers(Live live, JsonNode users, String knownVersion) {
        Map<String, String> byId = new HashMap<>();
        for (JsonNode u : users) byId.put(u.get("id").asString(), u.get("fullName").asString());
        names.put(live.device().gateId(), byId);
        String version = version(users);
        if (version.equals(knownVersion)) return;
        send(live, Map.of("t", "USERS", "version", version, "users", users));
    }

    public void send(Live live, Object frame) {
        try {
            live.ws().sendMessage(new TextMessage(json.writeValueAsString(frame)));
        } catch (IOException | IllegalStateException e) {
            log.debug("Till {} unreachable: {}", live.device().id(), e.getMessage());
            close(live, CloseStatus.SERVER_ERROR);
        }
    }

    private void forEachGate(java.util.function.BiConsumer<UUID, List<Live>> action) {
        Map<UUID, List<Live>> byGate = new HashMap<>();
        byDevice.values().forEach(l -> byGate.computeIfAbsent(l.device().gateId(), g -> new java.util.ArrayList<>()).add(l));
        byGate.forEach((gate, lives) -> {
            try {
                action.accept(gate, lives);
            } catch (RuntimeException e) {
                log.warn("Could not refresh the tills of gate {}: {}", gate, e.getMessage());
            }
        });
    }

    private void close(Live l, CloseStatus status) {
        try {
            l.ws().close(status);
        } catch (IOException ignored) {
            // already gone
        }
    }

    static String version(JsonNode node) {
        try {
            byte[] h = MessageDigest.getInstance("SHA-256").digest(node.toString().getBytes(StandardCharsets.UTF_8));
            return java.util.HexFormat.of().formatHex(h, 0, 12);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    public record Live(WebSocketSession ws, Device device, AtomicLong cursor, AtomicBoolean feedInFlight) {
    }
}
