# Nguon POS — Architecture

Standalone project, deployed on the same VPS as the Nguon festival site but with
no shared database, backend process, or auth with it. Phase 1 scope is **event
ticketing only** (gate laptops selling/validating entry tickets); general retail
POS, full reporting, and subscription-payment enforcement are deferred, but the
data model is multi-tenant-ready so none of that requires a rewrite later.

## Services

| Service | Owns | Routed at |
|---|---|---|
| `auth-service` | Users, roles (CASHIER / COORDINATOR / SUPER_ADMIN), JWT issuance/validation | `/api/auth/**` |
| `catalog-service` | Establishment, Gate, TicketType, subscription-status placeholder | `/api/catalog/**` |
| `sales-service` | Transaction, Ticket, EntryScan, offline-sync ingestion, idempotency | `/api/sales/**` |
| `pos-pwa` | Cashier/scan/admin UI, offline queue, service worker | `/` |

No dedicated API-gateway service — nginx does path-based routing (see
`nginx/pos.nguonevents.com.conf`), matching the existing VPS's ops pattern. Each
service validates JWTs and enforces `@PreAuthorize` role checks independently;
nothing is trusted just because it arrived through nginx.

Entry-validation logic lives *inside* `sales-service` (a `validation` package,
not a separate deployable) — a scan is a state transition on the same `Ticket`
row/transactional boundary as issuance, and gate-exclusive tickets (see below)
mean it never needs to reach across services.

## Why gate-exclusive tickets

A ticket sold at Gate A can only ever be scanned/admitted at Gate A. This is a
deliberate scoping decision (confirmed with the client) that removes the hard
cross-gate distributed-duplicate-prevention problem — each gate validates fully
offline against its own locally-cached, locally-issued ticket list, with no
coordination needed between gates. The one remaining edge case — two laptops at
the *same* gate racing on the same ticket — is handled explicitly in
`QR_TICKET_SPEC.md`, not ignored.

## Data model (summary)

Every establishment-scoped table carries `establishment_id` explicitly, even
though only one establishment exists today — onboarding a second one later is
inserting rows, not a migration.

`establishment`, `subscription_status` + `subscription_payment` (present,
**not enforced** in Phase 1), `gate` (= "till"), `terminal` (one row per
physical laptop), `app_user` (role = fixed enum, `assigned_gate_id`),
`ticket_type` (= "product"), `transaction` (`idempotency_key` unique,
`reference_number` assigned server-side on first insert), `transaction_line`,
`ticket` (one row per individually-scannable ticket), `entry_scan`
(append-only audit log).

Each service owns its own logical Postgres **schema** (`auth`, `catalog`,
`sales`) inside one `postgres` container — simplest ops for Phase 1, while
keeping code-level ownership clean: no cross-schema SQL foreign keys, ever.
Flyway migrations per service from day one (`services/<name>/src/main/resources/db/migration/`),
not `ddl-auto=update`.

## Auth — deliberately not repeating the festival backend's mistakes

Verified directly in `/home/kamsu-perold/Nguon-backend` before writing this:
- `JwtUtil.java` generates a new random signing key on every boot
  (`Keys.secretKeyFor(...)`) — tokens invalidate on restart, can't work across
  replicas. **Here**: `JWT_SIGNING_SECRET` is an env var, read once, stable.
- `SecurityConfig.java` is `.anyRequest().permitAll()` — the JWT filter runs but
  nothing is actually access-restricted. **Here**: every service denies by
  default except its health probe, from the very first commit (see each
  service's `config/SecurityConfig.java`); `@PreAuthorize` role checks land
  with the business logic in Milestone 1.

## Database access and SQL injection

User input never becomes SQL text. Every query is one of:

- Spring Data derived queries or JPQL with named parameters
  (`TicketTypeRepository.findSellableAtGate`);
- JPA Criteria `Specification`s built from typed request parameters
  (`UUID`, `Instant`, enums) — sale list, scan list. A value that doesn't
  parse is a 400 before any query runs;
- `JdbcTemplate` with `?` bind parameters, where the SQL string itself is
  assembled only from constants (audit writes, the consolidated journal).
  Free-text search escapes `%`/`_` (`ESCAPE '\'`) so they match literally,
  and the journal's category is checked against a fixed list.

Request bodies carry `@Valid` with `@Size` limits that match the column
lengths, so oversized input is a clean 400. `SalesSecurityIntegrationTest`
replays injection payloads against a real Postgres and checks the tables are
untouched. Keep new code to these three forms; never concatenate a request
value into a query string, an `ORDER BY`, or a table/column name.

## Build order

See the approved plan at `/home/kamsu-perold/.claude/plans/linear-conjuring-badger.md`
for the full milestone breakdown. Summary:

0. **Skeleton & infra** (this commit) — empty services with health checks,
   nginx routing, installable blank PWA shell, `docker-compose up` works from a
   fresh checkout.
1. **Walking skeleton** — one gate, one ticket type, real auth, full offline
   sale → sync → scan loop proven end to end before any polish.
2. **Real catalog & receipt fidelity**.
3. **Admin completeness**.
4. **Theme match & hardening**.

## Open items

- Real DNS for `pos.nguonevents.com` (or whatever subdomain is chosen) before
  the nginx config in this repo can go live on the VPS.
- VPS deploy path for this project (sibling directory to `~/nguon-app`).
