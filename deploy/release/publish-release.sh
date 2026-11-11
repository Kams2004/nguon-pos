#!/bin/sh
# Publishes a desktop till version: signs each installer with the release
# key, uploads them to the VPS (served at https://pos.nguonevents.com/releases/)
# and registers the version. Tills only install it once a super admin picks
# it in Administration → Versions ("Publier aux caisses").
#
#   deploy/release/publish-release.sh 0.2.0 path/to/nguon-pos_0.2.0_amd64.deb path/to/Nguon\ POS_0.2.0_x64-setup.exe "Notes"
#
# Either installer may be "-" to skip it. The installers come from the
# GitHub "release-desktop" workflow (tag desktop-v0.2.0) or a local build;
# their version must equal desktop/src-tauri/tauri.conf.json at that tag.
#
# Environment:
#   NGUON_RELEASE_KEY  private Ed25519 key (default ~/nguon-pos-release-key/release-signing.key) — keep it offline
#   NGUON_VPS          ssh target (default deploy@167.86.120.214)
#   NGUON_VPS_DIR      stack folder on the VPS (default nguon-pos)
set -eu
VERSION=${1:?version, e.g. 0.2.0}
DEB=${2:?.deb file or -}
EXE=${3:?Windows setup .exe or -}
NOTES=${4:-}
KEY=${NGUON_RELEASE_KEY:-$HOME/nguon-pos-release-key/release-signing.key}
VPS=${NGUON_VPS:-deploy@167.86.120.214}
DIR=${NGUON_VPS_DIR:-nguon-pos}
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
PUB=$ROOT/edge/edge-service/src/main/resources/release/release-signing.pub

printf '%s' "$VERSION" | grep -Eqx '[0-9]{1,5}\.[0-9]{1,5}\.[0-9]{1,5}' || { echo "Version must be MAJOR.MINOR.PATCH" >&2; exit 1; }
[ -r "$KEY" ] || { echo "Release key not found: $KEY" >&2; exit 1; }
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
FILES=""

add() { # platform source published-name
  [ "$2" = "-" ] && return 0
  [ -f "$2" ] || { echo "Missing $2" >&2; exit 1; }
  cp "$2" "$TMP/$3"
  sha=$(sha256sum "$TMP/$3" | cut -d ' ' -f 1)
  size=$(stat -c %s "$TMP/$3")
  printf 'nguon-pos|%s|%s|%s' "$VERSION" "$1" "$sha" > "$TMP/msg"
  openssl pkeyutl -sign -inkey "$KEY" -rawin -in "$TMP/msg" -out "$TMP/sig"
  # Check against the key built into the tills before anything leaves this machine.
  openssl pkeyutl -verify -pubin -inkey "$PUB" -rawin -in "$TMP/msg" -sigfile "$TMP/sig" >/dev/null \
    || { echo "The key does not match the tills' release key ($PUB)" >&2; exit 1; }
  sig=$(base64 -w0 "$TMP/sig")
  entry=$(printf '{"platform":"%s","url":"/releases/%s/%s","sha256":"%s","signature":"%s","size":%s}' "$1" "$VERSION" "$3" "$sha" "$sig" "$size")
  FILES=${FILES:+$FILES,}$entry
  echo "  $1: $3 ($size bytes, sha256 $sha)"
}

echo "Signing $VERSION…"
if [ "$DEB" != "-" ]; then
  [ "$(dpkg-deb -f "$DEB" Version)" = "$VERSION" ] || { echo "$DEB is not version $VERSION" >&2; exit 1; }
fi
add linux-deb "$DEB" "nguon-pos_${VERSION}_amd64.deb"
add windows-nsis "$EXE" "nguon-pos_${VERSION}_x64-setup.exe"
[ -n "$FILES" ] || { echo "Nothing to publish" >&2; exit 1; }

echo "Uploading to $VPS:$DIR/releases/$VERSION/…"
ssh "$VPS" "mkdir -p '$DIR/releases/$VERSION/.upload'"
# Into a hidden folder first, resuming after a dropped connection (up to 5
# tries); the files are moved into place only once their SHA-256 matches on
# the server, so a cut upload never sits under the published name.
for f in "$TMP"/nguon-pos_*; do
  name=$(basename "$f")
  tries=0
  until rsync -q --partial --timeout=60 "$f" "$VPS:$DIR/releases/$VERSION/.upload/$name"; do
    tries=$((tries + 1))
    [ "$tries" -lt 5 ] || { echo "Upload of $name kept failing; run the script again to resume." >&2; exit 1; }
    echo "  connection lost, resuming $name ($tries/5)…"
    sleep 5
  done
  want=$(sha256sum "$f" | cut -d ' ' -f 1)
  got=$(ssh "$VPS" "sha256sum '$DIR/releases/$VERSION/.upload/$name' | cut -d ' ' -f 1")
  [ "$want" = "$got" ] || { echo "$name arrived damaged on the server (SHA-256 differs); run the script again." >&2; exit 1; }
  ssh "$VPS" "mv -f '$DIR/releases/$VERSION/.upload/$name' '$DIR/releases/$VERSION/$name'"
  echo "  $name: uploaded and checked on the server"
done
ssh "$VPS" "rmdir '$DIR/releases/$VERSION/.upload' 2>/dev/null || true"

# Values travel base64-encoded (shell- and SQL-safe), decoded by Postgres; psql
# binds them as literals (:'var'), never pasted into the SQL text.
NOTES_B64=$(printf '%s' "$NOTES" | base64 -w0)
FILES_B64=$(printf '[%s]' "$FILES" | base64 -w0)
ssh "$VPS" "cd '$DIR' && docker compose exec -T postgres sh -c 'psql -q -v ON_ERROR_STOP=1 -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -v version=$VERSION -v notes=$NOTES_B64 -v files=$FILES_B64'" <<'SQL'
INSERT INTO sales.release (version, notes, files)
VALUES (:'version', convert_from(decode(:'notes', 'base64'), 'UTF8'), convert_from(decode(:'files', 'base64'), 'UTF8'))
ON CONFLICT (version) DO UPDATE SET notes = excluded.notes, files = excluded.files;
SQL
echo "Version $VERSION registered. Publish it to the tills in Administration → Versions."
