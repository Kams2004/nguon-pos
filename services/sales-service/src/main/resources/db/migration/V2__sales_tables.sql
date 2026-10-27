CREATE SEQUENCE transaction_reference_seq START WITH 1;

CREATE TABLE transaction (
    id                  UUID PRIMARY KEY,  -- client-generated idempotency key, not server-generated
    establishment_id    UUID NOT NULL,
    gate_id             UUID NOT NULL,
    terminal_id         UUID NOT NULL,
    cashier_user_id     UUID NOT NULL,
    status              VARCHAR(20) NOT NULL CHECK (status IN ('COMPLETED', 'VOIDED')),
    payment_method      VARCHAR(20) NOT NULL CHECK (payment_method IN ('CASH', 'MOBILE_MONEY', 'CARD', 'OTHER')),
    total_amount        NUMERIC(12, 2) NOT NULL,
    currency            VARCHAR(10) NOT NULL,
    reference_number    VARCHAR(30) NOT NULL UNIQUE,
    created_at_client   TIMESTAMPTZ NOT NULL,
    synced_at           TIMESTAMPTZ NOT NULL,
    voided_by_user_id   UUID,
    voided_at           TIMESTAMPTZ,
    void_reason         TEXT
);

CREATE TABLE transaction_line (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id  UUID NOT NULL REFERENCES transaction (id),
    ticket_type_id  UUID NOT NULL,
    quantity        INTEGER NOT NULL,
    unit_price      NUMERIC(12, 2) NOT NULL,
    line_total      NUMERIC(12, 2) NOT NULL
);

CREATE TABLE ticket (
    id                       UUID PRIMARY KEY,  -- client-generated (payload.tid)
    transaction_id           UUID NOT NULL REFERENCES transaction (id),
    transaction_line_id      UUID NOT NULL REFERENCES transaction_line (id),
    establishment_id         UUID NOT NULL,
    gate_id                  UUID NOT NULL,
    ticket_type_id           UUID NOT NULL,
    ticket_number            VARCHAR(100) NOT NULL UNIQUE,
    qr_signature             TEXT NOT NULL,
    status                   VARCHAR(20) NOT NULL CHECK (status IN ('ISSUED', 'REDEEMED', 'VOIDED')),
    issued_at                TIMESTAMPTZ NOT NULL,
    redeemed_at              TIMESTAMPTZ,
    redeemed_by_user_id      UUID,
    redeemed_by_terminal_id  UUID
);

CREATE TABLE entry_scan (
    id                UUID PRIMARY KEY,  -- client-generated clientScanId
    ticket_id         UUID NOT NULL,
    gate_id           UUID NOT NULL,
    terminal_id       UUID NOT NULL,
    scanned_by_user_id UUID NOT NULL,
    scanned_at        TIMESTAMPTZ NOT NULL,
    result            VARCHAR(40) NOT NULL CHECK (result IN
        ('ACCEPTED', 'REJECTED_ALREADY_REDEEMED', 'REJECTED_INVALID_SIGNATURE', 'REJECTED_WRONG_GATE', 'REJECTED_UNKNOWN_TICKET'))
);

CREATE TABLE terminal (
    id                  UUID PRIMARY KEY,
    gate_id             UUID NOT NULL,
    device_label        VARCHAR(200),
    last_seen_at        TIMESTAMPTZ NOT NULL,
    local_pending_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_transaction_establishment ON transaction (establishment_id, created_at_client DESC);
CREATE INDEX idx_transaction_line_transaction ON transaction_line (transaction_id);
CREATE INDEX idx_ticket_transaction ON ticket (transaction_id);
CREATE INDEX idx_entry_scan_ticket ON entry_scan (ticket_id);
