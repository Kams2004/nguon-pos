-- Who worked on which till, at which gate, from when to when: one row per
-- cashier session central saw (tills report who is signed in every 10 s).
-- A session lived entirely offline is not seen here; its sales still name
-- the cashier, the till and the gate.
CREATE TABLE till_session (
    id           UUID PRIMARY KEY,
    terminal_id  UUID NOT NULL,
    gate_id      UUID NOT NULL,
    device_label VARCHAR(200),
    user_id      UUID NOT NULL,
    user_name    VARCHAR(200),
    started_at   TIMESTAMPTZ NOT NULL,
    last_seen_at TIMESTAMPTZ NOT NULL,
    ended_at     TIMESTAMPTZ
);
CREATE INDEX idx_till_session_started ON till_session (started_at);
CREATE INDEX idx_till_session_user ON till_session (user_id, started_at);
-- At most one open session per till.
CREATE UNIQUE INDEX idx_till_session_open ON till_session (terminal_id) WHERE ended_at IS NULL;
