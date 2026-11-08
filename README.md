# Nguon POS

Offline-first point-of-sale and event-ticketing system for the Nguon festival
gates. Standalone project — see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
for the full design, [`docs/SYNC_PROTOCOL.md`](docs/SYNC_PROTOCOL.md) and
[`docs/QR_TICKET_SPEC.md`](docs/QR_TICKET_SPEC.md) for the two protocols that
make offline operation safe.

**Current status**: event ticketing is feature-complete — offline sale and
entry scan with signed QR codes, multi-till sync, print modes (Standard /
Individuel / par type de billet), ticket and receipt designer, live admin
(dashboard, sales, reports with A4 print, tills, entry control, activity
journal, users, media library on MinIO) and the annual subscription module
(present, switched off by default, never blocks a till). Retail POS
(products, barcodes, till sessions) is not built yet.

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

## Tests

```bash
cd services/sales-service && mvn test     # sync idempotency, SQL injection, access rules (needs Docker)
cd services/catalog-service && mvn test   # subscription status rules
cd frontend/pos-pwa && npm test           # QR signature tamper checks, print modes
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
