-- Desktop tills ("devices"): each installation is enrolled once with a
-- one-time code, gets a certificate signed by the device CA, and from then
-- on is identified by that certificate (mutual TLS on edge.pos.nguonevents.com).
CREATE TABLE device (
    id                  UUID PRIMARY KEY,   -- also its terminal id (presence, sales)
    establishment_id    UUID NOT NULL,
    gate_id             UUID NOT NULL,
    device_no           INTEGER NOT NULL,   -- 1, 2, 3… per gate
    label               VARCHAR(200) NOT NULL,
    status              VARCHAR(20) NOT NULL CHECK (status IN ('ACTIVE', 'REVOKED')),
    public_key          TEXT NOT NULL,      -- verifies the records it signs
    cert_serial         VARCHAR(64) NOT NULL,
    cert_fingerprint    VARCHAR(64) NOT NULL UNIQUE,  -- SHA-256 of the certificate
    cert_not_after      TIMESTAMPTZ NOT NULL,
    enrolled_at         TIMESTAMPTZ NOT NULL,
    enrolled_by_user_id UUID,
    os                  VARCHAR(100),
    app_version         VARCHAR(40),
    revoked_at          TIMESTAMPTZ,
    revoked_by_user_id  UUID,
    UNIQUE (gate_id, device_no)
);

CREATE TABLE enrollment_code (
    code_hash          VARCHAR(64) PRIMARY KEY,  -- SHA-256 of the code; the code itself is never stored
    establishment_id   UUID NOT NULL,
    gate_id            UUID NOT NULL,
    label              VARCHAR(200) NOT NULL,
    created_by_user_id UUID,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at         TIMESTAMPTZ NOT NULL,
    used_at            TIMESTAMPTZ,
    used_by_device_id  UUID
);

-- Per origin device: the last record sequence number central holds, so a
-- till that reconnects resumes exactly where it stopped.
CREATE TABLE edge_origin_watermark (
    origin_device_id UUID PRIMARY KEY,
    last_seq         BIGINT NOT NULL
);

-- What each gate's tills must hear about (sales and scans from the other
-- tills of the gate, voids), written in the same transaction as the change.
-- Tills read it from their last cursor.
CREATE TABLE edge_feed (
    id               BIGSERIAL PRIMARY KEY,
    establishment_id UUID NOT NULL,
    gate_id          UUID NOT NULL,
    type             VARCHAR(30) NOT NULL,
    origin_device_id UUID,
    payload          TEXT NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_edge_feed_gate ON edge_feed (gate_id, id);
