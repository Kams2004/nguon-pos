#!/bin/sh
# Runs ON THE VPS, as the only thing GitHub's upload key may run there
# (the key's "command=" in ~/.ssh/authorized_keys, set by setup-ci.sh):
#
#   ssh deploy@vps "receive 0.3.8" < bundle.tar
#
# The bundle holds the installers, one .sig per installer (raw Ed25519
# signature by the release key) and notes.txt. Nothing is trusted as sent:
# names are checked against a fixed list, each signature is verified here
# against the tills' public key, the SHA-256 and size are computed here.
# A version that already exists is never overwritten (published installers
# are immutable — a new build gets a new version number). Only then are the
# files put in place and the version registered; the tills still install it
# only once an admin clicks "Publier aux caisses".
set -eu
umask 022
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
PUB=$ROOT/edge/edge-service/src/main/resources/release/release-signing.pub
MAX_BYTES=629145600 # 600 MB: both installers with room to spare

set -f # no wildcard expansion of what the client sent
# shellcheck disable=SC2086
set -- ${SSH_ORIGINAL_COMMAND:-}
[ "$#" -eq 2 ] && [ "$1" = receive ] || { echo "usage: receive MAJOR.MINOR.PATCH < bundle.tar" >&2; exit 2; }
VERSION=$2
printf '%s' "$VERSION" | grep -Eqx '[0-9]{1,5}\.[0-9]{1,5}\.[0-9]{1,5}' || { echo "bad version" >&2; exit 2; }
DEST=$ROOT/releases/$VERSION
if [ -e "$DEST" ]; then
  echo "ALREADY_PUBLISHED $VERSION" >&2
  exit 3
fi
[ -r "$PUB" ] || { echo "release public key missing: $PUB" >&2; exit 1; }

mkdir -p "$ROOT/releases"
IN=$(mktemp -d "$ROOT/releases/.incoming-$VERSION.XXXXXX")
trap 'rm -rf "$IN"' EXIT

head -c "$MAX_BYTES" > "$IN/bundle.tar"

DEB="nguon-pos_${VERSION}_amd64.deb"
EXE="nguon-pos_${VERSION}_x64-setup.exe"
# Only these names, only plain files — no folders, links or paths.
tar -tf "$IN/bundle.tar" > "$IN/names" || { echo "not a tar archive (or cut short)" >&2; exit 1; }
while IFS= read -r name; do
  case "$name" in
    "$DEB" | "$DEB.sig" | "$EXE" | "$EXE.sig" | notes.txt) ;;
    *) echo "unexpected file in bundle: $name" >&2; exit 1 ;;
  esac
done < "$IN/names"
if tar -tvf "$IN/bundle.tar" | cut -c1 | grep -qv -- '-'; then
  echo "bundle may only hold plain files" >&2
  exit 1
fi
mkdir "$IN/x"
tar -xf "$IN/bundle.tar" -C "$IN/x" --no-same-owner --no-same-permissions
rm -f "$IN/bundle.tar"

FILES=""
accept() { # platform name
  f="$IN/x/$2"
  [ -f "$f" ] || return 0
  [ -f "$f.sig" ] || { echo "$2 has no signature" >&2; exit 1; }
  sha=$(sha256sum "$f" | cut -d ' ' -f 1)
  size=$(stat -c %s "$f")
  printf 'nguon-pos|%s|%s|%s' "$VERSION" "$1" "$sha" > "$IN/msg"
  openssl pkeyutl -verify -pubin -inkey "$PUB" -rawin -in "$IN/msg" -sigfile "$f.sig" >/dev/null 2>&1 \
    || { echo "$2: signature does not match the tills' release key" >&2; exit 1; }
  sig=$(base64 -w0 "$f.sig")
  entry=$(printf '{"platform":"%s","url":"/releases/%s/%s","sha256":"%s","signature":"%s","size":%s}' "$1" "$VERSION" "$2" "$sha" "$sig" "$size")
  FILES=${FILES:+$FILES,}$entry
  mkdir -p "$IN/out"
  mv "$f" "$IN/out/$2"
  chmod 644 "$IN/out/$2"
  echo "  $1: $2 ($size bytes, sha256 $sha) — signature OK" >&2
}
accept linux-deb "$DEB"
accept windows-nsis "$EXE"
[ -n "$FILES" ] || { echo "no installer in bundle" >&2; exit 1; }

NOTES=""
[ -f "$IN/x/notes.txt" ] && NOTES=$(head -c 2000 "$IN/x/notes.txt")

# In place in one move (same disk), then registered.
chmod 755 "$IN/out"
mv "$IN/out" "$DEST"

NOTES_B64=$(printf '%s' "$NOTES" | base64 -w0)
FILES_B64=$(printf '[%s]' "$FILES" | base64 -w0)
cd "$ROOT"
docker compose exec -T postgres sh -c "psql -q -v ON_ERROR_STOP=1 -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -v version=$VERSION -v notes=$NOTES_B64 -v files=$FILES_B64" <<'SQL' || { rm -rf "$DEST"; echo "registration failed; files removed" >&2; exit 1; }
INSERT INTO sales.release (version, notes, files)
VALUES (:'version', convert_from(decode(:'notes', 'base64'), 'UTF8'), convert_from(decode(:'files', 'base64'), 'UTF8'))
ON CONFLICT (version) DO UPDATE SET notes = excluded.notes, files = excluded.files;
SQL
echo "PUBLISHED $VERSION" >&2
