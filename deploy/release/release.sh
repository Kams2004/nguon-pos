#!/bin/sh
# A till release in one command:
#
#   deploy/release/release.sh 0.3.9 "Notes pour le back office"
#
# Sets the version (tauri.conf.json, package.json, Cargo.toml), commits, tags
# desktop-v0.3.9 with the notes and pushes. Then GitHub does the rest on its
# own, nothing more runs here (you can close this computer):
#   - "Desktop till release" builds the Windows and Ubuntu installers (~15 min);
#   - "Desktop till publish" signs them, sends them to the server, which checks
#     the signatures and registers the version (~2 min).
# Last step, yours: Administration → Mises à jour → "Publier aux caisses".
#
# Needs the one-time setup: deploy/release/setup-ci.sh (see README.md).
# Without it, publish-release.sh still publishes by hand from this computer.
set -eu
VERSION=${1:?version, e.g. 0.3.9}
NOTES=${2:-}
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
TAG="desktop-v$VERSION"

printf '%s' "$VERSION" | grep -Eqx '[0-9]{1,5}\.[0-9]{1,5}\.[0-9]{1,5}' || { echo "Version must be MAJOR.MINOR.PATCH" >&2; exit 1; }
cd "$ROOT"
if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
  echo "Tag $TAG exists already. To publish its build again: GitHub → Actions → Desktop till publish → Run workflow ($TAG)." >&2
  exit 1
fi
[ -z "$(git status --porcelain)" ] || { echo "Uncommitted changes: commit or stash them first." >&2; exit 1; }

current=$(node -p "require('./desktop/src-tauri/tauri.conf.json').version")
if [ "$current" != "$VERSION" ]; then
  sed -i "0,/\"version\": \"$current\"/s//\"version\": \"$VERSION\"/" desktop/src-tauri/tauri.conf.json desktop/package.json
  sed -i "0,/^version = \"$current\"/s//version = \"$VERSION\"/" desktop/src-tauri/Cargo.toml
  git add desktop/src-tauri/tauri.conf.json desktop/package.json desktop/src-tauri/Cargo.toml
  git commit -q -m "desktop $VERSION"
fi
# An annotated tag: its message is the version's notes in Mises à jour.
git tag -a "$TAG" -m "${NOTES:-Version $VERSION}"
git push -q origin HEAD "$TAG"

REPO=$(git remote get-url origin | sed -E 's#^.*github\.com[:/]##; s#\.git$##')
echo "Pushed $TAG. GitHub now builds and publishes it by itself (about 20 minutes):"
echo "  https://github.com/$REPO/actions"
echo "Then: Administration → Mises à jour → Publier aux caisses on $VERSION."
echo "Windows download, once published: https://pos.nguonevents.com/releases/$VERSION/nguon-pos_${VERSION}_x64-setup.exe"
