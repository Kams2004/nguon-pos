-- Two more scan outcomes:
--   REJECTED_VOIDED  the ticket's sale was voided;
--   PENDING_TICKET   the scan reached central before the sale that issued
--                    the ticket, and is settled when that sale arrives.
ALTER TABLE entry_scan DROP CONSTRAINT entry_scan_result_check;
ALTER TABLE entry_scan ADD CONSTRAINT entry_scan_result_check CHECK (result IN (
    'ACCEPTED', 'REJECTED_ALREADY_REDEEMED', 'REJECTED_INVALID_SIGNATURE', 'REJECTED_WRONG_GATE',
    'REJECTED_UNKNOWN_TICKET', 'REJECTED_VOIDED', 'PENDING_TICKET'));

CREATE INDEX idx_entry_scan_pending ON entry_scan (ticket_id) WHERE result = 'PENDING_TICKET';
