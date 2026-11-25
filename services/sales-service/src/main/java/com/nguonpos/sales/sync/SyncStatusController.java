package com.nguonpos.sales.sync;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;

// Admin view of every terminal that has ever heartbeated. Live changes are
// pushed as TERMINAL_STATUS events (see PresenceService); this endpoint is
// the initial snapshot a screen loads before listening.
@RestController
@RequestMapping("/sales/admin/sync-status")
@PreAuthorize("hasAnyRole('SUPER_ADMIN', 'COORDINATOR')")
public class SyncStatusController {

    private final TerminalRepository terminalRepository;
    private final PresenceService presence;

    public SyncStatusController(TerminalRepository terminalRepository, PresenceService presence) {
        this.terminalRepository = terminalRepository;
        this.presence = presence;
    }

    @GetMapping
    public List<PresenceService.TerminalStatus> list() {
        return terminalRepository.findAll().stream().map(presence::toStatus).toList();
    }

    /** Connection history: who worked on which till, at which gate, from when to when (default: the last 24 h). */
    @GetMapping("/sessions")
    public List<Map<String, Object>> sessions(@RequestParam(required = false) Instant from, @RequestParam(required = false) Instant to) {
        Instant end = to != null ? to : Instant.now().plusSeconds(60);
        Instant start = from != null ? from : end.minus(Duration.ofDays(1));
        if (Duration.between(start, end).toDays() > 93) start = end.minus(Duration.ofDays(93));
        return presence.sessions(start, end);
    }
}
