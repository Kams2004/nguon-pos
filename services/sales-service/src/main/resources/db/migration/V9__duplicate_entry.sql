-- Milestone 5: tills of a gate that lose central and each other can both
-- let the same ticket in. The till's own decision travels with the scan;
-- a scan the till ADMITTED on a ticket already used is a second entry —
-- someone did get in — not a refusal.
ALTER TABLE entry_scan ADD COLUMN local_decision VARCHAR(20);
ALTER TABLE entry_scan DROP CONSTRAINT entry_scan_result_check;
ALTER TABLE entry_scan ADD CONSTRAINT entry_scan_result_check CHECK (result IN (
    'ACCEPTED', 'REJECTED_ALREADY_REDEEMED', 'REJECTED_INVALID_SIGNATURE', 'REJECTED_WRONG_GATE',
    'REJECTED_UNKNOWN_TICKET', 'REJECTED_VOIDED', 'PENDING_TICKET', 'DUPLICATE_ENTRY'));
