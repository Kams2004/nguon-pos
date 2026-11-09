package com.nguonpos.sales.edgesync;

import com.nguonpos.sales.device.DeviceRegistry.Device;
import com.nguonpos.sales.sync.HeartbeatRequest;
import com.nguonpos.sales.sync.PresenceService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/**
 * One desktop till's live channel (protocol v1, JSON frames with a "t" type).
 *
 *   till → central   HELLO {p, appVersion, feedCursor, catalogVersion, usersVersion}
 *                    PUSH {batchId, records[]}   FEED_ACK {cursor}   STATUS {pending, userId}
 *   central → till   WELCOME {p, serverTime, deviceNo, watermark}
 *                    CATALOG {version, bootstrap}   USERS {version, users}
 *                    ACK {batchId, results[]}   FEED {events[]}
 *
 * The till opens it (works behind any NAT) and reconnects by itself; after
 * a cut it resumes from WELCOME.watermark and its own feed cursor.
 */
@Component
public class EdgeSyncHandler extends TextWebSocketHandler {

    public static final int PROTOCOL = 1;
    static final String DEVICE = "edge.device";
    private static final Logger log = LoggerFactory.getLogger(EdgeSyncHandler.class);

    private final EdgeSessions sessions;
    private final EdgeIngest ingest;
    private final PresenceService presence;
    private final JsonMapper json;

    public EdgeSyncHandler(EdgeSessions sessions, EdgeIngest ingest, PresenceService presence, JsonMapper json) {
        this.sessions = sessions;
        this.ingest = ingest;
        this.presence = presence;
        this.json = json;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession ws) {
        sessions.register(ws, device(ws));
    }

    @Override
    protected void handleTextMessage(WebSocketSession ws, TextMessage message) {
        Device device = device(ws);
        EdgeSessions.Live live = liveOf(ws, device);
        JsonNode frame = json.readTree(message.getPayload());
        switch (frame.path("t").asString("")) {
            case "HELLO" -> {
                int p = frame.path("p").asInt(0);
                if (p != PROTOCOL) {
                    sessions.send(live, Map.of("t", "UPGRADE_REQUIRED", "p", PROTOCOL));
                    return;
                }
                sessions.send(live, Map.of("t", "WELCOME", "p", PROTOCOL, "serverTime", Instant.now().toString(),
                        "deviceNo", device.deviceNo(), "watermark", ingest.watermark(device.id())));
                sessions.start(live, frame.path("catalogVersion").asString(null), frame.path("usersVersion").asString(null),
                        frame.path("feedCursor").asLong(-1));
            }
            case "PUSH" -> sessions.send(live, Map.of("t", "ACK", "batchId", frame.path("batchId").asString(""),
                    "results", ingest.ingest(device, frame.path("records"))));
            case "FEED_ACK" -> sessions.feedAcked(live, frame.path("cursor").asLong());
            case "STATUS" -> {
                String user = frame.path("userId").asString(null);
                presence.heartbeat(new HeartbeatRequest(device.id(), device.gateId(), frame.path("pending").asInt(0), device.label()),
                        ingest.actorClaims(device, user != null ? UUID.fromString(user) : new UUID(0, 0)));
            }
            default -> log.debug("Ignored frame from till {}: {}", device.id(), frame.path("t"));
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession ws, CloseStatus status) {
        sessions.unregister(ws, device(ws));
    }

    private EdgeSessions.Live liveOf(WebSocketSession ws, Device device) {
        return sessions.live(device.id(), ws);
    }

    private static Device device(WebSocketSession ws) {
        return (Device) ws.getAttributes().get(DEVICE);
    }
}
