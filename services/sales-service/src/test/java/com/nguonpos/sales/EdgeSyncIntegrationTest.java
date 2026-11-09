package com.nguonpos.sales;

import com.nguonpos.sales.edgesync.InternalClients;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.bouncycastle.asn1.x500.X500Name;
import org.bouncycastle.asn1.x509.BasicConstraints;
import org.bouncycastle.asn1.x509.Extension;
import org.bouncycastle.asn1.x509.KeyUsage;
import org.bouncycastle.cert.jcajce.JcaX509CertificateConverter;
import org.bouncycastle.cert.jcajce.JcaX509v3CertificateBuilder;
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder;
import org.bouncycastle.pkcs.jcajce.JcaPKCS10CertificationRequestBuilder;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.math.BigInteger;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.WebSocket;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Signature;
import java.security.cert.X509Certificate;
import java.security.spec.ECGenParameterSpec;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * Desktop tills against a real Postgres: enrollment with a one-time code,
 * the certificate-guarded live channel, signed and ordered records, the
 * gate feed reaching the other tills, voids, and revocation.
 * nginx's certificate check is simulated by the X-Client-* headers it sets.
 */
@Testcontainers
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = "jwt.signing-secret=" + EdgeSyncIntegrationTest.SECRET)
class EdgeSyncIntegrationTest {

    static final String SECRET = "integration-test-secret-integration-test-secret-0123456789";
    static final JsonMapper JSON = JsonMapper.builder().build();
    static Path caDir;

    @Container
    @ServiceConnection
    static PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:16-alpine");

    @MockitoBean
    InternalClients internal;

    @LocalServerPort
    int port;

    @Autowired
    JdbcTemplate jdbc;

    final HttpClient http = HttpClient.newHttpClient();
    final UUID establishment = UUID.randomUUID();
    final UUID gate = UUID.randomUUID();
    final UUID cashier = UUID.randomUUID();
    final UUID ticketType = UUID.randomUUID();

