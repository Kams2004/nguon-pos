package com.nguonpos.sales.sync;

import com.nguonpos.sales.transaction.Transaction;
import com.nguonpos.sales.transaction.TransactionLine;
import com.nguonpos.sales.transaction.TransactionLineRepository;
import com.nguonpos.sales.transaction.TransactionRepository;
import com.nguonpos.sales.transaction.TransactionStatus;
import com.nguonpos.sales.ticket.Ticket;
import com.nguonpos.sales.ticket.TicketRepository;
import com.nguonpos.sales.ticket.TicketStatus;
import com.nguonpos.sales.validation.EntryScan;
import com.nguonpos.sales.validation.EntryScanRepository;
import com.nguonpos.sales.validation.ScanResult;
import jakarta.persistence.EntityManager;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

// A separate bean from SyncService on purpose: @Transactional only takes
// effect through Spring's proxy, which self-invocation (calling a
// @Transactional method on `this` from another method in the same bean)
// bypasses entirely. Each entry processed here truly commits/rolls back
// independently because SyncService calls across a real bean boundary.
@Service
public class SyncEntryProcessor {

    private final TransactionRepository transactionRepository;
    private final TransactionLineRepository transactionLineRepository;
    private final TicketRepository ticketRepository;
    private final EntryScanRepository entryScanRepository;
    private final EntityManager entityManager;

