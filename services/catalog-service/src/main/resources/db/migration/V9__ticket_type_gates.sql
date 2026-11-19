-- A ticket type can be sold at several gates (Porte A and Porte C, not B),
-- not just one or all. No row = sold at every gate, as before.
CREATE TABLE ticket_type_gate (
    ticket_type_id UUID NOT NULL REFERENCES ticket_type (id) ON DELETE CASCADE,
    gate_id        UUID NOT NULL REFERENCES gate (id),
    PRIMARY KEY (ticket_type_id, gate_id)
);
CREATE INDEX idx_ticket_type_gate_gate ON ticket_type_gate (gate_id);

INSERT INTO ticket_type_gate (ticket_type_id, gate_id)
SELECT id, gate_id FROM ticket_type WHERE gate_id IS NOT NULL;

DROP INDEX idx_ticket_type_gate;
ALTER TABLE ticket_type DROP COLUMN gate_id;
