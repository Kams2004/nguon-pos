#!/bin/sh
# One-time setup so GitHub publishes till versions by itself
# (.github/workflows/publish-desktop.yml) — run from the computer that holds
# the release key and can already reach the VPS:
#
#   sh deploy/release/setup-ci.sh
#
# It:
#   1. updates the code checkout on the VPS (git pull — no container is
#      restarted), so receive-release.sh is there;
#   2. creates an upload key for GitHub and allows it on the VPS ONLY to run
#      receive-release.sh (no shell, no forwarding) — replacing any previous
#      upload key;
#   3. checks both: your own login still works, and the upload key can do
#      nothing but that;
#   4. puts the three values GitHub needs in a private folder, for you to
#      paste into GitHub (environment "release"), then delete.
#
# Run it again any time to replace the upload key (e.g. if it leaked).
set -eu
VPS=${NGUON_VPS:-deploy@167.86.120.214}
DIR=${NGUON_VPS_DIR:-nguon-pos}
KEY=${NGUON_RELEASE_KEY:-$HOME/nguon-pos-release-key/release-signing.key}
HOST=${VPS#*@}
OUT=$HOME/nguon-pos-ci-secrets
LABEL=nguon-pos-ci-upload

[ -r "$KEY" ] || { echo "Release key not found: $KEY" >&2; exit 1; }
known=$(ssh-keygen -F "$HOST" 2>/dev/null | grep -v '^#' || true)
[ -n "$known" ] || { echo "$HOST is not in ~/.ssh/known_hosts — connect once with: ssh $VPS" >&2; exit 1; }

echo "1. Updating the code on the server (git pull, nothing restarted)…"
ssh "$VPS" "cd '$DIR' && git pull -q --ff-only && test -f deploy/release/receive-release.sh"

echo "2. Creating GitHub's upload key…"
rm -rf "$OUT"
mkdir -m 700 "$OUT"
ssh-keygen -q -t ed25519 -N '' -C "$LABEL" -f "$OUT/upload-key"
LINE="command=\"sh $DIR/deploy/release/receive-release.sh\",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty,no-user-rc $(cat "$OUT/upload-key.pub")"
# Every existing line is kept except a previous upload key; written to a new
# file and moved into place, so a cut connection never leaves it half-written.
printf '%s\n' "$LINE" | ssh "$VPS" 'set -e; f=$HOME/.ssh/authorized_keys; cp "$f" "$f.bak-ci"; { grep -v "'"$LABEL"'" "$f" || true; cat; } > "$f.new"; chmod 600 "$f.new"; mv "$f.new" "$f"'

echo "3. Checking…"
ssh -o BatchMode=yes "$VPS" true || { echo "Your own login stopped working! Restore with: ssh $VPS 'cp ~/.ssh/authorized_keys.bak-ci ~/.ssh/authorized_keys'" >&2; exit 1; }
set +e
reply=$(ssh -i "$OUT/upload-key" -o IdentitiesOnly=yes -o BatchMode=yes "$VPS" "id" 2>&1 < /dev/null)
code=$?
set -e
if [ "$code" -ne 2 ]; then
  echo "The upload key did not behave as expected (exit $code): $reply" >&2
  exit 1
fi
echo "   your login: OK — upload key: can only publish ('id' was refused: $reply)"

printf '%s\n' "$known" > "$OUT/known_hosts"
cp "$KEY" "$OUT/release-signing.key"
rm -f "$OUT/upload-key.pub"
chmod 600 "$OUT"/*

cat <<EOF

4. Last step, in GitHub (about 2 minutes):

   Open https://github.com/Kams2004/nguon-pos/settings/environments
   → "New environment" → name: release → "Configure environment".
   Under "Environment secrets", "Add environment secret" three times.
   For each one, open the file, copy ALL of its text, paste it as the value:

     Name                      File to copy
     RELEASE_SIGNING_KEY       $OUT/release-signing.key
     RELEASE_SSH_KEY           $OUT/upload-key
     RELEASE_SSH_KNOWN_HOSTS   $OUT/known_hosts

   (e.g.  cat $OUT/upload-key  — select everything from -----BEGIN to END-----)

   Then delete the folder:   rm -rf $OUT

   Optional: in that same "release" page, "Required reviewers" makes GitHub
   wait for your OK before each publication.
EOF