    public SyncEntryProcessor(
            TransactionRepository transactionRepository,
            TransactionLineRepository transactionLineRepository,
            TicketRepository ticketRepository,
            EntryScanRepository entryScanRepository,
            EntityManager entityManager
    ) {
        this.transactionRepository = transactionRepository;
        this.transactionLineRepository = transactionLineRepository;
        this.ticketRepository = ticketRepository;
        this.entryScanRepository = entryScanRepository;
        this.entityManager = entityManager;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public SaleSyncResponse.EntryResult processSaleEntry(
            SaleSyncRequest.SaleEntry entry, UUID terminalId, UUID gateId, UUID establishmentId, UUID cashierUserId
    ) {
        var existing = transactionRepository.findById(entry.idempotencyKey());
        if (existing.isPresent()) {
            return new SaleSyncResponse.EntryResult(
                    entry.idempotencyKey(), SaleSyncResponse.Status.DUPLICATE_IGNORED,
                    existing.get().getReferenceNumber(), Instant.now(), null
            );
        }

        try {
            BigDecimal total = entry.lines().stream()
                    .map(l -> l.unitPrice().multiply(BigDecimal.valueOf(l.quantity())))
                    .reduce(BigDecimal.ZERO, BigDecimal::add);

            Transaction transaction = Transaction.builder()
                    .id(entry.idempotencyKey())
                    .establishmentId(establishmentId)
                    .gateId(gateId)
                    .terminalId(terminalId)
                    .cashierUserId(cashierUserId)
                    .status(TransactionStatus.COMPLETED)
                    .paymentMethod(entry.paymentMethod())
                    .totalAmount(total)
                    .currency("XAF")
                    .referenceNumber(nextReferenceNumber())
                    .createdAtClient(entry.createdAtClient())
                    .syncedAt(Instant.now())
                    .build();
            transactionRepository.save(transaction);

            for (SaleSyncRequest.LineEntry line : entry.lines()) {
                TransactionLine txLine = TransactionLine.builder()
                        .transactionId(transaction.getId())
                        .ticketTypeId(line.ticketTypeId())
                        .quantity(line.quantity())
                        .unitPrice(line.unitPrice())
                        .lineTotal(line.unitPrice().multiply(BigDecimal.valueOf(line.quantity())))
                        .build();
                transactionLineRepository.save(txLine);
            }

            // One transaction_line per distinct ticket type in this M1 model —
            // tickets reference it by matching ticketTypeId, which is unambiguous
            // since the walking skeleton sells one ticket type per sale line.
            var savedLines = transactionLineRepository.findByTransactionId(transaction.getId());

            for (SaleSyncRequest.TicketEntry ticketEntry : entry.tickets()) {
                UUID lineId = savedLines.stream()
                        .filter(l -> l.getTicketTypeId().equals(ticketEntry.ticketTypeId()))
                        .findFirst()
                        .map(TransactionLine::getId)
                        .orElseThrow(() -> new IllegalArgumentException(
                                "Le ticket référence un type de billet absent des lignes de la vente."));

                Ticket ticket = Ticket.builder()
                        .id(ticketEntry.id())
                        .transactionId(transaction.getId())
                        .transactionLineId(lineId)
                        .establishmentId(establishmentId)
                        .gateId(gateId)
                        .ticketTypeId(ticketEntry.ticketTypeId())
                        .ticketNumber(ticketEntry.ticketNumber())
                        .qrSignature(ticketEntry.qrSignature())
                        .status(TicketStatus.ISSUED)
                        .issuedAt(entry.createdAtClient())
                        .build();
                ticketRepository.save(ticket);
            }

            return new SaleSyncResponse.EntryResult(
                    entry.idempotencyKey(), SaleSyncResponse.Status.ACCEPTED,
                    transaction.getReferenceNumber(), Instant.now(), null
            );
        } catch (Exception ex) {
            return new SaleSyncResponse.EntryResult(
                    entry.idempotencyKey(), SaleSyncResponse.Status.REJECTED, null, Instant.now(), ex.getMessage()
            );
        }
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public ScanSyncResponse.EntryResult processScanEntry(
            ScanSyncRequest.ScanEntry entry, UUID terminalId, UUID gateId, UUID scannedByUserId
    ) {
        var existingScan = entryScanRepository.findById(entry.clientScanId());
        if (existingScan.isPresent()) {
            return new ScanSyncResponse.EntryResult(
                    entry.clientScanId(), ScanSyncResponse.SyncStatus.DUPLICATE_IGNORED,
                    existingScan.get().getResult(), null
            );
        }

        var ticketOpt = ticketRepository.findById(entry.ticketId());
        if (ticketOpt.isEmpty()) {
            EntryScan scan = EntryScan.builder()
                    .id(entry.clientScanId()).ticketId(entry.ticketId()).gateId(gateId)
                    .terminalId(terminalId).scannedByUserId(scannedByUserId)
                    .scannedAt(entry.scannedAt()).result(ScanResult.REJECTED_UNKNOWN_TICKET)
                    .build();
            entryScanRepository.save(scan);
            return new ScanSyncResponse.EntryResult(
                    entry.clientScanId(), ScanSyncResponse.SyncStatus.ACCEPTED,
                    ScanResult.REJECTED_UNKNOWN_TICKET, "Billet inconnu du serveur."
            );
        }

        Ticket ticket = ticketOpt.get();
        // First scan to reach the server with status ISSUED wins — this is
        // the server-side tie-breaker for the same-gate multi-till race
        // described in docs/QR_TICKET_SPEC.md. Any later-arriving scan for
        // an already-REDEEMED ticket is recorded, not silently dropped.
        ScanResult result;
        if (ticket.getStatus() == TicketStatus.ISSUED) {
            ticket.setStatus(TicketStatus.REDEEMED);
            ticket.setRedeemedAt(entry.scannedAt());
            ticket.setRedeemedByUserId(scannedByUserId);
            ticket.setRedeemedByTerminalId(terminalId);
            ticketRepository.save(ticket);
            result = ScanResult.ACCEPTED;
        } else {
            result = ScanResult.REJECTED_ALREADY_REDEEMED;
        }

        EntryScan scan = EntryScan.builder()
                .id(entry.clientScanId()).ticketId(entry.ticketId()).gateId(gateId)
                .terminalId(terminalId).scannedByUserId(scannedByUserId)
                .scannedAt(entry.scannedAt()).result(result)
                .build();
        entryScanRepository.save(scan);

        return new ScanSyncResponse.EntryResult(entry.clientScanId(), ScanSyncResponse.SyncStatus.ACCEPTED, result, null);
    }

    private String nextReferenceNumber() {
        // Schema-qualified deliberately: hibernate.default_schema only
        // affects SQL Hibernate generates for managed entities, not a raw
        // native query string — an unqualified nextval() here resolves
        // against the connection's default search_path (public), where
        // this sequence doesn't exist, even though it lives in "sales".
        Long seq = ((Number) entityManager.createNativeQuery("SELECT nextval('sales.transaction_reference_seq')").getSingleResult()).longValue();
        return "NG-" + String.format("%06d", seq);
    }
}
