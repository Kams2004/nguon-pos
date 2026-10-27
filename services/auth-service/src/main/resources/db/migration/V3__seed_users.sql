-- Milestone 1 walking-skeleton seed data. establishment_id / gate_id are
-- fixed, well-known UUIDs shared across auth-service, catalog-service and
-- sales-service's own seed migrations (there's no cross-schema FK to
-- enforce this — it's a documented convention for Phase 1's single
-- establishment, "Nguon Festival 2026" / "Gate A").
--
-- Passwords are throwaway dev credentials for the walking-skeleton demo —
-- rotate/remove before anything resembling a real deployment.
--   admin / admin123      (SUPER_ADMIN)
--   cashier1 / cashier123 (CASHIER, assigned to Gate A)

INSERT INTO app_user (id, establishment_id, username, password_hash, full_name, role, assigned_gate_id, active)
VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
     '11111111-1111-1111-1111-111111111111',
     'admin',
     '$2a$10$e88YeXXHHlZ8Mk2MLgCaye2fPFH4K0rnrv/jlJyEkuVmKO/XrVoeO',
     'Super Admin',
     'SUPER_ADMIN',
     NULL,
     TRUE),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
     '11111111-1111-1111-1111-111111111111',
     'cashier1',
     '$2a$10$swhr2yZMrd1pRMRYp576BuDbI7.y75CW8K5d.Xath7Bw6k7hDsLpO',
     'Caissier Porte A',
     'CASHIER',
     '22222222-2222-2222-2222-222222222222',
     TRUE);
