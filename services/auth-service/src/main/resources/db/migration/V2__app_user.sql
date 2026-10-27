CREATE TABLE app_user (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    establishment_id UUID NOT NULL,
    username         VARCHAR(100) NOT NULL UNIQUE,
    password_hash    VARCHAR(100) NOT NULL,
    full_name        VARCHAR(200) NOT NULL,
    role             VARCHAR(20) NOT NULL CHECK (role IN ('CASHIER', 'COORDINATOR', 'SUPER_ADMIN')),
    assigned_gate_id UUID,
    active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_app_user_establishment ON app_user (establishment_id);
