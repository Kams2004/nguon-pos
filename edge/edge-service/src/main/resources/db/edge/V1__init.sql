-- Till-local schema. Every row lives only in this encrypted file until
-- forwarded to central; the event_log is the record of what happened here.

CREATE TABLE meta (
    k TEXT PRIMARY KEY,
    v TEXT NOT NULL
);

-- The gate's catalog as last received (BootstrapResponse without the signing secret).
CREATE TABLE gate_config (
    id         INTEGER PRIMARY KEY CHECK (id = 1),
    gate_id    TEXT NOT NULL,
    gate_code  TEXT NOT NULL,
    json       TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- QR signing keys of this till's gate (only here, never sent to the UI).
CREATE TABLE signing_key (
    kid        TEXT PRIMARY KEY,
    secret_hex TEXT NOT NULL,
    active     INTEGER NOT NULL
);

-- Who may log in at this till without a network: created at a successful
-- online login. `verifier` is a bcrypt hash of the password.
CREATE TABLE user_credential (
    user_id          TEXT PRIMARY KEY,
    username         TEXT NOT NULL UNIQUE,
    full_name        TEXT NOT NULL,
    role             TEXT NOT NULL,
    gate_id          TEXT NOT NULL,
    verifier         TEXT NOT NULL,
    central_token    TEXT,
    token_expires_at TEXT,
    updated_at       TEXT NOT NULL
);

CREATE TABLE login_failure (
    username TEXT NOT NULL,
    at       TEXT NOT NULL
);

CREATE TABLE local_session (
    token_hash TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    expires_at TEXT NOT NULL
);

-- Append-only record of every sale and scan made here, signed with the
-- device key. seq counts per origin device; uplink_* tracks central's answer.
CREATE TABLE event_log (
    origin        TEXT NOT NULL,
    seq           INTEGER NOT NULL,
    type          TEXT NOT NULL,
    hlc           TEXT NOT NULL,
    actor_user_id TEXT NOT NULL,
    payload       TEXT NOT NULL,
    sig           TEXT NOT NULL,
    created_at    TEXT NOT NULL,
    uplink_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (uplink_status IN ('PENDING', 'ACKED', 'REJECTED')),
    uplink_result TEXT,
    PRIMARY KEY (origin, seq)
);
CREATE INDEX idx_event_log_pending ON event_log (uplink_status, type, seq);

CREATE TABLE sale (
    id                TEXT PRIMARY KEY,
    client_request_id TEXT NOT NULL UNIQUE,
    local_reference   TEXT NOT NULL UNIQUE,
    central_reference TEXT,
    cashier_user_id   TEXT NOT NULL,
    payment_method    TEXT NOT NULL,
    total             TEXT NOT NULL,
    currency          TEXT NOT NULL,
    created_at        TEXT NOT NULL
);
CREATE INDEX idx_sale_created ON sale (created_at);

CREATE TABLE sale_line (
    sale_id        TEXT NOT NULL REFERENCES sale (id),
    line_no        INTEGER NOT NULL,
    ticket_type_id TEXT NOT NULL,
    name           TEXT NOT NULL,
    quantity       INTEGER NOT NULL,
    unit_price     TEXT NOT NULL,
    PRIMARY KEY (sale_id, line_no)
);

CREATE TABLE ticket (
    id             TEXT PRIMARY KEY,
    sale_id        TEXT NOT NULL REFERENCES sale (id),
    ticket_type_id TEXT NOT NULL,
    ticket_number  TEXT NOT NULL UNIQUE,
    qr             TEXT NOT NULL,
    status         TEXT NOT NULL CHECK (status IN ('ISSUED', 'REDEEMED', 'VOIDED')),
    redeemed_at    TEXT
);

CREATE TABLE scan (
    id         TEXT PRIMARY KEY,
    ticket_id  TEXT,
    scanned_by TEXT NOT NULL,
    scanned_at TEXT NOT NULL,
    decision   TEXT NOT NULL
);

-- Per-till settings (printer…), adjustable at each point of sale.
CREATE TABLE till_setting (
    k TEXT PRIMARY KEY,
    v TEXT NOT NULL
);
