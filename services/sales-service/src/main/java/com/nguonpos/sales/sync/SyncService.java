package com.nguonpos.sales.sync;

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

    public SyncService(SyncEntryProcessor entryProcessor) {
        this.entryProcessor = entryProcessor;
    }

    public SaleSyncResponse syncTransactions(SaleSyncRequest request, UUID establishmentId, UUID cashierUserId) {
        List<SaleSyncResponse.EntryResult> results = new ArrayList<>();
        for (SaleSyncRequest.SaleEntry entry : request.entries()) {
            results.add(entryProcessor.processSaleEntry(entry, request.terminalId(), request.gateId(), establishmentId, cashierUserId));
        }
        return new SaleSyncResponse(results);
    }

    public ScanSyncResponse syncScans(ScanSyncRequest request, UUID scannedByUserId) {
        List<ScanSyncResponse.EntryResult> results = new ArrayList<>();
        for (ScanSyncRequest.ScanEntry entry : request.entries()) {
            results.add(entryProcessor.processScanEntry(entry, request.terminalId(), request.gateId(), scannedByUserId));
        }
        return new ScanSyncResponse(results);
    }
}
