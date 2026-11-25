-- A cashier may work at several gates (Porte A and Porte B…), not just one.
-- No row = every gate, including gates created later. Each user's current
-- gate is kept as their one allowed gate. (Gates live in catalog-service:
-- logical reference, as before.)
CREATE TABLE user_gate (
    user_id UUID NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    gate_id UUID NOT NULL,
    PRIMARY KEY (user_id, gate_id)
);
CREATE INDEX idx_user_gate_gate ON user_gate (gate_id);

INSERT INTO user_gate (user_id, gate_id)
SELECT id, assigned_gate_id FROM app_user WHERE assigned_gate_id IS NOT NULL AND role <> 'SUPER_ADMIN';

ALTER TABLE app_user DROP COLUMN assigned_gate_id;
