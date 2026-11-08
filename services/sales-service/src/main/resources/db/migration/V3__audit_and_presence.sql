-- Activity journal (one per service schema, same shape everywhere — the
-- admin "Journal d'activité" reads all three together, see AuditQueryController).
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

-- Live presence: whether the till is reachable right now, and who is
-- logged in on it. `online` is persisted (not just derived from
-- last_seen_at) so the server can detect the online->offline transition
-- once and push it to admins, instead of each admin screen re-deriving it.
ALTER TABLE terminal
    ADD COLUMN online            BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN logged_in         BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN current_user_id   UUID,
    ADD COLUMN current_user_name VARCHAR(200);

CREATE INDEX idx_transaction_terminal ON transaction (terminal_id, created_at_client DESC);
