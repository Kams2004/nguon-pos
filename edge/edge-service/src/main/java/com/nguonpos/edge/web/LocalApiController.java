package com.nguonpos.edge.web;

import com.nguonpos.edge.EdgeProperties;
import com.nguonpos.edge.central.EdgeChannel;
import com.nguonpos.edge.central.Enrollment;
import com.nguonpos.edge.central.Uplink;
import com.nguonpos.edge.core.Catalog;
import com.nguonpos.edge.core.DeviceIdentity;
import com.nguonpos.edge.core.LiveEvents;
import com.nguonpos.edge.core.LocalAuth;
import com.nguonpos.edge.core.LocalAuth.LocalUser;
import com.nguonpos.edge.till.TillService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** The till screen's API, on 127.0.0.1 only (see LocalAccessFilter). */
@RestController
@RequestMapping("/local/v1")
public class LocalApiController {

    private final LocalAuth auth;
    private final TillService till;
    private final Catalog catalog;
    private final Uplink uplink;
    private final DeviceIdentity device;
    private final LiveEvents live;
    private final EdgeProperties props;
    private final JdbcTemplate jdbc;
    private final JsonMapper json;
    private final EdgeChannel channel;
    private final Enrollment enrollment;

    public LocalApiController(LocalAuth auth, TillService till, Catalog catalog, Uplink uplink, DeviceIdentity device, LiveEvents live,
                              EdgeProperties props, JdbcTemplate jdbc, JsonMapper json, EdgeChannel channel, Enrollment enrollment, com.nguonpos.edge.update.Updater updater) {
        this.updater = updater;
        this.channel = channel;
        this.enrollment = enrollment;
        this.auth = auth;
        this.till = till;
        this.catalog = catalog;
        this.uplink = uplink;
        this.device = device;
        this.live = live;
        this.props = props;
        this.jdbc = jdbc;
        this.json = json;
    }

    private final com.nguonpos.edge.update.Updater updater;

    @GetMapping("/status")
    public Map<String, Object> status() {
        Map<String, Object> s = new HashMap<>();
        s.put("deviceId", device.deviceId().toString());
        s.put("deviceCode", device.shortCode());
        s.put("gate", catalog.gate().orElse(null));
        s.put("centralUrl", props.centralUrl());
        s.put("centralReachable", channel.connected() || uplink.reachable());
        s.put("enrolled", enrollment.enrolled());
        s.put("revoked", enrollment.revoked());
        s.put("deviceNo", enrollment.deviceNo().orElse(null));
        s.put("channelConnected", channel.connected());
        s.put("lastSyncAt", uplink.lastSyncAt());
        s.put("pending", uplink.pendingCount());
        s.put("appVersion", updater.currentVersion());
        s.put("update", updater.status());
        return s;
    }

    // ── Enrollment (first run) ───────────────────────────────────────────

    /** One-time code from the back office ("Appareils") → this till's certificate. */
    @PostMapping("/enroll")
    public Map<String, Object> enroll(@Valid @RequestBody EnrollRequest req) {
        return enrollment.enroll(req.code(), req.label());
    }

    public record EnrollRequest(@NotBlank @Size(max = 20) String code, @Size(max = 200) String label) {
    }

    // ── Session ──────────────────────────────────────────────────────────

    @PostMapping("/auth/login")
    public Map<String, Object> login(@Valid @RequestBody LoginRequest req) {
        LocalAuth.LoginResult r = auth.login(req.username().strip(), req.password());
        uplink.setActiveUser(r.user().id());
        channel.setActiveUser(r.user().id());
        return Map.of("token", r.token(), "user", publicUser(r.user()), "verifiedOnline", r.online());
    }

    @PostMapping("/auth/logout")
    public ResponseEntity<Void> logout(@RequestAttribute(LocalAccessFilter.TOKEN) String token) {
        auth.logout(token);
        uplink.setActiveUser(null);
        channel.setActiveUser(null);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/auth/me")
    public Map<String, Object> me(@RequestAttribute(LocalAccessFilter.USER) LocalUser user) {
        return publicUser(user);
    }

    // ── Till ─────────────────────────────────────────────────────────────

    /** The gate's catalog and ticket design, as central's bootstrap — without the QR signing secret. */
    @GetMapping("/bootstrap")
    public JsonNode bootstrap() {
        return catalog.bootstrap().orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "NO_CATALOG"));
    }

    @PostMapping("/sales")
    public TillService.Sale sell(@RequestAttribute(LocalAccessFilter.USER) LocalUser user, @Valid @RequestBody TillService.SaleRequest req) {
        TillService.Sale sale = till.sell(user, req);
        channel.nudge();
        return sale;
    }

    @GetMapping("/sales")
    public List<TillService.SaleSummary> recentSales(@RequestParam(defaultValue = "50") int limit) {
        return till.recentSales(limit);
    }

    @GetMapping("/sales/{id}")
    public TillService.Sale sale(@PathVariable String id) {
        return till.sale(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    @PostMapping("/scans")
    public TillService.ScanResult scan(@RequestAttribute(LocalAccessFilter.USER) LocalUser user, @Valid @RequestBody ScanRequest req) {
        TillService.ScanResult result = till.scan(user, req.qrContent());
        channel.nudge();
        return result;
    }

    @GetMapping("/events")
    public SseEmitter events() {
        return live.subscribe();
    }

    // ── Per-till printer settings ────────────────────────────────────────

    @GetMapping("/settings/printer")
    public PrinterSettings printer() {
        return jdbc.queryForList("SELECT v FROM till_setting WHERE k = 'printer'", String.class).stream().findFirst()
                .map(v -> json.readValue(v, PrinterSettings.class)).orElse(PrinterSettings.DEFAULTS);
    }

    @PutMapping("/settings/printer")
    public PrinterSettings savePrinter(@Valid @RequestBody PrinterSettings s) {
        if (s.paperWidth() != 58 && s.paperWidth() != 80) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "PAPER_WIDTH_58_OR_80");
        }
        jdbc.update("INSERT INTO till_setting (k, v) VALUES ('printer', ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v",
                json.writeValueAsString(s));
        live.publish("PRINTER_SETTINGS_CHANGED", s);
        return s;
    }

    private static Map<String, Object> publicUser(LocalUser u) {
        return Map.of("id", u.id(), "username", u.username(), "fullName", u.fullName(), "role", u.role(), "assignedGateId", u.gateId());
    }

    public record LoginRequest(@NotBlank @Size(max = 100) String username, @NotBlank @Size(max = 200) String password) {
    }

    public record ScanRequest(@NotBlank @Size(max = 4000) String qrContent) {
    }

    /**
     * How this point of sale prints. Empty printerName = the system default.
     *
     * @param paperWidth  58 or 80 (mm); overrides the establishment-wide receipt width on this till
     * @param autoPrint   what prints by itself once a sale is confirmed
     * @param copies      copies of the receipt
     * @param offsetMm    nudges the print right (positive) or left, for printers that clip one edge
     */
    public record PrinterSettings(
            @Size(max = 200) String printerName,
            @Min(58) @Max(80) int paperWidth,
            @NotBlank @Pattern(regexp = "NONE|RECEIPT|TICKETS|ALL") String autoPrint,
            @Min(1) @Max(5) int copies,
            @Min(-10) @Max(10) int offsetMm
    ) {
        static final PrinterSettings DEFAULTS = new PrinterSettings("", 80, "NONE", 1, 0);
    }
}
