package com.nguonpos.edge.till;

import com.nguonpos.edge.core.Catalog;
import com.nguonpos.edge.core.DeviceIdentity;
import com.nguonpos.edge.core.EventLog;
import com.nguonpos.edge.core.LiveEvents;
import com.nguonpos.edge.core.LocalAuth.LocalUser;
import com.nguonpos.edge.core.Meta;
import com.nguonpos.synccore.qr.TicketPayload;
import com.nguonpos.synccore.qr.TicketSignatures;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Selling and scanning at this till, entirely against the local database.
 * Golden rule (docs/SYNC_PROTOCOL.md): a sale is only confirmed — and so only
 * printed — once its rows and its event-log record are committed together.
 */
@Service
public class TillService {

    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final Catalog catalog;
    private final EventLog log;
    private final Meta meta;
    private final DeviceIdentity device;
    private final LiveEvents live;
    private final JsonMapper json;

    public TillService(JdbcTemplate jdbc, TransactionTemplate tx, Catalog catalog, EventLog log, Meta meta, DeviceIdentity device,
                       LiveEvents live, JsonMapper json) {
        this.jdbc = jdbc;
        this.tx = tx;
        this.catalog = catalog;
        this.log = log;
        this.meta = meta;
        this.device = device;
        this.live = live;
        this.json = json;
    }

    // ── Sales ────────────────────────────────────────────────────────────

