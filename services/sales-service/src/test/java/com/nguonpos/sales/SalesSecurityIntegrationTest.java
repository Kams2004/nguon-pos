package com.nguonpos.sales;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.jdbc.core.JdbcTemplate;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * End-to-end against a real Postgres: offline sync must never duplicate a
 * sale or a scan, a till can't redeem another establishment's ticket, and
 * user input in queries is data, never SQL.
 */
@Testcontainers
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = "jwt.signing-secret=" + SalesSecurityIntegrationTest.SECRET)
class SalesSecurityIntegrationTest {

    static final String SECRET = "integration-test-secret-integration-test-secret-0123456789";

    @Container
    @ServiceConnection
    static PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:16-alpine");

    @LocalServerPort
    int port;

    @Autowired
    JdbcTemplate jdbc;

    final HttpClient http = HttpClient.newHttpClient();
    final UUID establishment = UUID.randomUUID();
    final UUID gate = UUID.randomUUID();
    final UUID terminal = UUID.randomUUID();
    final UUID ticketType = UUID.randomUUID();

    @BeforeEach
    void otherServicesSchemas() {
        // The journal reads all three services' audit tables; in this
        // sales-only database the other two exist but stay empty.
        for (String schema : new String[]{"auth", "catalog"}) {
            jdbc.execute("CREATE SCHEMA IF NOT EXISTS " + schema);
            jdbc.execute("CREATE TABLE IF NOT EXISTS " + schema + ".audit_log (LIKE sales.audit_log INCLUDING ALL)");
        }
    }

    // ── Offline sync idempotency ─────────────────────────────────────────

