package com.nguonpos.sales.sync;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record SaleSyncResponse(List<EntryResult> results) {
    public enum Status { ACCEPTED, DUPLICATE_IGNORED, REJECTED }

    public record EntryResult(
            UUID idempotencyKey, Status status, String referenceNumber, Instant serverReceivedAt, String reason
    ) {
    }
}
