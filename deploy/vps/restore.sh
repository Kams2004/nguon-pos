#!/bin/sh
# Restores a database dump made by backup.sh (run in ~/nguon-pos).
#
#   sh deploy/vps/restore.sh backups/db/nguon-20261110-0315.dump --test
#       Restores into a separate database "nguon_restore_test", compares row
#       counts with the live one, then drops it. Changes nothing live: run it
#       now and then, to know the backups really work.
#
#   sh deploy/vps/restore.sh backups/db/nguon-20261110-0315.dump --replace
#       Replaces the live data with the dump (asks to type the database name).
#       The services are stopped meanwhile; nginx is restarted at the end.
set -eu
cd "$(dirname "$0")/../.."
DUMP=${1:?dump file}
MODE=${2:?--test or --replace}
[ -s "$DUMP" ] || { echo "No such dump: $DUMP" >&2; exit 1; }
TABLES="auth.app_user catalog.gate catalog.ticket_type sales.transaction sales.ticket sales.entry_scan sales.device"

count() { # database
  for t in $TABLES; do
    printf '%s=' "$t"
    docker compose exec -T postgres sh -c "psql -qtA -U \"\$POSTGRES_USER\" -d $1 -c 'SELECT count(*) FROM $t'" 2>/dev/null || echo "?"
  done
}

case "$MODE" in
  --test)
    docker compose exec -T postgres sh -c 'dropdb -U "$POSTGRES_USER" --if-exists nguon_restore_test && createdb -U "$POSTGRES_USER" nguon_restore_test'
    docker compose exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d nguon_restore_test --no-owner --exit-on-error' < "$DUMP"
    live_db=$(docker compose exec -T postgres sh -c 'echo $POSTGRES_DB')
    echo "Rows (restored copy | live now — live may have grown since the dump):"
    count nguon_restore_test > /tmp/nguon-restored.$$
    count "$live_db" > /tmp/nguon-live.$$
    paste -d '|' /tmp/nguon-restored.$$ /tmp/nguon-live.$$ | sed 's/^/  /'
    rm -f /tmp/nguon-restored.$$ /tmp/nguon-live.$$
    docker compose exec -T postgres sh -c 'dropdb -U "$POSTGRES_USER" nguon_restore_test'
    echo "Test restore OK: the dump is complete and readable."
    ;;
  --replace)
    live_db=$(docker compose exec -T postgres sh -c 'echo $POSTGRES_DB')
    printf 'This REPLACES all live data with %s.\nType the database name (%s) to continue: ' "$DUMP" "$live_db"
    read -r answer
    [ "$answer" = "$live_db" ] || { echo "Cancelled."; exit 1; }
    docker compose stop auth-service catalog-service sales-service
    docker compose exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --exit-on-error' < "$DUMP"
    docker compose start auth-service catalog-service sales-service
    sleep 20
    docker compose restart nginx
    echo "Restored. Tills resync by themselves: what they hold that the dump lacks is sent again."
    ;;
  *) echo "Mode must be --test or --replace" >&2; exit 1 ;;
esac