    @Test
    void sameSaleSentTwiceIsStoredOnce() throws Exception {
        UUID sale = UUID.randomUUID();
        String body = saleBatch(sale, UUID.randomUUID(), UUID.randomUUID());

        HttpResponse<String> first = post("/sales/sync/transactions", cashierToken(establishment), body);
        HttpResponse<String> second = post("/sales/sync/transactions", cashierToken(establishment), body);

        assertThat(first.statusCode()).isEqualTo(200);
        assertThat(first.body()).contains("\"ACCEPTED\"");
        assertThat(second.statusCode()).isEqualTo(200);
        assertThat(second.body()).contains("\"DUPLICATE_IGNORED\"");
        assertThat(count("SELECT count(*) FROM sales.transaction WHERE id = ?", sale)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM sales.ticket WHERE transaction_id = ?", sale)).isEqualTo(2);
    }

    @Test
    void sameScanSentTwiceIsStoredOnceAndASecondEntryIsRefused() throws Exception {
        UUID ticket = UUID.randomUUID();
        post("/sales/sync/transactions", cashierToken(establishment), saleBatch(UUID.randomUUID(), ticket, UUID.randomUUID()));

        UUID scan = UUID.randomUUID();
        String body = scanBatch(scan, ticket);
        assertThat(post("/sales/sync/scans", cashierToken(establishment), body).body()).contains("\"scanResult\":\"ACCEPTED\"");
        assertThat(post("/sales/sync/scans", cashierToken(establishment), body).body()).contains("\"DUPLICATE_IGNORED\"");
        assertThat(count("SELECT count(*) FROM sales.entry_scan WHERE id = ?", scan)).isEqualTo(1);

        // Another till scanning the same ticket later: refused, and recorded.
        String again = post("/sales/sync/scans", cashierToken(establishment), scanBatch(UUID.randomUUID(), ticket)).body();
        assertThat(again).contains("REJECTED_ALREADY_REDEEMED");
        assertThat(count("SELECT count(*) FROM sales.entry_scan WHERE ticket_id = ?", ticket)).isEqualTo(2);
    }

    @Test
    void aTicketOfAnotherEstablishmentCannotBeRedeemed() throws Exception {
        UUID ticket = UUID.randomUUID();
        post("/sales/sync/transactions", cashierToken(establishment), saleBatch(UUID.randomUUID(), ticket, UUID.randomUUID()));

        String res = post("/sales/sync/scans", cashierToken(UUID.randomUUID()), scanBatch(UUID.randomUUID(), ticket)).body();

        assertThat(res).contains("REJECTED_UNKNOWN_TICKET");
        assertThat(jdbc.queryForObject("SELECT status FROM sales.ticket WHERE id = ?", String.class, ticket)).isEqualTo("ISSUED");
    }

    @Test
    void negativeQuantitiesAreRejected() throws Exception {
        String body = saleBatch(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID()).replace("\"quantity\":2", "\"quantity\":-2");
        assertThat(post("/sales/sync/transactions", cashierToken(establishment), body).statusCode()).isEqualTo(400);
    }

    // ── Gate, voids, scans that arrive before their sale ─────────────────

    @Test
    void aTillCannotReportForAGateItsUserIsNotAssignedTo() throws Exception {
        String sale = saleBatch(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID()).replace(gate.toString(), UUID.randomUUID().toString());
        assertThat(post("/sales/sync/transactions", cashierToken(establishment), sale).statusCode()).isEqualTo(403);

        String scan = scanBatch(UUID.randomUUID(), UUID.randomUUID()).replace(gate.toString(), UUID.randomUUID().toString());
        assertThat(post("/sales/sync/scans", cashierToken(establishment), scan).statusCode()).isEqualTo(403);
    }

    @Test
    void aVoidedSalesTicketsNoLongerAdmit() throws Exception {
        UUID sale = UUID.randomUUID();
        UUID ticket = UUID.randomUUID();
        post("/sales/sync/transactions", cashierToken(establishment), saleBatch(sale, ticket, UUID.randomUUID()));

        HttpResponse<String> voided = post("/sales/transactions/" + sale + "/void", adminToken(), "{\"reason\":\"Erreur de saisie\"}");
        assertThat(voided.statusCode()).isEqualTo(200);
        assertThat(jdbc.queryForObject("SELECT status FROM sales.ticket WHERE id = ?", String.class, ticket)).isEqualTo("VOIDED");

        String res = post("/sales/sync/scans", cashierToken(establishment), scanBatch(UUID.randomUUID(), ticket)).body();
        assertThat(res).contains("REJECTED_VOIDED");
    }

    @Test
    void anotherEstablishmentCannotVoidASale() throws Exception {
        UUID sale = UUID.randomUUID();
        post("/sales/sync/transactions", cashierToken(establishment), saleBatch(sale, UUID.randomUUID(), UUID.randomUUID()));

        String foreignAdmin = token("SUPER_ADMIN", UUID.randomUUID());
        assertThat(post("/sales/transactions/" + sale + "/void", foreignAdmin, "{\"reason\":\"x\"}").statusCode()).isEqualTo(404);
        assertThat(jdbc.queryForObject("SELECT status FROM sales.transaction WHERE id = ?", String.class, sale)).isEqualTo("COMPLETED");
    }

    @Test
    void scansThatArriveBeforeTheirSaleAreSettledWhenItArrives() throws Exception {
        UUID ticket = UUID.randomUUID();
        UUID first = UUID.randomUUID();
        UUID second = UUID.randomUUID();
        // Another till's scans reach central before the selling till has synced.
        String early = scanBatch(first, ticket).replace(Instant.now().toString().substring(0, 4), "2026");
        assertThat(post("/sales/sync/scans", cashierToken(establishment), early).body()).contains("PENDING_TICKET");
        assertThat(post("/sales/sync/scans", cashierToken(establishment), scanBatch(second, ticket)).body()).contains("PENDING_TICKET");

        post("/sales/sync/transactions", cashierToken(establishment), saleBatch(UUID.randomUUID(), ticket, UUID.randomUUID()));

        assertThat(jdbc.queryForObject("SELECT result FROM sales.entry_scan WHERE id = ?", String.class, first)).isEqualTo("ACCEPTED");
        assertThat(jdbc.queryForObject("SELECT result FROM sales.entry_scan WHERE id = ?", String.class, second)).isEqualTo("REJECTED_ALREADY_REDEEMED");
        assertThat(jdbc.queryForObject("SELECT status FROM sales.ticket WHERE id = ?", String.class, ticket)).isEqualTo("REDEEMED");
    }

    // ── SQL injection ────────────────────────────────────────────────────

    @ParameterizedTest
    @ValueSource(strings = {
            "'; DROP TABLE sales.audit_log; --",
            "' OR '1'='1",
            "x' UNION SELECT id, occurred_at, service, category, action, actor_user_id, actor_name, entity_type, entity_id, summary FROM sales.audit_log --",
            "\\'; SELECT pg_sleep(5); --",
            "%' AND 1=1 --"
    })
    void journalSearchTreatsInputAsText(String payload) throws Exception {
        audit("Vente NG-000001 synchronisée");
        long before = count("SELECT count(*) FROM sales.audit_log");

        long start = System.nanoTime();
        HttpResponse<String> res = get("/sales/admin/audit?q=" + enc(payload), adminToken());

        assertThat(res.statusCode()).isEqualTo(200);
        assertThat(res.body()).contains("\"totalElements\":0");
        assertThat(System.nanoTime() - start).isLessThan(4_000_000_000L); // pg_sleep never ran
        assertThat(count("SELECT count(*) FROM sales.audit_log")).isEqualTo(before); // table intact
    }

    @Test
    void journalSearchMatchesWildcardsLiterally() throws Exception {
        audit("Remise de 10% appliquée");
        audit("Remise de 10x appliquée");

        // As wildcards, "10%" and "10_" would match both rows; matched literally,
        // only the first contains "10%" and neither contains "10_".
        assertThat(get("/sales/admin/audit?q=" + enc("Remise de 10%"), adminToken()).body()).contains("\"totalElements\":1");
        assertThat(get("/sales/admin/audit?q=" + enc("Remise de 10_"), adminToken()).body()).contains("\"totalElements\":0");
    }

    @Test
    void journalCategoryOutsideTheKnownListIsRefused() throws Exception {
        assertThat(get("/sales/admin/audit?category=" + enc("SALE' OR '1'='1"), adminToken()).statusCode()).isEqualTo(400);
        assertThat(get("/sales/admin/audit?category=SALE", adminToken()).statusCode()).isEqualTo(200);
    }

    @Test
    void typedFiltersRejectNonUuidInput() throws Exception {
        assertThat(get("/sales/transactions?gateId=" + enc("1' OR '1'='1"), adminToken()).statusCode()).isEqualTo(400);
        assertThat(get("/sales/admin/scans?result=" + enc("ACCEPTED' --"), adminToken()).statusCode()).isEqualTo(400);
    }

    @Test
    void adminEndpointsNeedAnAdminToken() throws Exception {
        assertThat(get("/sales/admin/audit", null).statusCode()).isIn(401, 403);
        assertThat(get("/sales/admin/audit", cashierToken(establishment)).statusCode()).isEqualTo(403);
        assertThat(get("/sales/admin/scans", cashierToken(establishment)).statusCode()).isEqualTo(403);
    }

    // ── helpers ──────────────────────────────────────────────────────────

    String saleBatch(UUID sale, UUID ticket1, UUID ticket2) {
        String n = sale.toString().substring(0, 8);
        return """
                {"terminalId":"%s","gateId":"%s","entries":[{"idempotencyKey":"%s","paymentMethod":"CASH","createdAtClient":"%s",
                 "lines":[{"ticketTypeId":"%s","quantity":2,"unitPrice":2000}],
                 "tickets":[{"id":"%s","ticketTypeId":"%s","ticketNumber":"T-%s-1","qrSignature":"sig"},
                            {"id":"%s","ticketTypeId":"%s","ticketNumber":"T-%s-2","qrSignature":"sig"}]}]}
                """.formatted(terminal, gate, sale, Instant.now(), ticketType, ticket1, ticketType, n, ticket2, ticketType, n);
    }

    String scanBatch(UUID scan, UUID ticket) {
        return """
                {"terminalId":"%s","gateId":"%s","entries":[{"clientScanId":"%s","ticketId":"%s","scannedAt":"%s"}]}
                """.formatted(terminal, gate, scan, ticket, Instant.now());
    }

    void audit(String summary) {
        jdbc.update("INSERT INTO sales.audit_log (service, category, action, actor_name, summary) VALUES ('sales', 'SALE', 'TEST', 'Test', ?)", summary);
    }

    long count(String sql, Object... args) {
        Long n = jdbc.queryForObject(sql, Long.class, args);
        return n == null ? 0 : n;
    }

    String cashierToken(UUID establishmentId) {
        return token("CASHIER", establishmentId);
    }

    String adminToken() {
        return token("SUPER_ADMIN", establishment);
    }

    String token(String role, UUID establishmentId) {
        return Jwts.builder()
                .subject("test-" + role.toLowerCase())
                .claim("userId", UUID.randomUUID().toString())
                .claim("role", role)
                .claim("fullName", "Test " + role)
                .claim("establishmentId", establishmentId.toString())
                .claim("assignedGateId", gate.toString())
                .expiration(new Date(System.currentTimeMillis() + 600_000))
                .signWith(Keys.hmacShaKeyFor(SECRET.getBytes(StandardCharsets.UTF_8)))
                .compact();
    }

    HttpResponse<String> post(String path, String token, String json) throws Exception {
        return http.send(request(path, token).POST(HttpRequest.BodyPublishers.ofString(json)).build(), HttpResponse.BodyHandlers.ofString());
    }

    HttpResponse<String> get(String path, String token) throws Exception {
        return http.send(request(path, token).GET().build(), HttpResponse.BodyHandlers.ofString());
    }

    HttpRequest.Builder request(String path, String token) {
        HttpRequest.Builder b = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path)).header("Content-Type", "application/json");
        return token == null ? b : b.header("Authorization", "Bearer " + token);
    }

    static String enc(String s) {
        return URLEncoder.encode(s, StandardCharsets.UTF_8);
    }
}
