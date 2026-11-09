package com.nguonpos.sales.sync;

import java.util.Map;
import java.util.LinkedHashMap;
import com.nguonpos.sales.edgesync.EdgeFeed;
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
import com.nguonpos.sales.audit.AuditService;
import io.jsonwebtoken.Claims;
import jakarta.persistence.EntityManager;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.interceptor.TransactionAspectSupport;

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
    private final AuditService audit;
    private final EdgeFeed edgeFeed;

    public SyncEntryProcessor(
            TransactionRepository transactionRepository,
            TransactionLineRepository transactionLineRepository,
            TicketRepository ticketRepository,
            EntryScanRepository entryScanRepository,
            EntityManager entityManager,
            AuditService audit,
            EdgeFeed edgeFeed
    ) {
        this.edgeFeed = edgeFeed;
        this.transactionRepository = transactionRepository;
        this.transactionLineRepository = transactionLineRepository;
        this.ticketRepository = ticketRepository;
        this.entryScanRepository = entryScanRepository;
        this.entityManager = entityManager;
        this.audit = audit;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public SaleSyncResponse.EntryResult processSaleEntry(
            SaleSyncRequest.SaleEntry entry, UUID terminalId, UUID gateId, UUID establishmentId, UUID cashierUserId, Claims claims
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
                resolvePendingScans(ticket);
            }

            // The gate's other desktop tills learn these tickets (to admit them, or refuse a second entry).
            Map<String, Object> feedSale = new LinkedHashMap<>();
            feedSale.put("transactionId", transaction.getId());
            feedSale.put("referenceNumber", transaction.getReferenceNumber());
            feedSale.put("createdAtClient", entry.createdAtClient());
            feedSale.put("paymentMethod", entry.paymentMethod());
            feedSale.put("cashierUserId", cashierUserId);
            feedSale.put("lines", entry.lines());
            feedSale.put("tickets", entry.tickets());
            edgeFeed.append(establishmentId, gateId, EdgeFeed.SALE, terminalId, feedSale);

            audit.record(claims, "SALE", "SALE_SYNCED", "TRANSACTION", transaction.getId(),
                    "Vente " + transaction.getReferenceNumber() + " synchronisée — "
                            + String.format("%,.0f", total).replace(',', ' ') + " FCFA, "
                            + entry.tickets().size() + " billet(s), " + entry.paymentMethod());

            return new SaleSyncResponse.EntryResult(
                    entry.idempotencyKey(), SaleSyncResponse.Status.ACCEPTED,
                    transaction.getReferenceNumber(), Instant.now(), null
            );
        } catch (Exception ex) {
            // Caught to report REJECTED for this entry only — but the rows
            // already written above must not commit without their tickets.
            TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
            return new SaleSyncResponse.EntryResult(
                    entry.idempotencyKey(), SaleSyncResponse.Status.REJECTED, null, Instant.now(), ex.getMessage()
            );
        }
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public ScanSyncResponse.EntryResult processScanEntry(
            ScanSyncRequest.ScanEntry entry, UUID terminalId, UUID gateId, UUID establishmentId, UUID scannedByUserId, Claims claims
    ) {
        var existingScan = entryScanRepository.findById(entry.clientScanId());
        if (existingScan.isPresent()) {
            return new ScanSyncResponse.EntryResult(
                    entry.clientScanId(), ScanSyncResponse.SyncStatus.DUPLICATE_IGNORED,
                    existingScan.get().getResult(), null
            );
        }

        // A ticket of another establishment is treated as unknown: a till
        // can only ever redeem its own establishment's tickets.
        var anyTicket = ticketRepository.findById(entry.ticketId());
        if (anyTicket.isEmpty()) {
            // Not here yet: the sale that issued it is still on its way from
            // another till. Kept and settled when that sale syncs.
            EntryScan scan = EntryScan.builder()
                    .id(entry.clientScanId()).ticketId(entry.ticketId()).establishmentId(establishmentId).gateId(gateId)
                    .terminalId(terminalId).scannedByUserId(scannedByUserId)
                    .scannedAt(entry.scannedAt()).result(ScanResult.PENDING_TICKET)
                    .build();
            entryScanRepository.save(scan);
            audit.record(claims, "SCAN", "SCAN_PENDING_TICKET", "TICKET", entry.ticketId(),
                    "Scan reçu avant la vente du billet — en attente de sa synchronisation");
            return new ScanSyncResponse.EntryResult(
                    entry.clientScanId(), ScanSyncResponse.SyncStatus.ACCEPTED, ScanResult.PENDING_TICKET, null
            );
        }
        var ticketOpt = anyTicket.filter(t -> establishmentId.equals(t.getEstablishmentId()));
        if (ticketOpt.isEmpty()) {
            EntryScan scan = EntryScan.builder()
                    .id(entry.clientScanId()).ticketId(entry.ticketId()).establishmentId(establishmentId).gateId(gateId)
                    .terminalId(terminalId).scannedByUserId(scannedByUserId)
                    .scannedAt(entry.scannedAt()).result(ScanResult.REJECTED_UNKNOWN_TICKET)
                    .build();
            entryScanRepository.save(scan);
            audit.record(claims, "SCAN", "SCAN_UNKNOWN_TICKET", "TICKET", entry.ticketId(),
                    "Scan d'un billet inconnu du serveur");
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
        } else if (ticket.getStatus() == TicketStatus.VOIDED) {
            result = ScanResult.REJECTED_VOIDED;
        } else {
            result = ScanResult.REJECTED_ALREADY_REDEEMED;
        }

        EntryScan scan = EntryScan.builder()
                .id(entry.clientScanId()).ticketId(entry.ticketId()).establishmentId(establishmentId).gateId(gateId)
                .terminalId(terminalId).scannedByUserId(scannedByUserId)
                .scannedAt(entry.scannedAt()).result(result)
                .build();
        entryScanRepository.save(scan);
        edgeFeed.append(establishmentId, gateId, EdgeFeed.SCAN, terminalId, Map.of("clientScanId", scan.getId(), "ticketId", ticket.getId(),
                "scannedAt", scan.getScannedAt(), "result", result.name()));
        audit.record(claims, "SCAN", "SCAN_" + result.name(), "TICKET", ticket.getId(),
                (result == ScanResult.ACCEPTED ? "Entrée validée — billet "
                        : result == ScanResult.REJECTED_VOIDED ? "Entrée refusée (vente annulée) — billet "
                        : "Entrée refusée (déjà utilisé) — billet ")
                        + ticket.getTicketNumber());

        return new ScanSyncResponse.EntryResult(entry.clientScanId(), ScanSyncResponse.SyncStatus.ACCEPTED, result, null);
    }

    /**
     * Settles scans that reached central before this ticket's sale: the
     * earliest one (by till scan time) gets the entry, any later ones were
     * the same ticket presented again.
     */
    private void resolvePendingScans(Ticket ticket) {
        var pending = entryScanRepository.findByTicketIdAndEstablishmentIdAndResultOrderByScannedAtAscIdAsc(
                ticket.getId(), ticket.getEstablishmentId(), ScanResult.PENDING_TICKET);
        for (EntryScan scan : pending) {
            if (ticket.getStatus() == TicketStatus.ISSUED) {
                ticket.setStatus(TicketStatus.REDEEMED);
                ticket.setRedeemedAt(scan.getScannedAt());
                ticket.setRedeemedByUserId(scan.getScannedByUserId());
                ticket.setRedeemedByTerminalId(scan.getTerminalId());
                ticketRepository.save(ticket);
                scan.setResult(ScanResult.ACCEPTED);
            } else {
                scan.setResult(ScanResult.REJECTED_ALREADY_REDEEMED);
            }
            entryScanRepository.save(scan);
            edgeFeed.append(ticket.getEstablishmentId(), ticket.getGateId(), EdgeFeed.SCAN, scan.getTerminalId(),
                    Map.of("clientScanId", scan.getId(), "ticketId", ticket.getId(), "scannedAt", scan.getScannedAt(), "result", scan.getResult().name()));
            audit.recordAs(scan.getScannedByUserId(), "Système", "SCAN", "SCAN_" + scan.getResult().name(), "TICKET", ticket.getId(),
                    "Scan en attente réglé à l'arrivée de la vente : "
                            + (scan.getResult() == ScanResult.ACCEPTED ? "entrée validée" : "entrée refusée (déjà utilisé)")
                            + " — billet " + ticket.getTicketNumber());
        }
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
