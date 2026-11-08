-- Annual subscription module (cahier §9). Present from the first version
-- but disabled at launch: nothing in the sale/print/sync path reads these
-- tables, so a missing or expired subscription never blocks a till.
-- Attached to the establishment as a whole, not to individual tills.

-- One row per establishment, created on first save. The price lives here,
-- never in code; each period copies the price in force when it is created,
-- so a later tariff change never rewrites what a running period costs.
CREATE TABLE subscription_settings (
    establishment_id  UUID PRIMARY KEY REFERENCES establishment (id),
    module_enabled    BOOLEAN       NOT NULL DEFAULT FALSE,
    annual_price      NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (annual_price >= 0),
    currency          VARCHAR(10)   NOT NULL DEFAULT 'XAF',
    duration_months   INTEGER       NOT NULL DEFAULT 12 CHECK (duration_months BETWEEN 1 AND 60),
    reminder_days     INTEGER       NOT NULL DEFAULT 30 CHECK (reminder_days BETWEEN 0 AND 365),
    grace_days        INTEGER       NOT NULL DEFAULT 15 CHECK (grace_days BETWEEN 0 AND 365),
    auto_renew        BOOLEAN       NOT NULL DEFAULT FALSE,
    updated_at        TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE TABLE subscription_period (
    id                UUID PRIMARY KEY,
    establishment_id  UUID          NOT NULL REFERENCES establishment (id),
    start_date        DATE          NOT NULL,
    end_date          DATE          NOT NULL CHECK (end_date >= start_date),
    price             NUMERIC(14,2) NOT NULL CHECK (price >= 0),
    currency          VARCHAR(10)   NOT NULL,
    status            VARCHAR(20)   NOT NULL CHECK (status IN ('PENDING_PAYMENT', 'PAID', 'CANCELLED')),
    note              VARCHAR(500),
    created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
    created_by_name   VARCHAR(200)
);
CREATE INDEX idx_subscription_period_establishment ON subscription_period (establishment_id, start_date DESC);

-- Payments against a period: recorded by hand today (paid offline), and
-- later by a payment provider's confirmation — provider + provider_reference
-- are what a future API integration fills in.
CREATE TABLE subscription_payment (
    id                  UUID PRIMARY KEY,
    period_id           UUID          NOT NULL REFERENCES subscription_period (id),
    amount              NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    currency            VARCHAR(10)   NOT NULL,
    method              VARCHAR(20)   NOT NULL CHECK (method IN ('CASH', 'BANK_TRANSFER', 'MOBILE_MONEY', 'CARD', 'ONLINE', 'OTHER')),
    status              VARCHAR(20)   NOT NULL CHECK (status IN ('PENDING', 'CONFIRMED', 'FAILED', 'REFUNDED')),
    provider            VARCHAR(50),
    provider_reference  VARCHAR(200),
    paid_at             TIMESTAMPTZ   NOT NULL,
    note                VARCHAR(500),
    recorded_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
    recorded_by_name    VARCHAR(200)
);
CREATE INDEX idx_subscription_payment_period ON subscription_payment (period_id);