    @BeforeAll
    static void createDeviceCa() throws Exception {
        caDir = Files.createTempDirectory("device-ca");
        KeyPair root = ecKeys();
        X509Certificate rootCert = caCert("CN=Test Root", root, "CN=Test Root", root);
        KeyPair issuing = ecKeys();
        X509Certificate issuingCert = caCert("CN=Test Issuing", issuing, "CN=Test Root", root);
        Files.writeString(caDir.resolve("issuing-ca.crt"), pem("CERTIFICATE", issuingCert.getEncoded()));
        Files.writeString(caDir.resolve("issuing-ca.key"), pem("PRIVATE KEY", issuing.getPrivate().getEncoded()));
        Files.writeString(caDir.resolve("ca-chain.pem"), pem("CERTIFICATE", issuingCert.getEncoded()) + pem("CERTIFICATE", rootCert.getEncoded()));
    }

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry r) {
        r.add("device-ca.dir", () -> caDir.toString());
    }

    @BeforeEach
    void otherServices() {
        for (String schema : new String[]{"auth", "catalog"}) {
            jdbc.execute("CREATE SCHEMA IF NOT EXISTS " + schema);
            jdbc.execute("CREATE TABLE IF NOT EXISTS " + schema + ".audit_log (LIKE sales.audit_log INCLUDING ALL)");
        }
        when(internal.gateConfig(any(), any())).thenReturn(JSON.readTree(
                "{\"gate\":{\"id\":\"" + gate + "\",\"name\":\"Porte T\",\"code\":\"GATE-T\",\"signingSecret\":\"" + "ab".repeat(32) + "\"},\"ticketTypes\":[]}"));
        when(internal.gateUsers(any(), any())).thenReturn(JSON.readTree(
                "[{\"id\":\"" + cashier + "\",\"username\":\"c1\",\"fullName\":\"Caissière Une\",\"role\":\"CASHIER\",\"passwordHash\":\"$2a$10$x\",\"active\":true}]"));
    }

    @Test
    void anEnrolledTillSyncsLiveAndTheOtherTillsOfItsGateHearAboutIt() throws Exception {
        Till a = enroll("Caisse A");
        Till b = enroll("Caisse B");
        assertThat(a.deviceNo).isEqualTo(1);
        assertThat(b.deviceNo).isEqualTo(2);

        Channel chA = a.connect();
        Channel chB = b.connect();
        assertThat(chA.next("WELCOME").get("watermark").asLong()).isZero();
        JsonNode catalog = chA.next("CATALOG");
        assertThat(catalog.get("bootstrap").get("gate").get("signingSecret").asString()).hasSize(64); // only over this channel
        assertThat(chA.next("USERS").get("users").get(0).get("fullName").asString()).isEqualTo("Caissière Une");
        chB.next("WELCOME");

        // A sells: the signed record is accepted, gets central's number, and lands in the database.
        UUID sale = UUID.randomUUID();
        UUID ticket = UUID.randomUUID();
        chA.send(push(a, 1, "SALE", saleEntry(sale, ticket)));
        JsonNode ack = chA.next("ACK").get("results").get(0);
        assertThat(ack.get("status").asString()).isEqualTo("ACCEPTED");
        assertThat(ack.get("referenceNumber").asString()).startsWith("NG-");
        assertThat(jdbc.queryForObject("SELECT terminal_id FROM sales.transaction WHERE id = ?", UUID.class, sale)).isEqualTo(a.id);

        // B, same gate, hears about A's ticket at once — it can admit it, or refuse a second entry.
        JsonNode feed = chB.next("FEED").get("events").get(0);
        assertThat(feed.get("type").asString()).isEqualTo("SALE");
        assertThat(feed.get("payload").get("tickets").get(0).get("id").asString()).isEqualTo(ticket.toString());

        // Resent after a lost ACK: recognised, not doubled.
        chA.send(push(a, 1, "SALE", saleEntry(sale, ticket)));
        assertThat(chA.next("ACK").get("results").get(0).get("status").asString()).isEqualTo("DUPLICATE");
        // A record skipping one: held back.
        chA.send(push(a, 3, "SALE", saleEntry(UUID.randomUUID(), UUID.randomUUID())));
        assertThat(chA.next("ACK").get("results").get(0).get("status").asString()).isEqualTo("GAP");
        // A record signed by another key: refused.
        String forged = push(a, 2, "SALE", saleEntry(UUID.randomUUID(), UUID.randomUUID())).replaceAll("\"sig\":\"[^\"]+\"", "\"sig\":\"" + sign(ecKeys(), "x") + "\"");
        chA.send(forged);
        assertThat(chA.next("ACK").get("results").get(0).get("status").asString()).isEqualTo("REJECTED");

        // A void at central reaches the gate's tills.
        HttpResponse<String> voided = http.send(HttpRequest.newBuilder(URI.create(base() + "/sales/transactions/" + sale + "/void"))
                .header("Authorization", "Bearer " + adminToken()).header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("{\"reason\":\"Erreur\"}")).build(), HttpResponse.BodyHandlers.ofString());
        assertThat(voided.statusCode()).isEqualTo(200);
        chB.send("{\"t\":\"FEED_ACK\",\"cursor\":" + feed.get("cursor").asLong() + "}");
        assertThat(chB.next("FEED").get("events").get(0).get("type").asString()).isEqualTo("SALE_VOIDED");

        // Revoked: cut off now, and refused on reconnection.
        HttpResponse<String> revoked = http.send(HttpRequest.newBuilder(URI.create(base() + "/sales/admin/devices/" + b.id + "/revoke"))
                .header("Authorization", "Bearer " + adminToken()).POST(HttpRequest.BodyPublishers.noBody()).build(), HttpResponse.BodyHandlers.ofString());
        assertThat(revoked.statusCode()).isEqualTo(204);
        assertThat(chB.closed.get(5, TimeUnit.SECONDS)).isEqualTo(4403);
        assertThat(b.tryConnect()).isFalse();
    }

    @Test
    void anEnrollmentCodeWorksOnceAndTheChannelNeedsACertificate() throws Exception {
        String code = createCode("Caisse X");
        KeyPair keys = ecKeys();
        assertThat(enrollRequest(UUID.randomUUID(), code, keys).statusCode()).isEqualTo(200);
        HttpResponse<String> again = enrollRequest(UUID.randomUUID(), code, ecKeys());
        assertThat(again.statusCode()).isEqualTo(403);
        assertThat(again.body()).contains("INVALID_CODE");

        HttpResponse<String> noCert = http.send(HttpRequest.newBuilder(URI.create(base() + "/edge/v1/ws")).GET().build(),
                HttpResponse.BodyHandlers.ofString());
        assertThat(noCert.statusCode()).isIn(400, 403); // not a usable channel without nginx's certificate check
        Throwable refused = null;
        try {
            http.newWebSocketBuilder().buildAsync(URI.create("ws://localhost:" + port + "/edge/v1/ws"), new WebSocket.Listener() {
            }).get(5, TimeUnit.SECONDS);
        } catch (Exception e) {
            refused = e;
        }
        assertThat(refused).isNotNull();
    }

    // ── tills ────────────────────────────────────────────────────────────

    class Till {
        final UUID id = UUID.randomUUID();
        final KeyPair keys = ecKeys();
        String certPem;
        int deviceNo;

        Channel connect() throws Exception {
            Channel ch = new Channel();
            ch.ws = http.newWebSocketBuilder()
                    .header("X-Client-Verify", "SUCCESS")
                    .header("X-Client-Cert", URLEncoder.encode(certPem, StandardCharsets.US_ASCII).replace("+", "%20"))
                    .buildAsync(URI.create("ws://localhost:" + port + "/edge/v1/ws"), ch).get(5, TimeUnit.SECONDS);
            ch.send("{\"t\":\"HELLO\",\"p\":1,\"appVersion\":\"test\",\"feedCursor\":0}");
            return ch;
        }

        boolean tryConnect() {
            try {
                connect().ws.sendClose(1000, "");
                return true;
            } catch (Exception e) {
                return false;
            }
        }
    }

    Till enroll(String label) throws Exception {
        Till t = new Till();
        HttpResponse<String> res = enrollRequest(t.id, createCode(label), t.keys);
        assertThat(res.statusCode()).as(res.body()).isEqualTo(200);
        JsonNode body = JSON.readTree(res.body());
        t.certPem = body.get("certificatePem").asString();
        t.deviceNo = body.get("deviceNo").asInt();
        return t;
    }

    static class Channel implements WebSocket.Listener {
        WebSocket ws;
        final LinkedBlockingQueue<JsonNode> frames = new LinkedBlockingQueue<>();
        final CompletableFuture<Integer> closed = new CompletableFuture<>();
        private final StringBuilder partial = new StringBuilder();

        @Override
        public CompletionStage<?> onText(WebSocket w, CharSequence data, boolean last) {
            partial.append(data);
            if (last) {
                frames.add(JSON.readTree(partial.toString()));
                partial.setLength(0);
            }
            w.request(1);
            return null;
        }

        @Override
        public CompletionStage<?> onClose(WebSocket w, int status, String reason) {
            closed.complete(status);
            return null;
        }

        void send(String text) {
            ws.sendText(text, true).join();
        }

        /** The next frame of this type (others are skipped). */
        JsonNode next(String type) throws InterruptedException {
            long until = System.nanoTime() + Duration.ofSeconds(10).toNanos();
            while (System.nanoTime() < until) {
                JsonNode f = frames.poll(200, TimeUnit.MILLISECONDS);
                if (f != null && f.get("t").asString().equals(type)) return f;
            }
            throw new AssertionError("No " + type + " frame received");
        }
    }

    String push(Till till, long seq, String type, String payload) throws Exception {
        String hlc = String.format("%013d-0000", System.currentTimeMillis());
        String signed = String.join("\u001f", till.id.toString(), Long.toString(seq), type, hlc, cashier.toString(), payload);
        return JSON.writeValueAsString(Map.of("t", "PUSH", "batchId", "b" + seq, "records", List.of(Map.of(
                "origin", till.id.toString(), "seq", seq, "type", type, "hlc", hlc, "actorUserId", cashier.toString(),
                "payload", payload, "sig", sign(till.keys, signed)))));
    }

    String saleEntry(UUID sale, UUID ticket) {
        return """
                {"idempotencyKey":"%s","paymentMethod":"CASH","createdAtClient":"%s",
                 "lines":[{"ticketTypeId":"%s","quantity":1,"unitPrice":2000}],
                 "tickets":[{"id":"%s","ticketTypeId":"%s","ticketNumber":"GATE-T-%s-0-0","qrSignature":"q"}]}"""
                .formatted(sale, Instant.now(), ticketType, ticket, ticketType, sale.toString().substring(0, 8)).replace("\n", "");
    }

    String createCode(String label) throws Exception {
        HttpResponse<String> res = http.send(HttpRequest.newBuilder(URI.create(base() + "/sales/admin/devices/enrollment-codes"))
                .header("Authorization", "Bearer " + adminToken()).header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("{\"gateId\":\"" + gate + "\",\"label\":\"" + label + "\"}")).build(),
                HttpResponse.BodyHandlers.ofString());
        assertThat(res.statusCode()).as(res.body()).isEqualTo(200);
        return JSON.readTree(res.body()).get("code").asString();
    }

    HttpResponse<String> enrollRequest(UUID deviceId, String code, KeyPair keys) throws Exception {
        var csr = new JcaPKCS10CertificationRequestBuilder(new X500Name("CN=" + deviceId), keys.getPublic())
                .build(new JcaContentSignerBuilder("SHA256withECDSA").build(keys.getPrivate()));
        String body = JSON.writeValueAsString(Map.of("deviceId", deviceId.toString(), "code", code,
                "csrPem", pem("CERTIFICATE REQUEST", csr.getEncoded()), "os", "test", "appVersion", "0.0.1"));
        return http.send(HttpRequest.newBuilder(URI.create(base() + "/sales/enroll/v1")).header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body)).build(), HttpResponse.BodyHandlers.ofString());
    }

    String adminToken() {
        return Jwts.builder().subject("admin").claim("userId", UUID.randomUUID().toString()).claim("role", "SUPER_ADMIN")
                .claim("fullName", "Admin").claim("establishmentId", establishment.toString())
                .expiration(new Date(System.currentTimeMillis() + 600_000))
                .signWith(Keys.hmacShaKeyFor(SECRET.getBytes(StandardCharsets.UTF_8))).compact();
    }

    String base() {
        return "http://localhost:" + port;
    }

    // ── crypto helpers ───────────────────────────────────────────────────

    static KeyPair ecKeys() {
        try {
            KeyPairGenerator g = KeyPairGenerator.getInstance("EC");
            g.initialize(new ECGenParameterSpec("secp256r1"));
            return g.generateKeyPair();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    static String sign(KeyPair keys, String text) throws Exception {
        Signature s = Signature.getInstance("SHA256withECDSA");
        s.initSign(keys.getPrivate());
        s.update(text.getBytes(StandardCharsets.UTF_8));
        return Base64.getEncoder().encodeToString(s.sign());
    }

    static X509Certificate caCert(String subject, KeyPair subjectKeys, String issuer, KeyPair issuerKeys) throws Exception {
        var b = new JcaX509v3CertificateBuilder(new X500Name(issuer), BigInteger.valueOf(System.nanoTime()),
                new Date(System.currentTimeMillis() - 60_000), new Date(System.currentTimeMillis() + 86_400_000L),
                new X500Name(subject), subjectKeys.getPublic());
        b.addExtension(Extension.basicConstraints, true, new BasicConstraints(true));
        b.addExtension(Extension.keyUsage, true, new KeyUsage(KeyUsage.keyCertSign | KeyUsage.cRLSign));
        return new JcaX509CertificateConverter().getCertificate(b.build(new JcaContentSignerBuilder("SHA256withECDSA").build(issuerKeys.getPrivate())));
    }

    static String pem(String type, byte[] der) {
        return "-----BEGIN " + type + "-----\n" + Base64.getMimeEncoder(64, "\n".getBytes()).encodeToString(der) + "\n-----END " + type + "-----\n";
    }
}
