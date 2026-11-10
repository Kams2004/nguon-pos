package com.nguonpos.edge.peer;

import com.nguonpos.edge.EdgeProperties;
import com.nguonpos.edge.core.DeviceIdentity;
import com.nguonpos.edge.core.LiveEvents;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.cert.Certificate;
import java.security.cert.X509Certificate;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Keeps this till's log in step with the other tills of its gate, directly
 * over the LAN: every few seconds, and at once when a peer says it has
 * something new, it compares what each holds and fetches the missing
 * records. Works with central unreachable — that is the point.
 */
@Component
public class PeerSync {

    private static final Logger log = LoggerFactory.getLogger(PeerSync.class);
    private static final int PAGE = 200;

    private final EdgeProperties props;
    private final PeerCredentials credentials;
    private final PeerRecords records;
    private final PeerStore store;
    private final DeviceIdentity device;
    private final LiveEvents live;
    private final JsonMapper json;
    // Peers are synced side by side (one slow or vanished till must not hold up the others), each by
    // one thread at a time; records are stored in sequence per origin whichever peer brings them.
    private final ExecutorService worker = Executors.newFixedThreadPool(4, r -> new Thread(r, "peer-sync"));
    private final ExecutorService notifier = Executors.newFixedThreadPool(2, r -> new Thread(r, "peer-nudge"));
    private final java.util.Set<String> busy = java.util.concurrent.ConcurrentHashMap.newKeySet();
    private final Object ingestLock = new Object();

    public PeerSync(EdgeProperties props, PeerCredentials credentials, PeerRecords records, PeerStore store, DeviceIdentity device,
                    LiveEvents live, JsonMapper json) {
        this.props = props;
        this.credentials = credentials;
        this.records = records;
        this.store = store;
        this.device = device;
        this.live = live;
        this.json = json;
    }

    @Scheduled(fixedDelay = 5_000, initialDelay = 6_000)
    public void tick() {
        if (props.peerPort() <= 0 || !credentials.ready()) return;
        for (String a : props.peers()) {
            if (!a.isBlank()) store.upsertAddress("config:" + a.strip(), null, a.strip(), "CONFIG");
        }
        syncAll();
    }

    /** A peer has new records: fetch them now. */
    public void nudgeFrom(String deviceId) {
        store.reachable(self()).stream().filter(p -> p.deviceId().equals(deviceId)).forEach(this::schedule);
    }

    /** This till just recorded something: tell the peers, so they fetch it in a moment. */
    public void announce() {
        if (props.peerPort() <= 0 || !credentials.ready()) return;
        for (PeerStore.Peer p : store.reachable(self())) {
            notifier.execute(() -> {
                try {
                    call(p, "/peer/v1/nudge", "POST", 2_000);
                } catch (IOException | RuntimeException e) {
                    log.debug("Nudge to {} failed: {}", p.address(), e.getMessage());
                }
            });
        }
    }

    void syncAll() {
        for (PeerStore.Peer p : store.reachable(self())) schedule(p);
    }

    /** At most one sync per peer at a time; a nudge arriving meanwhile is covered by the running one or the next tick. */
    private void schedule(PeerStore.Peer p) {
        if (!busy.add(p.deviceId())) return;
        worker.execute(() -> {
            try {
                syncWith(p);
            } finally {
                busy.remove(p.deviceId());
            }
        });
    }

    void syncWith(PeerStore.Peer peer) {
        try {
            Answer summary = call(peer, "/peer/v1/summary", "GET", 5_000);
            String peerId = summary.identity().deviceId();
            if (peer.placeholder()) store.resolvePlaceholder(peer.deviceId(), peerId, peer.address());
            else if (!peerId.equals(peer.deviceId())) throw new IOException("answered as another till");
            int fetched = 0;
            for (Map.Entry<String, JsonNode> e : summary.body().path("origins").properties()) {
                String origin = e.getKey();
                if (origin.equals(self())) continue;
                long theirs = e.getValue().asLong(0);
                for (int guard = 0; guard < 1_000 && records.maxSeq(origin) < theirs; guard++) {
                    String q = "/peer/v1/events?origin=" + URLEncoder.encode(origin, StandardCharsets.UTF_8) + "&after=" + records.maxSeq(origin)
                            + "&limit=" + PAGE;
                    JsonNode page = call(peer, q, "GET", 10_000).body();
                    int n;
                    synchronized (ingestLock) { // two peers bringing the same origin: one at a time, in sequence
                        n = records.ingest(origin, page);
                    }
                    if (n == 0) break; // refused or nothing new: try again next round
                    fetched += n;
                }
            }
            store.seen(peerId);
            if (fetched > 0) {
                log.info("Fetched {} record(s) from peer {}", fetched, peer.label() != null ? peer.label() : peer.address());
                live.publish("PEER_SYNC", Map.of("fetched", fetched));
            }
        } catch (IOException | RuntimeException e) {
            store.failed(peer.deviceId(), e.getMessage());
            log.debug("Peer {} unreachable: {}", peer.address(), e.getMessage());
        }
    }

    private Answer call(PeerStore.Peer peer, String path, String method, int timeoutMs) throws IOException {
        SSLContext ctx;
        try {
            ctx = credentials.sslContext();
        } catch (Exception e) {
            throw new IOException(e);
        }
        HttpsURLConnection c = (HttpsURLConnection) URI.create("https://" + peer.address() + path).toURL().openConnection();
        c.setSSLSocketFactory(ctx.getSocketFactory());
        // Peers have no DNS names: the certificate is checked below instead (our CA, our gate, the expected till).
        c.setHostnameVerifier((host, session) -> true);
        c.setConnectTimeout(Math.min(timeoutMs, 2_000));
        c.setReadTimeout(timeoutMs);
        c.setRequestMethod(method);
        if (method.equals("POST")) {
            c.setDoOutput(true);
            try (OutputStream out = c.getOutputStream()) {
                out.write("{}".getBytes(StandardCharsets.UTF_8));
            }
        }
        try {
            int status = c.getResponseCode();
            Certificate[] certs = c.getServerCertificates();
            if (certs.length == 0 || !(certs[0] instanceof X509Certificate server)) throw new IOException("no certificate");
            var who = credentials.verify(server).orElseThrow(() -> new IOException("not a till of this gate"));
            if (store.revoked(who.deviceId())) throw new IOException("revoked till");
            if (!peer.placeholder() && !who.deviceId().equals(peer.deviceId())) {
                // Another till of the gate answers at this address now: the address is its, not this peer's.
                store.upsertAddress(who.deviceId(), null, peer.address(), "MOVED");
                throw new IOException("address now used by another till");
            }
            if (store.certificate(who.deviceId()).isEmpty()) store.setCertificate(who.deviceId(), PeerCredentials.toPem(server));
            if (status != 200) throw new IOException("HTTP " + status);
            try (InputStream in = c.getInputStream()) {
                return new Answer(who, json.readTree(in.readAllBytes()));
            }
        } finally {
            c.disconnect();
        }
    }

    public List<PeerStore.Peer> peers() {
        return store.reachable(self());
    }

    private String self() {
        return device.deviceId().toString();
    }

    record Answer(PeerCredentials.Identity identity, JsonNode body) {
    }
}
