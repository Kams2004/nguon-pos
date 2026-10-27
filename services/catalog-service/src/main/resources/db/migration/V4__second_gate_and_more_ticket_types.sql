-- Milestone 2: a second gate, and more ticket types including one in
-- STANDARD print mode, to actually exercise the print-mode switch and
-- gate-exclusive ticket types across more than one gate. Dev-only signing
-- secret — rotate before any real deployment.

INSERT INTO gate (id, establishment_id, name, code, signing_secret, active)
VALUES (
    '55555555-5555-5555-5555-555555555555',
    '11111111-1111-1111-1111-111111111111',
    'Porte B',
    'GATE-B',
    '4d015104f8ccaa8023324c9543a66ecfaa1cc5512ce4d1b016fab0b1c51a9482',
    TRUE
);

-- More ticket types at Gate A: one still INDIVIDUAL (a second admission
-- tier) and one STANDARD (a single combined receipt, not one card per unit
-- — e.g. a group/family pass where the point is one proof-of-purchase, not
-- per-person tear-apart tickets).
INSERT INTO ticket_type (id, establishment_id, gate_id, name, price, currency, print_mode, active)
VALUES
    ('66666666-6666-6666-6666-666666666666',
     '11111111-1111-1111-1111-111111111111',
     '22222222-2222-2222-2222-222222222222',
     'Pass VIP', 10000, 'XAF', 'INDIVIDUAL', TRUE),
    ('77777777-7777-7777-7777-777777777777',
     '11111111-1111-1111-1111-111111111111',
     '22222222-2222-2222-2222-222222222222',
     'Pass Groupe (reçu unique)', 1500, 'XAF', 'STANDARD', TRUE);

-- Gate B gets its own, separate ticket type — proves gate-exclusivity:
-- this type (and the tickets sold under it) is only ever usable at Gate B.
INSERT INTO ticket_type (id, establishment_id, gate_id, name, price, currency, print_mode, active)
VALUES (
    '88888888-8888-8888-8888-888888888888',
    '11111111-1111-1111-1111-111111111111',
    '55555555-5555-5555-5555-555555555555',
    'Entrée générale', 2000, 'XAF', 'INDIVIDUAL', TRUE
);
