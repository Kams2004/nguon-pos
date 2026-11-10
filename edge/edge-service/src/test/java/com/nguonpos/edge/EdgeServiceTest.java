package com.nguonpos.edge;

import com.nguonpos.edge.central.Uplink;
import com.nguonpos.synccore.qr.TicketPayload;
import com.nguonpos.synccore.qr.TicketSignatures;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The till's local server end to end: encrypted store, local API guard,
 * online-then-offline login, selling and scanning with no network, and
 * forwarding to central once it comes back — against a fake central that
 * can be switched off.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class EdgeServiceTest {

    static final String GATE_ID = "22222222-2222-4222-8222-222222222222";
    static final String GATE_CODE = "GATE-T";
    static final String SECRET = "5a".repeat(32);
    static final String TICKET_TYPE = "33333333-3333-4333-8333-333333333333";

    static Path dataDir;
    static HttpServer fakeCentral;
    static final AtomicBoolean centralUp = new AtomicBoolean(true);
    static final List<JsonNode> receivedSales = new CopyOnWriteArrayList<>();
    static final JsonMapper JSON = JsonMapper.builder().build();

    @LocalServerPort
    int port;

    @Autowired
    Uplink uplink;

    @Autowired
    com.nguonpos.edge.till.TillService till;

    @Autowired
    org.springframework.jdbc.core.JdbcTemplate jdbc;

    final HttpClient http = HttpClient.newHttpClient();

    @BeforeAll
    static void startFakeCentral() throws IOException {
        dataDir = Files.createTempDirectory("edge-test");
        fakeCentral = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        fakeCentral.createContext("/", EdgeServiceTest::central);
        fakeCentral.start();
    }

    @AfterAll
    static void stopFakeCentral() {
        fakeCentral.stop(0);
    }

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry r) {
        r.add("edge.data-dir", () -> dataDir.toString());
        r.add("edge.central-url", () -> "http://127.0.0.1:" + fakeCentral.getAddress().getPort());
        r.add("edge.key-provider", () -> "file");
        r.add("edge.sync-interval-ms", () -> "3600000"); // tests run the uplink themselves
        r.add("server.port", () -> "0");
        r.add("edge.peer-port", () -> "0"); // no LAN ports in tests
        r.add("edge.beacon-port", () -> "0");
    }

    @BeforeEach
    void centralBackOnline() {
        centralUp.set(true);
    }

    // ── Encryption at rest ───────────────────────────────────────────────

    @Test
    void theDatabaseFileIsUnreadableWithoutTheKey() throws Exception {
        String session = login("cashier1", "secret");
        JsonNode sale = sell(session, 1);
        String ticketNumber = sale.get("tickets").get(0).get("ticketNumber").asString();

        byte[] raw = Files.readAllBytes(dataDir.resolve("edge.db"));
        String asText = new String(raw, StandardCharsets.ISO_8859_1);
        assertThat(asText).doesNotStartWith("SQLite format 3");
        assertThat(asText).doesNotContain("cashier1").doesNotContain("Entrée").doesNotContain(ticketNumber);
    }

    // ── Local API guard ──────────────────────────────────────────────────

    @Test
    void theLocalApiOnlyAnswersTheInstalledApp() throws Exception {
        assertThat(send(HttpRequest.newBuilder(local("/local/v1/status")).GET(), null).statusCode()).isEqualTo(401); // no UI token
        assertThat(send(HttpRequest.newBuilder(local("/local/v1/status")).header("X-Edge-Ui-Token", "guess").GET(), null).statusCode())
                .isEqualTo(401);
        assertThat(send(withUi("/local/v1/status").header("Origin", "https://evil.example").GET(), null).statusCode()).isEqualTo(403);
        assertThat(send(withUi("/local/v1/status").header("Origin", "tauri://localhost").GET(), null).statusCode()).isEqualTo(200);
        assertThat(send(withUi("/local/v1/sales").GET(), null).statusCode()).isEqualTo(401); // no session
    }

    // ── Login ────────────────────────────────────────────────────────────

    @Test
    void aCashierWhoLoggedInOnceCanLogInOffline() throws Exception {
        assertThat(loginResponse("cashier1", "secret").get("verifiedOnline").asBoolean()).isTrue();

        centralUp.set(false);
        JsonNode offline = loginResponse("cashier1", "secret");
        assertThat(offline.get("verifiedOnline").asBoolean()).isFalse();
        assertThat(offline.get("user").get("fullName").asString()).isEqualTo("Caissier Test");

        assertThat(post("/local/v1/auth/login", null, "{\"username\":\"cashier1\",\"password\":\"wrong\"}").statusCode()).isEqualTo(401);
    }

    @Test
    void someoneWhoNeverLoggedInHereNeedsTheNetworkOnce() throws Exception {
        centralUp.set(false);
        HttpResponse<String> res = post("/local/v1/auth/login", null, "{\"username\":\"newcashier\",\"password\":\"secret\"}");
        assertThat(res.statusCode()).isEqualTo(503);
        assertThat(res.body()).contains("FIRST_LOGIN_NEEDS_NETWORK");
    }

    @Test
    void repeatedWrongPasswordsLockTheAccountForAWhile() throws Exception {
        for (int i = 0; i < 5; i++) post("/local/v1/auth/login", null, "{\"username\":\"brute\",\"password\":\"guess" + i + "\"}");
        assertThat(post("/local/v1/auth/login", null, "{\"username\":\"brute\",\"password\":\"guess\"}").statusCode()).isEqualTo(429);
    }

    // ── Selling and scanning offline ─────────────────────────────────────

    @Test
    void sellsAndScansWithNoNetwork() throws Exception {
        String session = login("cashier1", "secret");
        centralUp.set(false);

        JsonNode sale = sell(session, 2);
        assertThat(sale.get("total").decimalValue()).isEqualByComparingTo("4000"); // catalog price, not the screen's
        assertThat(sale.get("localReference").asString()).startsWith(GATE_CODE + "-");
        JsonNode tickets = sale.get("tickets");
        assertThat(tickets).hasSize(2);
        String qr = tickets.get(0).get("qrContent").asString();
        assertThat(TicketSignatures.verify(qr, SECRET).ok()).isTrue(); // same signature format as browser tills

        assertThat(scan(session, qr)).isEqualTo("ACCEPTED");
        assertThat(scan(session, qr)).isEqualTo("ALREADY_REDEEMED");
        assertThat(scan(session, TicketSignatures.sign(payload(UUID.randomUUID().toString(), GATE_CODE), "11".repeat(32))))
                .isEqualTo("INVALID_SIGNATURE");
        assertThat(scan(session, TicketSignatures.sign(payload(UUID.randomUUID().toString(), "GATE-OTHER"), SECRET))).isEqualTo("WRONG_GATE");
        assertThat(scan(session, TicketSignatures.sign(payload(UUID.randomUUID().toString(), GATE_CODE), SECRET))).isEqualTo("NOT_RECOGNIZED");
    }

    // ── Tills of the gate over the LAN (milestone 5) ─────────────────────

    @Test
    void twoTillsThatLetTheSameTicketInWhileCutOffAgreeOnWhichEntryCounts() throws Exception {
        String session = login("cashier1", "secret");
        JsonNode ticket = sell(session, 1).get("tickets").get(0);
        String ticketId = ticket.get("id").asString();
        assertThat(scan(session, ticket.get("qrContent").asString())).isEqualTo("ACCEPTED");

        // Another till let the same ticket in a little earlier (smaller hybrid clock), unaware of this one.
        String peerScan = """
                {"clientScanId":"%s","ticketId":"%s","scannedAt":"2026-01-01T00:00:00Z","localDecision":"ACCEPTED"}"""
                .formatted(UUID.randomUUID(), ticketId);
        till.applyPeerScan("peer-till", "0000000001000-0000", "u2", JSON.readTree(peerScan));
        till.applyPeerScan("peer-till", "0000000001000-0000", "u2", JSON.readTree(peerScan)); // received twice: no change

        // Both tills agree: the peer's scan is the entry, this till's is the second entry.
        assertThat(jdbc.queryForList("SELECT origin FROM scan WHERE ticket_id = ? AND decision = 'ACCEPTED' AND duplicate = 0", String.class, ticketId))
                .containsExactly("peer-till");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM scan WHERE ticket_id = ? AND duplicate = 1", Integer.class, ticketId)).isEqualTo(1);
    }

    @Test
    void aTicketScannedElsewhereBeforeItsSaleArrivesIsAlreadyUsedWhenItDoes() throws Exception {
        String session = login("cashier1", "secret");
        String ticketId = UUID.randomUUID().toString();
        String qr = TicketSignatures.sign(payload(ticketId, GATE_CODE), SECRET);
        // The other till's records travel separately: its scan comes in first…
        till.applyPeerScan("peer-till", "0000000002000-0000", "u2", JSON.readTree("""
                {"clientScanId":"%s","ticketId":"%s","scannedAt":"2026-01-01T00:00:05Z","localDecision":"ACCEPTED"}"""
                .formatted(UUID.randomUUID(), ticketId)));
        // …then its sale.
        till.applyPeerSale("u2", JSON.readTree("""
                {"idempotencyKey":"%s","paymentMethod":"CASH","createdAtClient":"2026-01-01T00:00:00Z",
                 "lines":[{"ticketTypeId":"%s","quantity":1,"unitPrice":2000}],
                 "tickets":[{"id":"%s","ticketTypeId":"%s","ticketNumber":"GATE-T-lan-0-0","qrSignature":"%s"}]}"""
                .formatted(UUID.randomUUID(), TICKET_TYPE, ticketId, TICKET_TYPE, qr)));
        assertThat(scan(session, qr)).isEqualTo("ALREADY_REDEEMED");
    }

    @Test
    void theSameSaleRequestSentTwiceIsOneSale() throws Exception {
        String session = login("cashier1", "secret");
        String body = saleBody(UUID.randomUUID(), 1);
        JsonNode first = JSON.readTree(post("/local/v1/sales", session, body).body());
        JsonNode second = JSON.readTree(post("/local/v1/sales", session, body).body());
        assertThat(second.get("id").asString()).isEqualTo(first.get("id").asString());
    }

    @Test
    void salesMadeOfflineReachCentralWhenItIsBack() throws Exception {
        String session = login("cashier1", "secret");
        centralUp.set(false);
        JsonNode sale = sell(session, 1);
        String saleId = sale.get("id").asString();
        uplink.run();
        assertThat(receivedSales).noneMatch(e -> e.get("idempotencyKey").asString().equals(saleId));

        centralUp.set(true);
        uplink.run();

        JsonNode sent = receivedSales.stream().filter(e -> e.get("idempotencyKey").asString().equals(saleId)).findFirst().orElseThrow();
        assertThat(sent.get("tickets").get(0).get("qrSignature").asString()).isEqualTo(sale.get("tickets").get(0).get("qrContent").asString());
        JsonNode after = JSON.readTree(send(withUi("/local/v1/sales/" + saleId).header("Authorization", "Bearer " + session).GET(), null).body());
        assertThat(after.get("centralReference").asString()).startsWith("NG-");
    }

    // ── Per-till printer settings ────────────────────────────────────────

    @Test
    void printerSettingsAreKeptPerTill() throws Exception {
        String session = login("cashier1", "secret");
        String settings = "{\"printerName\":\"EPSON TM-T20\",\"paperWidth\":58,\"autoPrint\":\"ALL\",\"copies\":2,\"offsetMm\":-2}";
        assertThat(send(withUi("/local/v1/settings/printer").header("Authorization", "Bearer " + session)
                .header("Content-Type", "application/json").PUT(HttpRequest.BodyPublishers.ofString(settings)), null).statusCode()).isEqualTo(200);
        JsonNode read = JSON.readTree(send(withUi("/local/v1/settings/printer").header("Authorization", "Bearer " + session).GET(), null).body());
        assertThat(read.get("printerName").asString()).isEqualTo("EPSON TM-T20");
        assertThat(read.get("paperWidth").asInt()).isEqualTo(58);

        String bad = settings.replace("\"paperWidth\":58", "\"paperWidth\":60");
        assertThat(send(withUi("/local/v1/settings/printer").header("Authorization", "Bearer " + session)
                .header("Content-Type", "application/json").PUT(HttpRequest.BodyPublishers.ofString(bad)), null).statusCode()).isEqualTo(400);
    }

    // ── helpers ──────────────────────────────────────────────────────────

    String login(String user, String password) throws Exception {
        return loginResponse(user, password).get("token").asString();
    }

    JsonNode loginResponse(String user, String password) throws Exception {
        HttpResponse<String> res = post("/local/v1/auth/login", null,
                "{\"username\":\"" + user + "\",\"password\":\"" + password + "\"}");
        assertThat(res.statusCode()).as(res.body()).isEqualTo(200);
        return JSON.readTree(res.body());
    }

    JsonNode sell(String session, int quantity) throws Exception {
        HttpResponse<String> res = post("/local/v1/sales", session, saleBody(UUID.randomUUID(), quantity));
        assertThat(res.statusCode()).as(res.body()).isEqualTo(200);
        return JSON.readTree(res.body());
    }

    static String saleBody(UUID requestId, int quantity) {
        return "{\"clientRequestId\":\"" + requestId + "\",\"paymentMethod\":\"CASH\",\"lines\":[{\"ticketTypeId\":\"" + TICKET_TYPE
                + "\",\"quantity\":" + quantity + "}]}";
    }

    String scan(String session, String qr) throws Exception {
        HttpResponse<String> res = post("/local/v1/scans", session, JSON.writeValueAsString(java.util.Map.of("qrContent", qr)));
        assertThat(res.statusCode()).as(res.body()).isEqualTo(200);
        return JSON.readTree(res.body()).get("result").asString();
    }

    static TicketPayload payload(String ticketId, String gateCode) {
        return new TicketPayload(1, ticketId, gateCode, TICKET_TYPE, UUID.randomUUID().toString(), gateCode + "-x-0-0", Instant.now().toString());
    }

    HttpResponse<String> post(String path, String session, String json) throws Exception {
        HttpRequest.Builder b = withUi(path).header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofString(json));
        if (session != null) b.header("Authorization", "Bearer " + session);
        return send(b, null);
    }

    HttpRequest.Builder withUi(String path) throws IOException {
        return HttpRequest.newBuilder(local(path)).header("X-Edge-Ui-Token", Files.readString(dataDir.resolve("ui-token")).strip());
    }

    URI local(String path) {
        return URI.create("http://127.0.0.1:" + port + path);
    }

    HttpResponse<String> send(HttpRequest.Builder b, Object ignored) throws Exception {
        return http.send(b.build(), HttpResponse.BodyHandlers.ofString());
    }

    // ── fake central ─────────────────────────────────────────────────────

    static void central(HttpExchange ex) throws IOException {
        if (!centralUp.get()) {
            respond(ex, 503, "{}");
            return;
        }
        String path = ex.getRequestURI().getPath();
        String body = new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        switch (path) {
            case "/api/auth/auth/login" -> {
                JsonNode req = JSON.readTree(body);
                if (req.get("username").asString().equals("cashier1") && req.get("password").asString().equals("secret")) {
                    String claims = Base64.getUrlEncoder().withoutPadding()
                            .encodeToString(("{\"exp\":" + (Instant.now().getEpochSecond() + 3600) + "}").getBytes(StandardCharsets.UTF_8));
                    respond(ex, 200, """
                            {"token":"h.%s.s","userId":"11111111-1111-4111-8111-111111111111","username":"cashier1",
                             "fullName":"Caissier Test","role":"CASHIER","establishmentId":"e","assignedGateId":"%s"}"""
                            .formatted(claims, GATE_ID));
                } else {
                    respond(ex, 401, "{\"message\":\"bad\"}");
                }
            }
            case "/api/catalog/catalog/bootstrap" -> respond(ex, 200, """
                    {"establishment":{"id":"e","name":"Festival Test","receiptMode":"INDIVIDUAL_TICKETS"},
                     "gate":{"id":"%s","name":"Porte Test","code":"%s","signingSecret":"%s"},
                     "ticketTypes":[{"id":"%s","name":"Entrée","price":2000,"currency":"XAF","printMode":"INDIVIDUAL","icon":null,"color":null}]}"""
                    .formatted(GATE_ID, GATE_CODE, SECRET, TICKET_TYPE));
            case "/api/sales/sales/sync/transactions" -> {
                StringBuilder results = new StringBuilder();
                for (JsonNode e : JSON.readTree(body).get("entries")) {
                    receivedSales.add(e);
                    if (!results.isEmpty()) results.append(',');
                    results.append("{\"idempotencyKey\":\"").append(e.get("idempotencyKey").asString())
                            .append("\",\"status\":\"ACCEPTED\",\"referenceNumber\":\"NG-").append(String.format("%06d", receivedSales.size())).append("\"}");
                }
                respond(ex, 200, "{\"results\":[" + results + "]}");
            }
            case "/api/sales/sales/sync/scans" -> {
                StringBuilder results = new StringBuilder();
                for (JsonNode e : JSON.readTree(body).get("entries")) {
                    if (!results.isEmpty()) results.append(',');
                    results.append("{\"clientScanId\":\"").append(e.get("clientScanId").asString()).append("\",\"syncStatus\":\"ACCEPTED\",\"scanResult\":\"ACCEPTED\"}");
                }
                respond(ex, 200, "{\"results\":[" + results + "]}");
            }
            case "/api/sales/sales/sync/heartbeat" -> respond(ex, 200, "");
            default -> respond(ex, 404, "{}");
        }
    }

    static void respond(HttpExchange ex, int status, String body) throws IOException {
        byte[] b = body.getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().add("Content-Type", "application/json");
        ex.sendResponseHeaders(status, b.length == 0 ? -1 : b.length);
        if (b.length > 0) ex.getResponseBody().write(b);
        ex.close();
    }
}
