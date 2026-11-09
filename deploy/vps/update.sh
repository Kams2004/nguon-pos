#!/bin/sh
# Updates the nguon-pos stack on the VPS (run in ~/nguon-pos). Touches only
# this project's containers. Usage:  sh deploy/vps/update.sh [service…]
# Without arguments it rebuilds the three services and the frontend.
#
# nginx looks up the containers' addresses once, when it starts: a rebuilt
# container may come back on another address (502 Bad Gateway), so nginx is
# always restarted at the end.
set -eu
cd "$(dirname "$0")/../.."
SERVICES=${*:-auth-service catalog-service sales-service pos-pwa}
git pull --ff-only
mkdir -p releases
# One at a time: the server is shared with other applications.
for s in $SERVICES; do docker compose build "$s"; done
docker compose up -d --no-deps $SERVICES
echo "Waiting for the services to start…"
for i in $(seq 1 60); do
  sleep 2
  if docker compose logs --since 3m sales-service 2>/dev/null | grep -q "Started SalesServiceApplication" \
     || ! echo "$SERVICES" | grep -q sales-service; then break; fi
done
docker compose up -d --no-deps nginx
docker compose restart nginx
sleep 2
code=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:${POS_HTTP_PORT:-8090}/)
echo "Site: HTTP $code"
