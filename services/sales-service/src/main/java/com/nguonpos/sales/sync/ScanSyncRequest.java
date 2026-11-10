package com.nguonpos.sales.sync;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record ScanSyncRequest(
        @NotNull UUID terminalId,
        @NotNull UUID gateId,
        @NotEmpty @Size(max = 500) @Valid List<ScanEntry> entries
) {
    /** localDecision: what the till decided at the gate (desktop tills send it; null from browser tills). */
    public record ScanEntry(@NotNull UUID clientScanId, @NotNull UUID ticketId, @NotNull Instant scannedAt, String localDecision) {
    }
}
