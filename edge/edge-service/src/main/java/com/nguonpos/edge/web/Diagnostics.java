package com.nguonpos.edge.web;

import com.nguonpos.edge.EdgeProperties;
import com.nguonpos.edge.central.EdgeChannel;
import com.nguonpos.edge.central.Enrollment;
import com.nguonpos.edge.core.Catalog;
import com.nguonpos.edge.core.DeviceIdentity;
import com.nguonpos.edge.core.EventLog;
import com.nguonpos.edge.peer.PeerServer;
import com.nguonpos.edge.peer.PeerSync;
import com.nguonpos.edge.update.AppVersion;
import com.nguonpos.edge.update.Updater;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.lang.management.ManagementFactory;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/**
 * A support export of this till: what state it is in and what it logged,
 * as a zip the cashier saves and sends. Holds no secret — no key, token,
 * password hash, signing secret or ticket QR code; records appear by type,
 * sequence and outcome, never by content.
 */
@Component
public class Diagnostics {

    static final int MAX_LOG_BYTES = 8 * 1024 * 1024;

    private final EdgeProperties props;
    private final DeviceIdentity device;
    private final Enrollment enrollment;
    private final Catalog catalog;
    private final EventLog eventLog;
    private final EdgeChannel channel;
    private final Updater updater;
    private final PeerSync peers;
    private final PeerServer peerServer;
    private final JdbcTemplate jdbc;
    private final JsonMapper json;

    public Diagnostics(EdgeProperties props, DeviceIdentity device, Enrollment enrollment, Catalog catalog, EventLog eventLog,
                       EdgeChannel channel, Updater updater, PeerSync peers, PeerServer peerServer, JdbcTemplate jdbc, JsonMapper json) {
        this.props = props;
        this.device = device;
        this.enrollment = enrollment;
        this.catalog = catalog;
        this.eventLog = eventLog;
        this.channel = channel;
        this.updater = updater;
        this.peers = peers;
        this.peerServer = peerServer;
        this.jdbc = jdbc;
        this.json = json;
    }

    /** The summary shown in the till's Support dialog and saved as summary.json. */
    public Map<String, Object> summary() {
        Map<String, Object> s = new LinkedHashMap<>();
        s.put("generatedAt", Instant.now().toString());
        s.put("appVersion", updater.currentVersion());
        s.put("os", AppVersion.os());
        s.put("java", System.getProperty("java.version"));
        s.put("deviceId", device.deviceId().toString());
        s.put("deviceCode", device.shortCode());
        s.put("deviceNo", enrollment.deviceNo().orElse(null));
        s.put("deviceLabel", enrollment.label().orElse(null));
        s.put("gate", catalog.gate().map(g -> g.name() + " (" + g.code() + ")").orElse(null));
        s.put("enrolled", enrollment.enrolled());
        s.put("revoked", enrollment.revoked());
        s.put("centralUrl", props.centralUrl());
        s.put("connectedToCentral", channel.connected());
        s.put("pendingSales", eventLog.pendingCount(EventLog.SALE));
        s.put("pendingScans", eventLog.pendingCount(EventLog.SCAN));
        // MIN() of no row is NULL: nothing waiting is the usual case, not an error.
        s.put("oldestPending", jdbc.queryForObject("SELECT MIN(created_at) FROM event_log WHERE uplink_status = 'PENDING'", String.class));
        s.put("records", jdbc.queryForList("""
                SELECT type, uplink_status AS status, COUNT(*) AS count FROM event_log GROUP BY type, uplink_status ORDER BY type, uplink_status"""));
        s.put("rejected", jdbc.queryForList("""
                SELECT origin, seq, type, uplink_result AS reason, created_at AS "createdAt" FROM event_log
                WHERE uplink_status = 'REJECTED' ORDER BY created_at DESC LIMIT 50"""));
        s.put("peerServer", peerServer.running());
        s.put("peers", peers.peers().stream().map(p -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("deviceId", p.deviceId());
            m.put("label", p.label());
            m.put("address", p.address());
            m.put("connected", p.connected());
            m.put("lastSeenAt", p.lastSeenAt());
            m.put("lastError", p.lastError());
            return m;
        }).toList());
        s.put("update", updater.status());
        s.put("installerResult", readSmall(props.dataDir().resolve("updates").resolve("last-result")));
        s.put("printer", jdbc.queryForList("SELECT v FROM till_setting WHERE k = 'printer'", String.class).stream().findFirst()
                .map(json::readTree).orElse(null));
        Runtime rt = Runtime.getRuntime();
        s.put("memory", Map.of("usedMb", (rt.totalMemory() - rt.freeMemory()) >> 20, "maxMb", rt.maxMemory() >> 20));
        try {
            var store = Files.getFileStore(props.dataDir());
            s.put("disk", Map.of("freeMb", store.getUsableSpace() >> 20, "totalMb", store.getTotalSpace() >> 20));
        } catch (IOException e) {
            s.put("disk", null);
        }
        s.put("uptime", Duration.ofMillis(ManagementFactory.getRuntimeMXBean().getUptime()).toString());
        return s;
    }

    /** summary.json + the latest log files (newest first, up to MAX_LOG_BYTES in all). */
    public byte[] zip() throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(bytes)) {
            zip.putNextEntry(new ZipEntry("summary.json"));
            zip.write(json.writerWithDefaultPrettyPrinter().writeValueAsBytes(summary()));
            zip.closeEntry();
            long budget = MAX_LOG_BYTES;
            for (Path log : logFiles()) {
                if (budget <= 0) break;
                long size = Files.size(log);
                zip.putNextEntry(new ZipEntry("logs/" + log.getFileName()));
                try (InputStream in = Files.newInputStream(log)) {
                    if (size > budget) in.skipNBytes(size - budget); // keep the end: the most recent lines
                    budget -= in.transferTo(zip);
                }
                zip.closeEntry();
            }
            zip.putNextEntry(new ZipEntry("LISEZ-MOI.txt"));
            zip.write(("""
                    Diagnostic de la caisse Nguon POS — à envoyer au support.
                    summary.json : état de la caisse (version, connexion, ventes en attente, caisses voisines, mise à jour).
                    logs/ : journal du serveur local de la caisse.
                    Aucun secret n'y figure (ni clé, ni mot de passe, ni QR code de billet).
                    """).getBytes(StandardCharsets.UTF_8));
            zip.closeEntry();
        }
        return bytes.toByteArray();
    }

    private List<Path> logFiles() throws IOException {
        Path dir = props.dataDir().resolve("logs");
        if (!Files.isDirectory(dir)) return List.of();
        try (Stream<Path> files = Files.list(dir)) {
            return files.filter(f -> f.getFileName().toString().startsWith("edge.log") && Files.isRegularFile(f))
                    .sorted(Comparator.comparing((Path f) -> f.toFile().lastModified()).reversed())
                    .toList();
        }
    }

    private static String readSmall(Path file) {
        try {
            if (!Files.isRegularFile(file) || Files.size(file) > 4096) return null;
            return Files.readString(file).strip();
        } catch (IOException | RuntimeException e) {
            return null;
        }
    }
}
