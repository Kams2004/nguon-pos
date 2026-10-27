package com.nguonpos.sales.sync;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record ScanSyncRequest(
        @NotNull UUID terminalId,
        @NotNull UUID gateId,
        @NotEmpty @Valid List<ScanEntry> entries
) {
    public record ScanEntry(@NotNull UUID clientScanId, @NotNull UUID ticketId, @NotNull Instant scannedAt) {
    }
}
