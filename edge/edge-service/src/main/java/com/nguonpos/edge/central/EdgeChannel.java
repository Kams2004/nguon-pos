package com.nguonpos.edge.central;

import com.nguonpos.edge.EdgeProperties;
import com.nguonpos.edge.core.Catalog;
import com.nguonpos.edge.core.DeviceIdentity;
import com.nguonpos.edge.core.EventLog;
import com.nguonpos.edge.core.LiveEvents;
import com.nguonpos.edge.core.LocalAuth;
import com.nguonpos.edge.core.Meta;
import com.nguonpos.edge.till.TillService;
import com.nguonpos.edge.update.AppVersion;
import com.nguonpos.edge.update.Updater;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManagerFactory;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyStore;
import java.security.cert.Certificate;
import java.security.cert.CertificateFactory;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * The enrolled till's live channel to central: a WebSocket over mutual TLS
 * (its certificate), opened by the till so it works behind any network.
 *
 * Out: HELLO, then this till's pending records in batches of 100 (one batch
 * at a time), and STATUS every 10 s. In: WELCOME (what central already has
 * — exact resumption), CATALOG and USERS snapshots, ACKs, and the gate's
 * FEED (other tills' sales and scans, voids), confirmed page by page.
 * Everything runs on one thread, so frames are handled in order.
 */
@Component
public class EdgeChannel {

    public static final int PROTOCOL = 1;
    static final int BATCH = 100;
    private static final Logger log = LoggerFactory.getLogger(EdgeChannel.class);

    private final EdgeProperties props;
    private final Enrollment enrollment;
    private final DeviceIdentity device;
    private final EventLog eventLog;
    private final Catalog catalog;
    private final LocalAuth auth;
    private final TillService till;
    private final LiveEvents live;
    private final Meta meta;
    private final JdbcTemplate jdbc;
    private final JsonMapper json;
    private final Updater updater;
    private final ExecutorService worker = Executors.newSingleThreadExecutor(r -> new Thread(r, "edge-channel"));

    private volatile WebSocket ws;
    private volatile boolean connecting;
    private volatile Instant nextAttempt = Instant.EPOCH;
    private Duration backoff = Duration.ofSeconds(1);
    private final AtomicBoolean batchInFlight = new AtomicBoolean();
    private volatile String activeUserId;
    private volatile Instant lastStatus = Instant.EPOCH;
    private final StringBuilder partial = new StringBuilder();

    public EdgeChannel(EdgeProperties props, Enrollment enrollment, DeviceIdentity device, EventLog eventLog, Catalog catalog,
                       LocalAuth auth, TillService till, LiveEvents live, Meta meta, JdbcTemplate jdbc, JsonMapper json, Updater updater) {
        this.updater = updater;
        this.props = props;
        this.enrollment = enrollment;
        this.device = device;
        this.eventLog = eventLog;
        this.catalog = catalog;
        this.auth = auth;
        this.till = till;
        this.live = live;
        this.meta = meta;
        this.jdbc = jdbc;
        this.json = json;
    }

    public boolean connected() {
        return ws != null;
    }

    public void setActiveUser(String userId) {
        this.activeUserId = userId;
    }

    /** Connects when it should, pushes what is pending, reports status. */
    @Scheduled(fixedDelay = 1_000, initialDelay = 1_500)
    void tick() {
        if (!enrollment.enrolled() || props.channelWebSocketUrl() == null) return;
        if (ws == null) {
            if (!connecting && Instant.now().isAfter(nextAttempt)) connect();
            return;
        }
        worker.execute(this::pushPending);
        if (Instant.now().isAfter(lastStatus.plusSeconds(10))) {
            lastStatus = Instant.now();
            Map<String, Object> status = new HashMap<>();
            status.put("t", "STATUS");
            status.put("pending", eventLog.pendingCount(EventLog.SALE) + eventLog.pendingCount(EventLog.SCAN));
            if (activeUserId != null) status.put("userId", activeUserId);
            status.put("update", updater.status().get("state"));
            worker.execute(() -> send(status));
        }
    }

    /** A new sale or scan: forward it right away rather than at the next tick. */
    public void nudge() {
        if (ws != null) worker.execute(this::pushPending);
    }

    private void connect() {
        connecting = true;
        try {
            HttpClient client = HttpClient.newBuilder().sslContext(sslContext()).connectTimeout(Duration.ofSeconds(10)).build();
            client.newWebSocketBuilder().connectTimeout(Duration.ofSeconds(10))
                    .buildAsync(URI.create(props.channelWebSocketUrl()), new Listener())
                    .whenComplete((socket, err) -> {
                        connecting = false;
                        if (err != null) {
                            retryLater(err.getMessage());
                            return;
                        }
                        ws = socket;
                        backoff = Duration.ofSeconds(1);
                        batchInFlight.set(false);
                        Map<String, Object> hello = new HashMap<>();
                        hello.put("t", "HELLO");
                        hello.put("p", PROTOCOL);
                        hello.put("appVersion", updater.currentVersion());
                        hello.put("os", AppVersion.os());
                        hello.put("feedCursor", meta.get("feed_cursor").map(Long::parseLong).orElse(-1L));
                        meta.get("catalog_version").ifPresent(v -> hello.put("catalogVersion", v));
                        meta.get("users_version").ifPresent(v -> hello.put("usersVersion", v));
                        worker.execute(() -> {
                            send(hello);
                            publishStatus();
                        });
                    });
        } catch (Exception e) {
            connecting = false;
            retryLater(e.getMessage());
        }
    }

    private void retryLater(String why) {
        log.debug("Live channel unavailable ({}), retrying in {}", why, backoff);
        nextAttempt = Instant.now().plus(backoff);
        backoff = backoff.multipliedBy(2).compareTo(Duration.ofSeconds(60)) > 0 ? Duration.ofSeconds(60) : backoff.multipliedBy(2);
    }

    private void handle(String text) {
        JsonNode f = json.readTree(text);
        switch (f.path("t").asString("")) {
            case "WELCOME" -> {
                eventLog.markAckedUpTo(device.deviceId().toString(), f.path("watermark").asLong(0));
                pushPending();
            }
            case "CATALOG" -> {
                catalog.store(f.get("bootstrap"));
                meta.put("catalog_version", f.get("version").asString());
                live.publish("CATALOG_CHANGED", null);
            }
            case "USERS" -> {
                String gate = catalog.gate().map(Catalog.GateInfo::id).orElse(meta.get("enrolled_gate_id").orElse(""));
                auth.replaceUsers(f.get("users"), gate);
                meta.put("users_version", f.get("version").asString());
            }
            case "ACK" -> {
                for (JsonNode r : f.path("results")) {
                    String origin = r.get("origin").asString();
                    long seq = r.get("seq").asLong();
                    switch (r.path("status").asString("")) {
                        case "ACCEPTED", "DUPLICATE" -> {
                            String ref = r.path("referenceNumber").asString(null);
                            eventLog.markAcked(origin, seq, ref != null ? ref : r.path("scanResult").asString(null));
                            if (ref != null) setCentralReference(origin, seq, ref);
                        }
                        case "REJECTED" -> eventLog.markRejected(origin, seq, r.path("reason").asString(""));
                        default -> { /* GAP: resent in order on the next round */ }
                    }
                }
                batchInFlight.set(false);
                publishStatus();
                pushPending();
            }
            case "FEED" -> {
                long last = -1;
                for (JsonNode e : f.path("events")) {
                    JsonNode p = e.get("payload");
                    switch (e.get("type").asString()) {
                        case "SALE" -> till.applyForeignSale(p);
                        case "SCAN" -> till.applyForeignScan(p);
                        case "SALE_VOIDED" -> till.applyVoid(p);
                        default -> { /* newer than this till: skipped */ }
                    }
                    last = e.get("cursor").asLong();
                }
                if (last >= 0) {
                    meta.put("feed_cursor", Long.toString(last));
                    send(Map.of("t", "FEED_ACK", "cursor", last));
                }
            }
            case "RELEASE" -> updater.onRelease(f);
            case "UPGRADE_REQUIRED" -> log.warn("Central needs a newer till version (protocol {}): working offline until updated", f.path("p"));
            default -> log.debug("Ignored frame {}", f.path("t"));
        }
    }

    private void pushPending() {
        if (ws == null || !batchInFlight.compareAndSet(false, true)) return;
        List<EventLog.SignedRecord> pending = eventLog.pendingSigned(BATCH);
        if (pending.isEmpty()) {
            batchInFlight.set(false);
            return;
        }
        List<Map<String, Object>> records = new ArrayList<>();
        for (EventLog.SignedRecord r : pending) {
            records.add(Map.of("origin", r.origin(), "seq", r.seq(), "type", r.type(), "hlc", r.hlc(),
                    "actorUserId", r.actorUserId(), "payload", r.payload(), "sig", r.sig()));
        }
        send(Map.of("t", "PUSH", "batchId", UUID.randomUUID().toString(), "records", records));
    }

    private void setCentralReference(String origin, long seq, String ref) {
        jdbc.update("""
                UPDATE sale SET central_reference = ? WHERE id = (
                    SELECT json_extract(payload, '$.idempotencyKey') FROM event_log WHERE origin = ? AND seq = ? AND type = 'SALE')""",
                ref, origin, seq);
    }

    private void send(Object frame) {
        WebSocket socket = ws;
        if (socket == null) return;
        try {
            socket.sendText(json.writeValueAsString(frame), true).join();
        } catch (RuntimeException e) {
            dropped("send failed: " + e.getMessage());
        }
    }

    private void dropped(String why) {
        ws = null;
        batchInFlight.set(false);
        retryLater(why);
        publishStatus();
    }

    private void publishStatus() {
        live.publish("SYNC_STATUS", Map.of("centralReachable", ws != null,
                "pending", eventLog.pendingCount(EventLog.SALE) + eventLog.pendingCount(EventLog.SCAN), "channel", ws != null));
    }

    private SSLContext sslContext() throws Exception {
        CertificateFactory cf = CertificateFactory.getInstance("X.509");
        List<Certificate> chain = new ArrayList<>();
        chain.add(cf.generateCertificate(pem(enrollment.certificatePem().orElseThrow())));
        Collection<? extends Certificate> cas = cf.generateCertificates(pem(enrollment.chainPem().orElse("")));
        chain.addAll(cas);
        KeyStore ks = KeyStore.getInstance("PKCS12");
        ks.load(null, null);
        char[] pass = UUID.randomUUID().toString().toCharArray();
        ks.setKeyEntry("device", device.keyPair().getPrivate(), pass, chain.toArray(Certificate[]::new));
        KeyManagerFactory kmf = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
        kmf.init(ks, pass);

        // The server is checked against the usual public CAs (Let's Encrypt), plus an extra CA for local tests.
        KeyStore trust = KeyStore.getInstance(KeyStore.getDefaultType());
        try (InputStream in = Files.newInputStream(Path.of(System.getProperty("java.home"), "lib", "security", "cacerts"))) {
            trust.load(in, "changeit".toCharArray());
        }
        if (props.channelCaFile() != null && Files.exists(props.channelCaFile())) {
            int i = 0;
            for (Certificate c : cf.generateCertificates(Files.newInputStream(props.channelCaFile()))) trust.setCertificateEntry("extra-" + i++, c);
        }
        TrustManagerFactory tmf = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
        tmf.init(trust);
        SSLContext ctx = SSLContext.getInstance("TLS");
        ctx.init(kmf.getKeyManagers(), tmf.getTrustManagers(), null);
        return ctx;
    }

    private static InputStream pem(String text) {
        return new ByteArrayInputStream(text.getBytes(StandardCharsets.US_ASCII));
    }

    @PreDestroy
    void stop() {
        WebSocket socket = ws;
        if (socket != null) socket.sendClose(WebSocket.NORMAL_CLOSURE, "shutdown");
        worker.shutdownNow();
    }

    private final class Listener implements WebSocket.Listener {
        @Override
        public CompletionStage<?> onText(WebSocket socket, CharSequence data, boolean last) {
            partial.append(data);
            if (last) {
                String text = partial.toString();
                partial.setLength(0);
                worker.execute(() -> {
                    try {
                        handle(text);
                    } catch (RuntimeException e) {
                        log.warn("Live channel frame not handled: {}", e.getMessage());
                    }
                });
            }
            socket.request(1);
            return null;
        }

        @Override
        public CompletionStage<?> onClose(WebSocket socket, int status, String reason) {
            if (status == 4403) {
                enrollment.markRevoked();
                live.publish("DEVICE_REVOKED", null);
                log.warn("This till was revoked by the back office: live channel stopped");
            }
            dropped("closed " + status);
            return null;
        }

        @Override
        public void onError(WebSocket socket, Throwable error) {
            dropped(error.getMessage());
        }
    }
}
