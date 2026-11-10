-- The till's hybrid-clock stamp of each scan (desktop tills): when two tills
-- both let a ticket in, central keeps the earliest by this clock as the
-- entry — the same choice the tills make — whatever order they reach it in.
ALTER TABLE entry_scan ADD COLUMN hlc VARCHAR(40);
