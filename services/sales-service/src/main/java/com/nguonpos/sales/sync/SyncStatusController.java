package com.nguonpos.sales.sync;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

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
}
