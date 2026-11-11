package com.nguonpos.edge.update;

import com.nguonpos.edge.EdgeProperties;
import com.nguonpos.edge.core.Activity;
import com.nguonpos.edge.core.LiveEvents;
import com.nguonpos.edge.core.Meta;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.MessageDigest;
import java.security.PrivateKey;
import java.security.Signature;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class UpdaterTest {

    @TempDir
    Path dir;

    private HttpServer server;
    private byte[] served = "the 0.2.0 installer".getBytes(StandardCharsets.UTF_8);
    private PrivateKey releaseKey;
    private Path publicKeyFile;
    private final List<String> installs = new ArrayList<>();
    private final JsonMapper json = JsonMapper.builder().build();
    private Meta meta;

    @BeforeEach
    void setUp() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/releases/", ex -> {
            ex.sendResponseHeaders(200, served.length);
            ex.getResponseBody().write(served);
            ex.close();
        });
        server.start();
        KeyPair kp = KeyPairGenerator.getInstance("Ed25519").generateKeyPair();
        releaseKey = kp.getPrivate();
        publicKeyFile = dir.resolve("release.pub");
        Files.writeString(publicKeyFile, "-----BEGIN PUBLIC KEY-----\n" + Base64.getEncoder().encodeToString(kp.getPublic().getEncoded())
                + "\n-----END PUBLIC KEY-----\n");
        var ds = new SingleConnectionDataSource("jdbc:sqlite::memory:", true);
        JdbcTemplate jdbc = new JdbcTemplate(ds);
        jdbc.execute("CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)");
        meta = new Meta(jdbc);
    }

    @AfterEach
    void tearDown() {
        server.stop(0);
    }

    private Updater updater(String installed, long quietMinutes) throws Exception {
        var props = new EdgeProperties(dir.resolve("data"), "http://127.0.0.1:" + server.getAddress().getPort(), "file", List.of(), 0, null, null, 0, 0, List.of());
        Installer fake = new Installer() {
            @Override
            public String fileName(String version) {
                return "nguon-pos_" + version + "_amd64.deb";
            }

            @Override
            public void install(Path file, String version, String sha256, String signature) throws IOException {
                installs.add(version + "|" + sha256 + "|" + new String(Files.readAllBytes(file), StandardCharsets.UTF_8));
            }
        };
        return new Updater(props, meta, json, new ReleaseSignature(publicKeyFile.toString()), fake, new Activity(), new LiveEvents(json),
                quietMinutes, installed, AppVersion.LINUX_DEB);
    }

    private String sign(String version, String platform, String sha) throws Exception {
        Signature s = Signature.getInstance("Ed25519");
        s.initSign(releaseKey);
        s.update(ReleaseSignature.message(version, platform, sha));
        return Base64.getEncoder().encodeToString(s.sign());
    }

    private static String sha(byte[] b) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(b));
    }

    private Map<String, Object> releaseFrame(String version, String sha, String signature) {
        return Map.of("t", "RELEASE", "release", Map.of("version", version, "notes", "",
                "files", List.of(Map.of("platform", AppVersion.LINUX_DEB, "url", "/releases/" + version + "/nguon-pos_" + version + "_amd64.deb",
                        "sha256", sha, "signature", signature, "size", served.length))));
    }

    private void receive(Updater u, Map<String, Object> frame) {
        u.onRelease(json.readTree(json.writeValueAsString(frame)));
    }

    @Test
    void aSignedNewerReleaseIsDownloadedCheckedAndInstalled() throws Exception {
        Updater u = updater("0.1.0", 0);
        String sha = sha(served);
        receive(u, releaseFrame("0.2.0", sha, sign("0.2.0", AppVersion.LINUX_DEB, sha)));
        assertEquals(List.of("0.2.0|" + sha + "|the 0.2.0 installer"), installs);
        assertEquals("INSTALLING", u.status().get("state"));
        u.tick(); // asked once; not again until the retry delay
        assertEquals(1, installs.size());
    }

    @Test
    void aFileThatDoesNotMatchItsSignedHashIsRefused() throws Exception {
        Updater u = updater("0.1.0", 0);
        String sha = sha(served);
        String sig = sign("0.2.0", AppVersion.LINUX_DEB, sha);
        served = "a tampered installer".getBytes(StandardCharsets.UTF_8);
        receive(u, releaseFrame("0.2.0", sha, sig));
        assertTrue(installs.isEmpty());
        assertEquals("FAILED", u.status().get("state"));
        assertFalse(Files.exists(dir.resolve("data/updates/nguon-pos_0.2.0_amd64.deb")));
    }

    @Test
    void aSignatureForAnotherPlatformOrVersionIsRefused() throws Exception {
        Updater u = updater("0.1.0", 0);
        String sha = sha(served);
        receive(u, releaseFrame("0.2.0", sha, sign("0.2.0", AppVersion.WINDOWS_NSIS, sha)));
        receive(u, releaseFrame("0.2.0", sha, sign("0.3.0", AppVersion.LINUX_DEB, sha)));
        assertTrue(installs.isEmpty());
        assertEquals("Release signature invalid", u.status().get("error"));
    }

    @Test
    void anOlderOrSameVersionIsNeverInstalled() throws Exception {
        Updater u = updater("0.2.0", 0);
        String sha = sha(served);
        receive(u, releaseFrame("0.2.0", sha, sign("0.2.0", AppVersion.LINUX_DEB, sha)));
        receive(u, releaseFrame("0.1.9", sha, sign("0.1.9", AppVersion.LINUX_DEB, sha)));
        assertTrue(installs.isEmpty());
        assertEquals("UP_TO_DATE", u.status().get("state"));
    }

    @Test
    void aVersionThatWasRolledBackIsNotInstalledAgain() throws Exception {
        Updater u = updater("0.1.0", 0);
        Files.createDirectories(dir.resolve("data/updates"));
        Files.writeString(dir.resolve("data/updates/last-result"), "2026-11-11T10:00:00Z ROLLED_BACK 0.2.0 did not start; back to 0.1.0\n");
        String sha = sha(served);
        receive(u, releaseFrame("0.2.0", sha, sign("0.2.0", AppVersion.LINUX_DEB, sha)));
        assertTrue(installs.isEmpty());
        assertEquals("FAILED", u.status().get("state"));
    }

    @Test
    void itWaitsUntilTheTillIsQuietAndNothingHappensWhenFrozen() throws Exception {
        Updater u = updater("0.1.0", 15);
        String sha = sha(served);
        receive(u, releaseFrame("0.2.0", sha, sign("0.2.0", AppVersion.LINUX_DEB, sha)));
        assertEquals("READY", u.status().get("state")); // downloaded, the till was just used
        assertTrue(installs.isEmpty());
        receive(u, Map.of("t", "RELEASE", "frozen", true));
        assertEquals("UP_TO_DATE", u.status().get("state"));
        assertTrue(installs.isEmpty());
    }
}
