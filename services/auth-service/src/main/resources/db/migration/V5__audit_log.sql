-- Activity journal — same shape in every service schema (see sales-service's AuditQueryController).
CREATE TABLE audit_log (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    service       VARCHAR(20) NOT NULL,
    category      VARCHAR(30) NOT NULL,
    action        VARCHAR(60) NOT NULL,
    actor_user_id UUID,
    actor_name    VARCHAR(200),
    entity_type   VARCHAR(40),
    entity_id     VARCHAR(100),
    summary       TEXT NOT NULL
);
CREATE INDEX idx_audit_log_occurred ON audit_log (occurred_at DESC);
