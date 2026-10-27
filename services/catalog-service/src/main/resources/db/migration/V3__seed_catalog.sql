-- Milestone 1 walking-skeleton seed data — same fixed UUIDs referenced by
-- auth-service's seed users (see its V3__seed_users.sql for the convention).

INSERT INTO establishment (id, name, slug, brand_primary_color, brand_secondary_color, receipt_mode)
VALUES (
    '11111111-1111-1111-1111-111111111111',
    'Festival Nguon 2026',
    'nguon',
    '#0074B2',
    '#F2C300',
    'INDIVIDUAL_TICKETS'
);

-- Dev-only signing secret — rotate before any real deployment.
INSERT INTO gate (id, establishment_id, name, code, signing_secret, active)
VALUES (
    '22222222-2222-2222-2222-222222222222',
    '11111111-1111-1111-1111-111111111111',
    'Porte A',
    'GATE-A',
    'd7ddc139613033837653ee092ac3586be875ea05aca1040cb72a379ac7b22e6c',
    TRUE
);

INSERT INTO ticket_type (id, establishment_id, gate_id, name, price, currency, print_mode, active)
VALUES (
    '33333333-3333-3333-3333-333333333333',
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    'Entrée générale',
    2000,
    'XAF',
    'INDIVIDUAL',
    TRUE
);
