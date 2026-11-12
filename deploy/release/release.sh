#!/bin/sh
# A till release in one command, from this computer (the release key never
# leaves it):
#
#   deploy/release/release.sh 0.3.3 "Notes pour le back office"
#
#   1. sets the version (tauri.conf.json, package.json, Cargo.toml), commits,
#      tags desktop-v0.3.3 and pushes — GitHub then builds both installers
#      (skipped when that tag exists already: the script just picks it up);
#   2. waits for that build;
#   3. downloads the Windows and Ubuntu installers it produced (the Ubuntu one
#      is built on 22.04, so it installs on every supported Ubuntu);
#   4. signs, uploads and registers them (publish-release.sh).
#
# Then: Administration → Mises à jour → "Publier aux caisses".
#
# Needs a GitHub token that can read this repository's Actions, once:
#   GitHub → Settings → Developer settings → Fine-grained tokens → Generate:
#   repository "nguon-pos" only, permission "Actions: Read-only". Save it:
#     mkdir -p ~/.config/nguon-pos && install -m 600 /dev/null ~/.config/nguon-pos/github-token
#     nano ~/.config/nguon-pos/github-token     # paste the token, save
set -eu
VERSION=${1:?version, e.g. 0.3.3}
NOTES=${2:-}
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
TOKEN_FILE=${NGUON_GITHUB_TOKEN_FILE:-$HOME/.config/nguon-pos/github-token}
TAG="desktop-v$VERSION"
WORKFLOW="Desktop till release"

printf '%s' "$VERSION" | grep -Eqx '[0-9]{1,5}\.[0-9]{1,5}\.[0-9]{1,5}' || { echo "Version must be MAJOR.MINOR.PATCH" >&2; exit 1; }
[ -s "$TOKEN_FILE" ] || { echo "No GitHub token in $TOKEN_FILE — see the top of this script." >&2; exit 1; }
TOKEN=$(tr -d ' \r\n' < "$TOKEN_FILE")
cd "$ROOT"
REPO=$(git remote get-url origin | sed -E 's#^.*github\.com[:/]##; s#\.git$##')

api() { # path → JSON on stdout
  curl -fsS -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" "https://api.github.com/repos/$REPO$1"
}
json() { # python expression over `d` (the JSON read from stdin)
  python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"
}

# 1. Version and tag.
if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
  echo "Tag $TAG exists: using its build."
else
  [ -z "$(git status --porcelain)" ] || { echo "Uncommitted changes: commit or stash them first." >&2; exit 1; }
  current=$(node -p "require('./desktop/src-tauri/tauri.conf.json').version")
  if [ "$current" != "$VERSION" ]; then
    sed -i "0,/\"version\": \"$current\"/s//\"version\": \"$VERSION\"/" desktop/src-tauri/tauri.conf.json desktop/package.json
    sed -i "0,/^version = \"$current\"/s//version = \"$VERSION\"/" desktop/src-tauri/Cargo.toml
    git add desktop/src-tauri/tauri.conf.json desktop/package.json desktop/src-tauri/Cargo.toml
    git commit -q -m "desktop $VERSION"
  fi
  git tag "$TAG"
  git push -q origin HEAD "$TAG"
  echo "Pushed $TAG: GitHub is building the installers."
fi

# 2. Wait for the build of that tag.
echo "Waiting for GitHub's build (about 15 minutes)…"
run=""
for i in $(seq 1 120); do
  line=$(api "/actions/runs?per_page=30" | json "next((f\"{r['id']} {r['status']} {r['conclusion']}\" for r in d['workflow_runs'] if r['head_branch']=='$TAG' and r['name']=='$WORKFLOW'), '')") || line=""
  set -- $line
  if [ $# -ge 2 ]; then
    run=$1
    if [ "$2" = completed ]; then
      [ "${3:-}" = success ] || { echo "The build failed: https://github.com/$REPO/actions/runs/$run" >&2; exit 1; }
      break
    fi
  fi
  sleep 30
done
[ -n "$run" ] || { echo "No build found for $TAG." >&2; exit 1; }
echo "Build OK: https://github.com/$REPO/actions/runs/$run"

# 3. Download both installers.
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
api "/actions/runs/$run/artifacts" | json "'\n'.join(f\"{a['name']} {a['archive_download_url']}\" for a in d['artifacts'])" > "$WORK/artifacts"
while read -r name url; do
  [ -n "$name" ] || continue
  echo "  downloading $name…"
  curl -fsSL -H "Authorization: Bearer $TOKEN" -o "$WORK/$name.zip" "$url"
  mkdir -p "$WORK/$name" && unzip -q -o "$WORK/$name.zip" -d "$WORK/$name"
done < "$WORK/artifacts"
DEB=$(find "$WORK" -name "*_${VERSION}_amd64.deb" | head -n 1)
EXE=$(find "$WORK" -name "*_${VERSION}_x64-setup.exe" | head -n 1)
[ -n "$DEB" ] || { echo "The build has no Ubuntu installer for $VERSION." >&2; exit 1; }
[ -n "$EXE" ] || { echo "The build has no Windows installer for $VERSION." >&2; exit 1; }

# 4. Sign, upload, register.
sh "$ROOT/deploy/release/publish-release.sh" "$VERSION" "$DEB" "$EXE" "$NOTES"
echo
echo "Done. Windows download: https://pos.nguonevents.com/releases/$VERSION/nguon-pos_${VERSION}_x64-setup.exe"
echo "Last step: Administration → Mises à jour → Publier aux caisses on $VERSION."
