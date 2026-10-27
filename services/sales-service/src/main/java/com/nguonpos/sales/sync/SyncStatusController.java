package com.nguonpos.sales.sync;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

// "Online but idle" vs "offline" is distinguishable because a terminal
// heartbeats periodically while connected, whether or not it has anything
// to sync — see docs/SYNC_PROTOCOL.md. This endpoint is the admin view of
// exactly that: every terminal that has ever heartbeated, each gate's
// last-seen time and self-reported pending count.
@RestController
@RequestMapping("/sales/admin/sync-status")
@PreAuthorize("hasAnyRole('SUPER_ADMIN', 'COORDINATOR')")
public class SyncStatusController {

    private static final long ONLINE_THRESHOLD_SECONDS = 120;

    private final TerminalRepository terminalRepository;

    public SyncStatusController(TerminalRepository terminalRepository) {
        this.terminalRepository = terminalRepository;
    }

    @GetMapping
    public List<TerminalStatus> list() {
        Instant now = Instant.now();
        return terminalRepository.findAll().stream()
                .map((Terminal t) -> new TerminalStatus(
                        t.getId(),
                        t.getGateId(),
                        t.getDeviceLabel(),
                        t.getLastSeenAt(),
                        t.getLocalPendingCount(),
                        ChronoUnit.SECONDS.between(t.getLastSeenAt(), now) <= ONLINE_THRESHOLD_SECONDS
                ))
                .toList();
    }

    public record TerminalStatus(
            UUID terminalId, UUID gateId, String deviceLabel, Instant lastSeenAt, int localPendingCount, boolean online
    ) {
    }
}
