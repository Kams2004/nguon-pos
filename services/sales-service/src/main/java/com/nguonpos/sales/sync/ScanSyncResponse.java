package com.nguonpos.sales.sync;

import com.nguonpos.sales.validation.ScanResult;

import java.util.List;
import java.util.UUID;

public record ScanSyncResponse(List<EntryResult> results) {
    public enum SyncStatus { ACCEPTED, DUPLICATE_IGNORED }

    public record EntryResult(UUID clientScanId, SyncStatus syncStatus, ScanResult scanResult, String reason) {
    }
}
