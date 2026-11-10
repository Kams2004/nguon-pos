-- Milestone 5: tills of the same gate exchange their signed records over
-- the local network.

-- The other tills of this gate: where to reach them, and the certificate
-- that proves what they signed (checked against the Nguon device CA).
CREATE TABLE peer (
    device_id    TEXT PRIMARY KEY,
    label        TEXT,
    address      TEXT,             -- host:port of its peer server, last known
    source       TEXT NOT NULL,    -- CENTRAL | BROADCAST | CONFIG
    cert_pem     TEXT,
    revoked      INTEGER NOT NULL DEFAULT 0,
    last_seen_at TEXT,
    last_error   TEXT
);

-- Scans now come from several tills: who scanned (origin), when in causal
-- order (hlc), and whether this one is a second entry on the same ticket.
ALTER TABLE scan ADD COLUMN origin TEXT;
ALTER TABLE scan ADD COLUMN hlc TEXT;
ALTER TABLE scan ADD COLUMN duplicate INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_scan_ticket ON scan (ticket_id, decision)
