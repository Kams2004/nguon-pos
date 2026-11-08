package com.nguonpos.sales.sync;

import com.nguonpos.sales.live.EventHub;
import io.jsonwebtoken.Claims;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

// Orchestrator only — deliberately NOT @Transactional itself, so each
// entry's own REQUIRES_NEW transaction (in SyncEntryProcessor, a separate
// bean) commits/rolls back independently. See SyncEntryProcessor's javadoc
// for why this has to be two beans, not one.
@Service
public class SyncService {

    private final SyncEntryProcessor entryProcessor;
    private final EventHub hub;

    public SyncService(SyncEntryProcessor entryProcessor, EventHub hub) {
        this.entryProcessor = entryProcessor;
        this.hub = hub;
    }

    public SaleSyncResponse syncTransactions(SaleSyncRequest request, UUID establishmentId, UUID cashierUserId, Claims claims) {
        List<SaleSyncResponse.EntryResult> results = new ArrayList<>();
        for (SaleSyncRequest.SaleEntry entry : request.entries()) {
            results.add(entryProcessor.processSaleEntry(entry, request.terminalId(), request.gateId(), establishmentId, cashierUserId, claims));
        }
        // After every entry's own transaction has committed — admin screens
        // refetch on this, so they must never see it before the rows exist.
        long accepted = results.stream().filter(r -> r.status() == SaleSyncResponse.Status.ACCEPTED).count();
        if (accepted > 0) {
            hub.publish("SALES_CHANGED", new SyncedBatch(request.terminalId(), request.gateId(), accepted), true);
            // A new sale can settle scans that were waiting for its tickets.
            hub.publish("SCANS_CHANGED", new SyncedBatch(request.terminalId(), request.gateId(), 0), true);
        }
        return new SaleSyncResponse(results);
    }

    public ScanSyncResponse syncScans(ScanSyncRequest request, UUID establishmentId, UUID scannedByUserId, Claims claims) {
        List<ScanSyncResponse.EntryResult> results = new ArrayList<>();
        for (ScanSyncRequest.ScanEntry entry : request.entries()) {
            results.add(entryProcessor.processScanEntry(entry, request.terminalId(), request.gateId(), establishmentId, scannedByUserId, claims));
        }
        if (!results.isEmpty()) {
            hub.publish("SCANS_CHANGED", new SyncedBatch(request.terminalId(), request.gateId(), results.size()), true);
        }
        return new ScanSyncResponse(results);
    }

    public record SyncedBatch(UUID terminalId, UUID gateId, long count) {
    }
}
