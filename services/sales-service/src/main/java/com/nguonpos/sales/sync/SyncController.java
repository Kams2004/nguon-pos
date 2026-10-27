package com.nguonpos.sales.sync;

import io.jsonwebtoken.Claims;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.UUID;

@RestController
@RequestMapping("/sales/sync")
public class SyncController {

    private final SyncService syncService;
    private final TerminalRepository terminalRepository;

    public SyncController(SyncService syncService, TerminalRepository terminalRepository) {
        this.syncService = syncService;
        this.terminalRepository = terminalRepository;
    }

    @PostMapping("/transactions")
    public SaleSyncResponse syncTransactions(@Valid @RequestBody SaleSyncRequest request, @AuthenticationPrincipal Claims claims) {
        UUID establishmentId = UUID.fromString(claims.get("establishmentId", String.class));
        UUID cashierUserId = UUID.fromString(claims.get("userId", String.class));
        return syncService.syncTransactions(request, establishmentId, cashierUserId);
    }

    @PostMapping("/scans")
    public ScanSyncResponse syncScans(@Valid @RequestBody ScanSyncRequest request, @AuthenticationPrincipal Claims claims) {
        UUID scannedByUserId = UUID.fromString(claims.get("userId", String.class));
        return syncService.syncScans(request, scannedByUserId);
    }

    @PostMapping("/heartbeat")
    public ResponseEntity<Void> heartbeat(@Valid @RequestBody HeartbeatRequest request) {
        Terminal terminal = terminalRepository.findById(request.terminalId())
                .orElse(Terminal.builder().id(request.terminalId()).build());
        terminal.setGateId(request.gateId());
        terminal.setLastSeenAt(Instant.now());
        terminal.setLocalPendingCount(request.localPendingCount());
        terminalRepository.save(terminal);
        return ResponseEntity.ok().build();
    }
}
