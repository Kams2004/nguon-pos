package com.nguonpos.edge.peer;

import com.nguonpos.edge.EdgeProperties;
import com.nguonpos.edge.core.DeviceIdentity;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpsConfigurator;
import com.sun.net.httpserver.HttpsExchange;
import com.sun.net.httpserver.HttpsParameters;
import com.sun.net.httpserver.HttpsServer;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Lazy;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

import javax.net.ssl.SSLParameters;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.cert.X509Certificate;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * This till's door for the other tills of its gate, on the LAN (port 47310):
 * TLS 1.3 where both sides show a Nguon device certificate. A caller whose
 * certificate is not for this gate, or was revoked, is turned away.
 *
 *   GET  /peer/v1/summary                       origin → highest sequence held
 *   GET  /peer/v1/events?origin=&after=&limit=  a page of one origin's records
 *   POST /peer/v1/nudge                         "I have something new": fetch from me now
 */
@Component
public class PeerServer {

    private static final Logger log = LoggerFactory.getLogger(PeerServer.class);

    private final EdgeProperties props;
    private final PeerCredentials credentials;
    private final PeerRecords records;
    private final PeerStore store;
    private final DeviceIdentity device;
    private final PeerSync sync;
    private final JsonMapper json;

    private HttpsServer server;
    private ExecutorService executor;
    private String runningFor;

    public PeerServer(EdgeProperties props, PeerCredentials credentials, PeerRecords records, PeerStore store, DeviceIdentity device,
                      @Lazy PeerSync sync, JsonMapper json) {
        this.props = props;
        this.credentials = credentials;
        this.records = records;
        this.store = store;
        this.device = device;
        this.sync = sync;
        this.json = json;
    }

    public synchronized boolean running() {
        return server != null;
    }

    /** Runs once the till is enrolled; restarts with a new certificate. */
    @Scheduled(fixedDelay = 10_000, initialDelay = 3_000)
    public synchronized void ensure() {
        boolean wanted = props.peerPort() > 0 && credentials.ready();
        if (!wanted) {
            stop();
            return;
        }
        if (server != null && credentials.version().equals(runningFor)) return;
        stop();
        try {
            HttpsServer s = HttpsServer.create(new InetSocketAddress(props.peerPort()), 16);
            s.setHttpsConfigurator(new HttpsConfigurator(credentials.sslContext()) {
                @Override
                public void configure(HttpsParameters params) {
                    SSLParameters p = getSSLContext().getDefaultSSLParameters();
                    p.setNeedClientAuth(true);
                    // TLS 1.2 (ECDHE, AES-GCM): the JDK's built-in HTTPS server can stall a TLS 1.3
                    // connection on post-handshake messages until the client times out.
                    p.setProtocols(new String[]{"TLSv1.2"});
                    p.setCipherSuites(new String[]{"TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384", "TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256"});
                    params.setSSLParameters(p);
                }
            });
            s.createContext("/peer/v1/summary", ex -> handle(ex, "GET", (peer, q) -> Map.of(
                    "deviceId", device.deviceId().toString(), "origins", records.summary())));
            s.createContext("/peer/v1/events", ex -> handle(ex, "GET", (peer, q) -> records.page(q.getOrDefault("origin", ""),
                    parseLong(q.get("after")), (int) Math.max(1, Math.min(parseLong(q.get("limit")), PeerRecords.MAX_PAGE)))));
            s.createContext("/peer/v1/nudge", ex -> handle(ex, "POST", (peer, q) -> {
                sync.nudgeFrom(peer.deviceId());
                return Map.of("ok", true);
            }));
            executor = Executors.newFixedThreadPool(4, r -> new Thread(r, "peer-server"));
            s.setExecutor(executor);
            s.start();
            server = s;
            runningFor = credentials.version();
            log.info("Peer server listening on port {}", props.peerPort());
        } catch (Exception e) {
            log.warn("Peer server could not start on port {}: {}", props.peerPort(), e.getMessage());
            stop();
        }
    }

    private void handle(HttpExchange ex, String method, Handler h) throws IOException {
        try (ex) {
            if (!method.equals(ex.getRequestMethod())) {
                send(ex, 405, Map.of("error", "METHOD"));
                return;
            }
            Optional<PeerCredentials.Identity> peer = Optional.empty();
            if (ex instanceof HttpsExchange https) {
                try {
                    var certs = https.getSSLSession().getPeerCertificates();
                    if (certs.length > 0 && certs[0] instanceof X509Certificate c) {
                        peer = credentials.verify(c);
                        peer.ifPresent(p -> {
                            if (store.certificate(p.deviceId()).isEmpty()) store.setCertificate(p.deviceId(), PeerCredentials.toPem(c));
                        });
                    }
                } catch (javax.net.ssl.SSLPeerUnverifiedException ignored) {
                    // no certificate: refused below
                }
            }
            if (peer.isEmpty() || store.revoked(peer.get().deviceId()) || peer.get().deviceId().equals(device.deviceId().toString())) {
                send(ex, 403, Map.of("error", "NOT_A_PEER"));
                return;
            }
            send(ex, 200, h.answer(peer.get(), query(ex.getRequestURI().getRawQuery())));
        } catch (RuntimeException e) {
            log.debug("Peer request failed: {}", e.getMessage());
            try {
                send(ex, 500, Map.of("error", "INTERNAL"));
            } catch (IOException ignored) {
                // connection gone
            }
        }
    }

    private void send(HttpExchange ex, int status, Object body) throws IOException {
        byte[] bytes = json.writeValueAsBytes(body);
        ex.getResponseHeaders().set("Content-Type", "application/json");
        ex.sendResponseHeaders(status, bytes.length);
        ex.getResponseBody().write(bytes);
    }

    private static Map<String, String> query(String raw) {
        Map<String, String> q = new HashMap<>();
        if (raw == null) return q;
        for (String part : raw.split("&")) {
            int i = part.indexOf('=');
            if (i > 0) q.put(URLDecoder.decode(part.substring(0, i), StandardCharsets.UTF_8), URLDecoder.decode(part.substring(i + 1), StandardCharsets.UTF_8));
        }
        return q;
    }

    private static long parseLong(String s) {
        try {
            return s == null ? 0 : Long.parseLong(s);
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    @PreDestroy
    public synchronized void stop() {
        if (server != null) server.stop(0);
        if (executor != null) executor.shutdownNow();
        server = null;
        executor = null;
        runningFor = null;
    }

    @FunctionalInterface
    interface Handler {
        Object answer(PeerCredentials.Identity peer, Map<String, String> query);
    }
}
