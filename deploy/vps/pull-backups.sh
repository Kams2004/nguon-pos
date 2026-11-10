#!/bin/sh
# Copies the VPS backups to this computer (run here, not on the server):
#   sh deploy/vps/pull-backups.sh            → ~/nguon-pos-backups/
# Run it regularly (or from your own cron): a backup that exists only on the
# server disappears with the server.
set -eu
VPS=${NGUON_VPS:-deploy@167.86.120.214}
DEST=${1:-$HOME/nguon-pos-backups}
mkdir -p "$DEST"
chmod 700 "$DEST"
rsync -a --info=stats1 "$VPS:nguon-pos/backups/" "$DEST/"
echo "Backups in $DEST:"
ls -lt "$DEST/db" | head -4
