CREATE TABLE establishment (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                  VARCHAR(200) NOT NULL,
    slug                  VARCHAR(100) NOT NULL UNIQUE,
    logo_url              TEXT,
    brand_primary_color   VARCHAR(20),
    brand_secondary_color VARCHAR(20),
    receipt_mode          VARCHAR(30) NOT NULL CHECK (receipt_mode IN ('STANDARD', 'INDIVIDUAL_TICKETS', 'CONFIGURABLE_PER_TICKET_TYPE')),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE gate (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    establishment_id UUID NOT NULL REFERENCES establishment (id),
    name             VARCHAR(200) NOT NULL,
    code             VARCHAR(50) NOT NULL UNIQUE,
    signing_secret   TEXT NOT NULL,
    active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ticket_type (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    establishment_id UUID NOT NULL REFERENCES establishment (id),
    gate_id          UUID REFERENCES gate (id),
    name             VARCHAR(200) NOT NULL,
    price            NUMERIC(12, 2) NOT NULL,
    currency         VARCHAR(10) NOT NULL,
    print_mode       VARCHAR(30) NOT NULL CHECK (print_mode IN ('STANDARD', 'INDIVIDUAL', 'INHERIT_ESTABLISHMENT')),
    active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_gate_establishment ON gate (establishment_id);
CREATE INDEX idx_ticket_type_establishment ON ticket_type (establishment_id);
CREATE INDEX idx_ticket_type_gate ON ticket_type (gate_id);
