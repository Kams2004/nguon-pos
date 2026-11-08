-- Scans are listed per establishment in the back office (Contrôle des
-- entrées). Rows written before this column existed are backfilled from
-- their ticket, or — for a ticket the server never knew — from a sale made
-- on the same till.
ALTER TABLE entry_scan ADD COLUMN establishment_id UUID;

UPDATE entry_scan s SET establishment_id = t.establishment_id
FROM ticket t WHERE t.id = s.ticket_id;

UPDATE entry_scan s SET establishment_id = (
    SELECT tx.establishment_id FROM transaction tx WHERE tx.terminal_id = s.terminal_id LIMIT 1
) WHERE s.establishment_id IS NULL;

CREATE INDEX idx_entry_scan_establishment ON entry_scan (establishment_id, scanned_at DESC);
