package com.nguonpos.sales.sync;

import io.jsonwebtoken.Claims;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

@RestController
@RequestMapping("/sales/sync")
public class SyncController {

    private final SyncService syncService;
    private final PresenceService presence;

    public SyncController(SyncService syncService, PresenceService presence) {
        this.syncService = syncService;
        this.presence = presence;
    }

    @PostMapping("/transactions")
    public SaleSyncResponse syncTransactions(@Valid @RequestBody SaleSyncRequest request, @AuthenticationPrincipal Claims claims) {
        requireAssignedGate(claims, request.gateId());
        UUID establishmentId = UUID.fromString(claims.get("establishmentId", String.class));
        UUID cashierUserId = UUID.fromString(claims.get("userId", String.class));
        return syncService.syncTransactions(request, establishmentId, cashierUserId, claims);
    }

    @PostMapping("/scans")
    public ScanSyncResponse syncScans(@Valid @RequestBody ScanSyncRequest request, @AuthenticationPrincipal Claims claims) {
        requireAssignedGate(claims, request.gateId());
        UUID scannedByUserId = UUID.fromString(claims.get("userId", String.class));
        UUID establishmentId = UUID.fromString(claims.get("establishmentId", String.class));
        return syncService.syncScans(request, establishmentId, scannedByUserId, claims);
    }

    @PostMapping("/heartbeat")
    public ResponseEntity<Void> heartbeat(@Valid @RequestBody HeartbeatRequest request, @AuthenticationPrincipal Claims claims) {
        requireAssignedGate(claims, request.gateId());
        presence.heartbeat(request, claims);
        return ResponseEntity.ok().build();
    }

    /** Explicit logout from a till — shows it as "no one logged in" immediately, without waiting for a timeout. */
    @PostMapping("/terminal-logout")
    public ResponseEntity<Void> terminalLogout(@RequestBody TerminalLogoutRequest request, @AuthenticationPrincipal Claims claims) {
        presence.logout(request.terminalId(), claims);
        return ResponseEntity.ok().build();
    }

    /**
     * A till only reports for a gate its user may work at (listed, or every
     * gate). The gate in the request body is otherwise unchecked, and it
     * decides which gate the sale and its tickets belong to.
     */
    private static void requireAssignedGate(Claims claims, UUID gateId) {
        Object raw = claims.get("gateIds");
        java.util.List<String> allowed;
        if (raw instanceof java.util.List<?> list) {
            allowed = list.stream().map(String::valueOf).toList();
        } else { // a token from before multi-gate users: its one gate, or none
            String one = claims.get("assignedGateId", String.class);
            if (one == null) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Ce compte n'est autorisé à aucune porte.");
            allowed = java.util.List.of(one);
        }
        if ("SUPER_ADMIN".equals(claims.get("role", String.class)) || (!allowed.isEmpty() && !allowed.contains(gateId.toString()))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Ce compte n'est pas autorisé à cette porte.");
        }
    }

    public record TerminalLogoutRequest(UUID terminalId) {
    }
}
