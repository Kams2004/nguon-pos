#!/bin/sh
# Backup of the nguon-pos stack (run in ~/nguon-pos on the VPS, nightly from
# cron — see deploy/vps/README.md):
#   backups/db/nguon-<date>.dump     the whole database (auth, catalog, sales), every run
#   backups/media/media-<date>.tgz   the media library (MinIO data), once a week
#   backups/images/minio-image.tar.gz  the MinIO image itself, once: MinIO no
#                                      longer publishes images anywhere
# Keeps 14 database dumps and 4 media archives. Copy them off the server with
# deploy/vps/pull-backups.sh, from your computer: a backup kept only on the
# server is lost with it. Only reads the stack; touches no other application.
set -eu
cd "$(dirname "$0")/../.."
OUT=${BACKUP_DIR:-backups}
umask 077
mkdir -p "$OUT/db" "$OUT/media" "$OUT/images"
OUT=$(cd "$OUT" && pwd)
stamp=$(date +%Y%m%d-%H%M)
log() { echo "$(date '+%F %T') $*"; }

# 1. Database: a consistent snapshot (pg_dump runs in one transaction), checked
#    readable before it replaces anything.
db="$OUT/db/nguon-$stamp.dump"
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' > "$db.part"
docker compose exec -T postgres pg_restore --list < "$db.part" > /dev/null
mv "$db.part" "$db"
log "database: $db ($(du -h "$db" | cut -f1))"
ls -1t "$OUT"/db/nguon-*.dump | tail -n +15 | xargs -r rm -f

# 2. Media library, weekly (it changes rarely). Read through the running
#    MinIO container's volume with the postgres image already on the server.
minio=$(docker compose ps -q minio 2>/dev/null || true)
if [ -n "$minio" ] && [ -z "$(find "$OUT/media" -name 'media-*.tgz' -mtime -6 2>/dev/null)" ]; then
  docker run --rm --volumes-from "$minio:ro" -v "$OUT/media:/backup" postgres:16-alpine \
    tar czf "/backup/media-$stamp.tgz" -C /data .
  log "media: $OUT/media/media-$stamp.tgz ($(du -h "$OUT/media/media-$stamp.tgz" | cut -f1))"
  ls -1t "$OUT"/media/media-*.tgz | tail -n +5 | xargs -r rm -f
fi

# 3. The MinIO image, once.
if [ -n "$minio" ] && [ ! -s "$OUT/images/minio-image.tar.gz" ]; then
  image=$(docker inspect --format '{{.Config.Image}}' "$minio")
  docker save "$image" | gzip > "$OUT/images/minio-image.tar.gz.part"
  mv "$OUT/images/minio-image.tar.gz.part" "$OUT/images/minio-image.tar.gz"
  echo "$image" > "$OUT/images/minio-image.name"
  log "image: $image saved (docker load < minio-image.tar.gz to restore it)"
fi
