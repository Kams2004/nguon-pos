package com.nguonpos.edge.update;

import com.nguonpos.edge.EdgeProperties;
import com.nguonpos.edge.core.Activity;
import com.nguonpos.edge.core.LiveEvents;
import com.nguonpos.edge.core.Meta;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

/**
 * Keeps this till on the version the back office publishes ("Versions"):
 * central sends it over the live channel (RELEASE frame), the till
 * downloads the installer from central, checks its SHA-256 and the release
 * signature, then installs it once nobody has used the till for a while.
 * Data, enrollment and unsent sales live outside the installed files and
 * are kept. A frozen policy (festival) means no update at all.
 */
@Component
public class Updater {

    private static final Logger log = LoggerFactory.getLogger(Updater.class);
    static final String TARGET = "release_target";
    static final String REQUESTED = "release_install_requested";
    private static final int MAX_ATTEMPTS = 3;
    private static final Duration RETRY_AFTER = Duration.ofMinutes(30);

    public enum State { UP_TO_DATE, DOWNLOADING, READY, INSTALLING, FAILED, UNSUPPORTED }

    private final EdgeProperties props;
    private final Meta meta;
    private final JsonMapper json;
    private final ReleaseSignature signature;
    private final Installer installer;
    private final Activity activity;
    private final LiveEvents live;
    private final Duration quietPeriod;
    private final String currentVersion;
    private final String platform;
    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(15))
            .followRedirects(HttpClient.Redirect.NEVER)
            .build();

    private volatile State state = State.UP_TO_DATE;
    private volatile String targetVersion;
    private volatile String failure;
    /** The file already checked this run, so it is not hashed again every minute. */
    private volatile String verifiedKey;
    private Instant nextDownload = Instant.EPOCH;

    public Updater(EdgeProperties props, Meta meta, JsonMapper json, ReleaseSignature signature, Installer installer, Activity activity,
                   LiveEvents live, @Value("${edge.update-quiet-minutes:15}") long quietMinutes,
                   @Value("${edge.app-version:}") String versionOverride, @Value("${edge.update-platform:}") String platformOverride) {
        this.props = props;
        this.meta = meta;
        this.json = json;
        this.signature = signature;
        this.installer = installer;
        this.activity = activity;
        this.live = live;
        this.quietPeriod = Duration.ofMinutes(quietMinutes);
        this.currentVersion = versionOverride.isBlank() ? AppVersion.current() : versionOverride;
        this.platform = platformOverride.isBlank() ? AppVersion.platform() : platformOverride;
    }

    public String currentVersion() {
        return currentVersion;
    }

    /** Central's RELEASE frame: the version to run, or {"frozen": true}. */
    public void onRelease(JsonNode frame) {
        if (frame.path("frozen").asBoolean(false) || !frame.hasNonNull("release")) {
            meta.remove(TARGET);
        } else {
            meta.put(TARGET, json.writeValueAsString(frame.get("release")));
        }
        nextDownload = Instant.EPOCH;
        tick();
    }

    @Scheduled(fixedDelay = 60_000, initialDelay = 30_000)
    public synchronized void tick() {
        Optional<JsonNode> target = meta.get(TARGET).map(json::readTree);
        if (target.isEmpty()) {
            set(State.UP_TO_DATE, null, null); // nothing published, or frozen by the back office
            return;
        }
        String version = target.get().path("version").asString("");
        if (!Semver.newer(version, currentVersion)) {
            meta.remove(REQUESTED);
            set(State.UP_TO_DATE, null, null);
            return;
        }
        if (platform == null) {
            set(State.UNSUPPORTED, version, null);
            return;
        }
        JsonNode file = null;
        for (JsonNode f : target.get().path("files")) {
            if (platform.equals(f.path("platform").asString(""))) file = f;
        }
        if (file == null) {
            set(State.UNSUPPORTED, version, "No installer for " + platform);
            return;
        }
        String sha = file.path("sha256").asString("").toLowerCase();
        String sig = file.path("signature").asString("");
        if (!sha.matches("[0-9a-f]{64}") || !signature.verify(version, platform, sha, sig)) {
            set(State.FAILED, version, "Release signature invalid");
            return;
        }
        Path dir = props.dataDir().resolve("updates");
        Path local = dir.resolve(installer.fileName(version));
        if (!(sha + "|" + local).equals(verifiedKey)) {
            try {
                if (Files.isRegularFile(local) && sha.equals(sha256(local))) {
                    verifiedKey = sha + "|" + local;
                } else {
                    if (Instant.now().isBefore(nextDownload)) return;
                    set(State.DOWNLOADING, version, null);
                    download(file.path("url").asString(""), file.path("size").asLong(-1), sha, dir, local);
                    verifiedKey = sha + "|" + local;
                }
            } catch (IOException e) {
                nextDownload = Instant.now().plus(Duration.ofMinutes(5));
                set(State.FAILED, version, "Download failed: " + e.getMessage());
                log.warn("Update {} download failed: {}", version, e.getMessage());
                return;
            }
        }
        // Downloaded and verified: install at a quiet moment, retrying a few times if the version doesn't change.
        String[] requested = meta.get(REQUESTED).map(r -> r.split("\\|")).orElse(new String[0]);
        boolean sameVersion = requested.length == 3 && requested[0].equals(version);
        int attempts = sameVersion ? Integer.parseInt(requested[2]) : 0;
        if (sameVersion && Instant.parse(requested[1]).plus(RETRY_AFTER).isAfter(Instant.now())) {
            set(State.INSTALLING, version, null);
            return;
        }
        // The root updater put the previous version back because this one did not start: never again.
        if (lastInstallerResult().contains("ROLLED_BACK " + version + " ")) {
            set(State.FAILED, version, "Version " + version + " did not start on this till; the previous version was put back");
            return;
        }
        if (attempts >= MAX_ATTEMPTS) {
            set(State.FAILED, version, "Installation did not complete after " + MAX_ATTEMPTS + " attempts" + lastInstallerResult());
            return;
        }
        if (activity.idleFor().compareTo(quietPeriod) < 0) {
            set(State.READY, version, null);
            return;
        }
        try {
            meta.put(REQUESTED, version + "|" + Instant.now() + "|" + (attempts + 1));
            log.info("Installing update {} (attempt {})", version, attempts + 1);
            installer.install(local, version, sha, sig);
            set(State.INSTALLING, version, null);
        } catch (IOException e) {
            set(State.FAILED, version, "Install could not start: " + e.getMessage());
            log.warn("Update {} could not start: {}", version, e.getMessage());
        }
    }

    private void download(String url, long size, String sha, Path dir, Path target) throws IOException {
        // Only from central, only under /releases/: the signature is what makes the file trusted, this keeps the till off other hosts.
        if (!url.startsWith("/releases/") || url.contains("..") || url.contains("//") || url.contains("\\")) {
            throw new IOException("Refused URL " + url);
        }
        URI uri = URI.create(props.centralUrl().replaceAll("/+$", "") + url);
        Files.createDirectories(dir);
        try (var old = Files.newDirectoryStream(dir, "*.{deb,exe,part}")) {
            for (Path p : old) Files.deleteIfExists(p); // one installer kept at a time
        }
        Path part = dir.resolve(target.getFileName() + ".part");
        HttpResponse<InputStream> res;
        try {
            res = http.send(HttpRequest.newBuilder(uri).timeout(Duration.ofMinutes(30)).GET().build(), HttpResponse.BodyHandlers.ofInputStream());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException(e);
        }
        if (res.statusCode() != 200) {
            res.body().close();
            throw new IOException("HTTP " + res.statusCode());
        }
        MessageDigest md = digest();
        long written = 0;
        try (InputStream in = new DigestInputStream(res.body(), md); OutputStream out = Files.newOutputStream(part)) {
            byte[] buf = new byte[64 * 1024];
            for (int n; (n = in.read(buf)) > 0; ) {
                written += n;
                if (size > 0 && written > size) throw new IOException("Larger than announced");
                out.write(buf, 0, n);
            }
        }
        String actual = HexFormat.of().formatHex(md.digest());
        if (!actual.equals(sha)) {
            Files.deleteIfExists(part);
            throw new IOException("SHA-256 mismatch");
        }
        Files.move(part, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
    }

    private static String sha256(Path file) throws IOException {
        MessageDigest md = digest();
        try (InputStream in = new DigestInputStream(Files.newInputStream(file), md)) {
            in.transferTo(OutputStream.nullOutputStream());
        }
        return HexFormat.of().formatHex(md.digest());
    }

    private static MessageDigest digest() {
        try {
            return MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    /** What the Ubuntu root updater wrote after its last run, if anything. */
    private String lastInstallerResult() {
        Path result = props.dataDir().resolve("updates").resolve("last-result");
        try {
            if (Files.isRegularFile(result)) {
                String r = Files.readString(result).strip();
                return ": " + (r.length() > 200 ? r.substring(0, 200) : r);
            }
        } catch (IOException ignored) {
            // no detail
        }
        return "";
    }

    private void set(State s, String version, String why) {
        boolean changed = s != state || !java.util.Objects.equals(version, targetVersion) || !java.util.Objects.equals(why, failure);
        state = s;
        targetVersion = version;
        failure = why;
        if (changed) live.publish("UPDATE_STATUS", status());
    }

    public Map<String, Object> status() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("state", state.name());
        m.put("currentVersion", currentVersion);
        m.put("targetVersion", targetVersion);
        m.put("error", failure);
        return m;
    }
}
