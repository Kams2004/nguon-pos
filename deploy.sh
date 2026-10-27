#!/bin/bash

# =========================================
# Deployment Helper Script for nguon-pos
# =========================================
# Usage:
#   ./deploy.sh up               -> Build and start all services
#   ./deploy.sh down             -> Stop and remove all containers (keeps volumes)
#   ./deploy.sh <service>        -> Rebuild and redeploy a single service
#                                    (auth-service | catalog-service | sales-service | pos-pwa | nginx)
#   ./deploy.sh logs <service>   -> Tail logs for a service
#   ./deploy.sh backup           -> Back up the Postgres database
#   ./deploy.sh ps               -> Show running services
#   ./deploy.sh help             -> Show this help message
# =========================================

set -euo pipefail
cd "$(dirname "$0")"

BACKUP_DIR="./pg_backups"

usage() {
    grep '^#' "$0" | cut -c 4-
    exit 0
}

up() {
    echo "Building and starting all services..."
    docker-compose up -d --build
}

down() {
    echo "Stopping and removing containers (volumes kept)..."
    docker-compose down
}

redeploy_service() {
    local service="$1"
    echo "Rebuilding: $service"
    docker-compose build "$service"
    # This docker-compose (1.29.2) hits `KeyError: 'ContainerConfig'` trying
    # to recreate-in-place against this Docker daemon's image metadata
    # format — remove the old container first so it creates fresh instead
    # of recreating. (The real fix is the `docker compose` v2 plugin; this
    # workaround exists until that's installed here.)
    docker-compose rm -f -s "$service"
    docker-compose up -d "$service"

    if [ "$service" != "nginx" ]; then
        # nginx's proxy_pass targets are plain hostnames (deliberately, see
        # nginx/pos.nguonevents.com.conf) resolved once at startup — a
        # redeployed backend container gets a new IP, so nginx needs a
        # restart too or it silently proxies to the old, now-dead address.
        echo "Restarting nginx to pick up $service's new address..."
        docker-compose restart nginx
    fi
}

backup() {
    local container
    container=$(docker-compose ps -q postgres)
    if [ -z "$container" ]; then
        echo "Postgres container is not running. Skipping backup."
        return
    fi
    mkdir -p "$BACKUP_DIR"
    local timestamp
    timestamp=$(date +"%Y%m%d_%H%M%S")
    local file="$BACKUP_DIR/nguonpos_backup_$timestamp.sql"
    echo "Backing up database to $file..."
    docker-compose exec -T postgres pg_dump -U "${POSTGRES_USER:-nguonpos}" "${POSTGRES_DB:-nguonpos}" > "$file"
    echo "Backup complete."
}

case "${1:-}" in
    up) up ;;
    down) down ;;
    auth-service|catalog-service|sales-service|pos-pwa|nginx) redeploy_service "$1" ;;
    logs) docker-compose logs -f "${2:-}" ;;
    backup) backup ;;
    ps) docker-compose ps ;;
    help|"") usage ;;
    *) echo "Unknown command: $1"; usage ;;
esac