    public Sale sell(LocalUser cashier, SaleRequest req) {
        // Same request sent twice (double click, retry after a timeout): same sale.
        Optional<String> existing = jdbc.queryForList("SELECT id FROM sale WHERE client_request_id = ?", String.class,
                req.clientRequestId().toString()).stream().findFirst();
        if (existing.isPresent()) return sale(existing.get()).orElseThrow();

        Catalog.GateInfo gate = catalog.gate().orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "NO_CATALOG"));
        String secret = catalog.signingSecret().orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "NO_CATALOG"));

        // Prices come from the gate's catalog on this till, never from the screen.
        List<PricedLine> lines = new ArrayList<>();
        for (SaleRequest.Line l : req.lines()) {
            Catalog.TicketType type = catalog.ticketType(l.ticketTypeId())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "UNKNOWN_TICKET_TYPE"));
            lines.add(new PricedLine(type, l.quantity()));
        }
        String currency = lines.getFirst().type().currency();
        BigDecimal total = lines.stream().map(p -> p.type().price().multiply(BigDecimal.valueOf(p.quantity())))
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        String saleId = UUID.randomUUID().toString();
        String createdAt = Instant.now().toString();
        String shortId = saleId.substring(0, saleId.indexOf('-'));

        List<Map<String, Object>> ticketEntries = new ArrayList<>();
        List<Ticket> tickets = new ArrayList<>();
        for (int li = 0; li < lines.size(); li++) {
            PricedLine pl = lines.get(li);
            for (int u = 0; u < pl.quantity(); u++) {
                String ticketId = UUID.randomUUID().toString();
                String number = gate.code() + "-" + shortId + "-" + li + "-" + u;
                String qr = TicketSignatures.sign(new TicketPayload(1, ticketId, gate.code(), pl.type().id(), saleId, number, createdAt), secret);
                tickets.add(new Ticket(ticketId, pl.type().id(), pl.type().name(), number, qr, "ISSUED"));
                ticketEntries.add(Map.of("id", ticketId, "ticketTypeId", pl.type().id(), "ticketNumber", number, "qrSignature", qr));
            }
        }

        tx.executeWithoutResult(s -> {
            long counter = meta.increment("sale_counter");
            String localRef = String.format("%s-%s-%06d", gate.code(), device.shortCode(), counter);
            jdbc.update("""
                    INSERT INTO sale (id, client_request_id, local_reference, cashier_user_id, payment_method, total, currency, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)""", saleId, req.clientRequestId().toString(), localRef, cashier.id(),
                    req.paymentMethod(), total.toPlainString(), currency, createdAt);
            for (int li = 0; li < lines.size(); li++) {
                PricedLine pl = lines.get(li);
                jdbc.update("INSERT INTO sale_line (sale_id, line_no, ticket_type_id, name, quantity, unit_price) VALUES (?, ?, ?, ?, ?, ?)",
                        saleId, li, pl.type().id(), pl.type().name(), pl.quantity(), pl.type().price().toPlainString());
            }
            for (Ticket t : tickets) {
                jdbc.update("INSERT INTO ticket (id, sale_id, ticket_type_id, ticket_number, qr, status) VALUES (?, ?, ?, ?, ?, 'ISSUED')",
                        t.id(), saleId, t.ticketTypeId(), t.ticketNumber(), t.qrContent());
            }
            // Same shape as central's SaleSyncRequest.SaleEntry, so the uplink sends it as is.
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("idempotencyKey", saleId);
            entry.put("paymentMethod", req.paymentMethod());
            entry.put("createdAtClient", createdAt);
            entry.put("lines", lines.stream().map(pl -> Map.of("ticketTypeId", pl.type().id(), "quantity", pl.quantity(),
                    "unitPrice", pl.type().price())).toList());
            entry.put("tickets", ticketEntries);
            log.append(EventLog.SALE, cashier.id(), json.writeValueAsString(entry));
        });
        live.publish("SALE_CREATED", Map.of("id", saleId));
        return sale(saleId).orElseThrow();
    }

    public List<SaleSummary> recentSales(int limit) {
        return jdbc.query("""
                SELECT s.id, s.local_reference, s.central_reference, s.payment_method, s.total, s.currency, s.created_at,
                       (SELECT COUNT(*) FROM ticket t WHERE t.sale_id = s.id),
                       (SELECT e.uplink_status FROM event_log e WHERE e.type = 'SALE' AND json_extract(e.payload, '$.idempotencyKey') = s.id)
                FROM sale s ORDER BY s.created_at DESC LIMIT ?""",
                (rs, i) -> new SaleSummary(rs.getString(1), rs.getString(2), rs.getString(3), rs.getString(4),
                        new BigDecimal(rs.getString(5)), rs.getString(6), rs.getString(7), rs.getInt(8), "ACKED".equals(rs.getString(9))),
                Math.min(Math.max(limit, 1), 500));
    }

    public Optional<Sale> sale(String id) {
        List<Sale> sales = jdbc.query("""
                SELECT id, local_reference, central_reference, cashier_user_id, payment_method, total, currency, created_at
                FROM sale WHERE id = ?""", (rs, i) -> new Sale(rs.getString(1), rs.getString(2), rs.getString(3), rs.getString(4),
                rs.getString(5), new BigDecimal(rs.getString(6)), rs.getString(7), rs.getString(8),
                jdbc.query("SELECT ticket_type_id, name, quantity, unit_price FROM sale_line WHERE sale_id = ? ORDER BY line_no",
                        (r, j) -> new Line(r.getString(1), r.getString(2), r.getInt(3), new BigDecimal(r.getString(4))), id),
                jdbc.query("""
                        SELECT t.id, t.ticket_type_id, l.name, t.ticket_number, t.qr, t.status FROM ticket t
                        JOIN sale_line l ON l.sale_id = t.sale_id AND l.ticket_type_id = t.ticket_type_id
                        WHERE t.sale_id = ? ORDER BY t.ticket_number""",
                        (r, j) -> new Ticket(r.getString(1), r.getString(2), r.getString(3), r.getString(4), r.getString(5), r.getString(6)), id)),
                id);
        return sales.stream().findFirst();
    }

    // ── Scans ────────────────────────────────────────────────────────────

    /**
     * Checks a presented QR code, in the order of docs/QR_TICKET_SPEC.md:
     * signature, gate, known ticket, then its status. Only an admission or a
     * refused re-use is recorded and forwarded — a forged or foreign code
     * never reached a ticket.
     */
    public ScanResult scan(LocalUser controller, String qrContent) {
        Catalog.GateInfo gate = catalog.gate().orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "NO_CATALOG"));
        String secret = catalog.signingSecret().orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "NO_CATALOG"));

        TicketSignatures.Verification v = TicketSignatures.verify(qrContent, secret);
        if (!v.ok()) return ScanResult.of("INVALID_SIGNATURE");
        if (!gate.code().equals(v.payload().gw())) return ScanResult.of("WRONG_GATE");

        String ticketId = v.payload().tid();
        return tx.execute(s -> {
            List<String[]> rows = jdbc.query("SELECT status, redeemed_at, ticket_number FROM ticket WHERE id = ?",
                    (rs, i) -> new String[]{rs.getString(1), rs.getString(2), rs.getString(3)}, ticketId);
            if (rows.isEmpty()) return ScanResult.of("NOT_RECOGNIZED");
            String status = rows.getFirst()[0];
            String number = rows.getFirst()[2];
            if (status.equals("VOIDED")) return new ScanResult("VOIDED", number, null);

            String scanId = UUID.randomUUID().toString();
            String now = Instant.now().toString();
            String decision = status.equals("ISSUED") ? "ACCEPTED" : "ALREADY_REDEEMED";
            if (decision.equals("ACCEPTED")) {
                jdbc.update("UPDATE ticket SET status = 'REDEEMED', redeemed_at = ? WHERE id = ?", now, ticketId);
            }
            jdbc.update("INSERT INTO scan (id, ticket_id, scanned_by, scanned_at, decision) VALUES (?, ?, ?, ?, ?)",
                    scanId, ticketId, controller.id(), now, decision);
            Map<String, Object> entry = Map.of("clientScanId", scanId, "ticketId", ticketId, "scannedAt", now, "localDecision", decision);
            log.append(EventLog.SCAN, controller.id(), json.writeValueAsString(entry));
            return new ScanResult(decision, number, decision.equals("ACCEPTED") ? now : rows.getFirst()[1]);
        });
    }

    // ── Shapes ───────────────────────────────────────────────────────────

    public record SaleRequest(
            @jakarta.validation.constraints.NotNull UUID clientRequestId,
            @jakarta.validation.constraints.NotBlank @jakarta.validation.constraints.Pattern(regexp = "CASH|MOBILE_MONEY|CARD|OTHER") String paymentMethod,
            @jakarta.validation.constraints.NotEmpty @jakarta.validation.constraints.Size(max = 50) @jakarta.validation.Valid List<Line> lines
    ) {
        public record Line(
                @jakarta.validation.constraints.NotBlank String ticketTypeId,
                @jakarta.validation.constraints.Min(1) @jakarta.validation.constraints.Max(1000) int quantity
        ) {
        }
    }

    record PricedLine(Catalog.TicketType type, int quantity) {
    }

    public record Line(String ticketTypeId, String name, int quantity, BigDecimal unitPrice) {
    }

    public record Ticket(String id, String ticketTypeId, String ticketTypeName, String ticketNumber, String qrContent, String status) {
    }

    public record Sale(String id, String localReference, String centralReference, String cashierUserId, String paymentMethod,
                       BigDecimal total, String currency, String createdAt, List<Line> lines, List<Ticket> tickets) {
    }

    public record SaleSummary(String id, String localReference, String centralReference, String paymentMethod, BigDecimal total,
                              String currency, String createdAt, int ticketCount, boolean synced) {
    }

    /** decision: ACCEPTED | ALREADY_REDEEMED | VOIDED | INVALID_SIGNATURE | WRONG_GATE | NOT_RECOGNIZED */
    public record ScanResult(String result, String ticketNumber, String redeemedAt) {
        static ScanResult of(String result) {
            return new ScanResult(result, null, null);
        }
    }
}
