# Nguon POS

Offline-first point-of-sale and event-ticketing system for the Nguon festival
gates. Standalone project — see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
for the full design, [`docs/SYNC_PROTOCOL.md`](docs/SYNC_PROTOCOL.md) and
[`docs/QR_TICKET_SPEC.md`](docs/QR_TICKET_SPEC.md) for the two protocols that
make offline operation safe.

**Current status**: Milestone 0 (skeleton & infra) — three Spring Boot
services with health checks, an installable blank PWA shell, nginx path-based
routing, all wired through `docker-compose`. No business logic yet; that's
Milestone 1.

## Local development

```bash
cp .env.example .env          # fill in real values
./deploy.sh up                # builds and starts everything
./deploy.sh ps                # check status
curl http://localhost:8081/api/auth/actuator/health
curl http://localhost:8081/api/catalog/actuator/health
curl http://localhost:8081/api/sales/actuator/health
open http://localhost:8081    # the PWA shell, with live service status tiles
```

```bash
./deploy.sh logs sales-service   # tail one service's logs
./deploy.sh auth-service         # rebuild & redeploy just that service
./deploy.sh down                 # stop everything (keeps the DB volume)
```

## Services

| Path | What |
|---|---|
| `services/auth-service/` | Users, roles, JWT (Spring Boot) |
| `services/catalog-service/` | Establishment, gates, ticket types (Spring Boot) |
| `services/sales-service/` | Transactions, tickets, entry validation, sync (Spring Boot) |
| `frontend/pos-pwa/` | Cashier/scan/admin UI, offline-first PWA (React + Vite + TS) |
| `nginx/` | Path-based routing config |

Each Spring Boot service owns its own Postgres schema and its own Flyway
migrations under `src/main/resources/db/migration/` — no cross-schema
foreign keys, ever.
