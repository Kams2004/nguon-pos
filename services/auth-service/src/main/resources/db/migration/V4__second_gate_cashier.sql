-- Milestone 2: a cashier for Gate B (see catalog-service's
-- V4__second_gate_and_more_ticket_types.sql) — proves multi-gate support.
-- Same throwaway dev password as cashier1: cashier2 / cashier123

INSERT INTO app_user (id, establishment_id, username, password_hash, full_name, role, assigned_gate_id, active)
VALUES (
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    '11111111-1111-1111-1111-111111111111',
    'cashier2',
    '$2a$10$swhr2yZMrd1pRMRYp576BuDbI7.y75CW8K5d.Xath7Bw6k7hDsLpO',
    'Caissier Porte B',
    'CASHIER',
    '55555555-5555-5555-5555-555555555555',
    TRUE
);
