#!/bin/sh
# Checks the trimmed Java runtime really runs the till's local server
# (called by build-edge.sh; fails the build otherwise). Two checks:
#  1. every Java module our own code uses (jdeps) is in the runtime;
#  2. the service starts on that runtime and answers on its local API.
# A missing module once shipped a till that could not start (0.3.0).
set -eu
OUT=$(cd "${1:?build/edge folder}" && pwd)
JRE="$OUT/jre/bin/java"
WORK=$(mktemp -d)
# Failures also go to GitHub as an annotation (readable without the job log).
fail() {
  printf '%s\n' "$1" >&2
  if [ "${GITHUB_ACTIONS:-}" = true ]; then
    printf '::error title=check-edge::%s\n' "$(printf '%s' "$1" | sed ':a;N;$!ba;s/%/%25/g;s/\r//g;s/\n/%0A/g')"
  fi
  exit 1
}
trap 'kill "$PID" 2>/dev/null || true; rm -rf "$WORK"' EXIT
PID=

# 1. Modules our classes need.
if command -v unzip >/dev/null 2>&1; then
  (cd "$WORK" && unzip -q "$OUT/edge-service.jar" 'BOOT-INF/classes/*' 'BOOT-INF/lib/sync-core-*')
else
  (cd "$WORK" && jar xf "$OUT/edge-service.jar" BOOT-INF/classes BOOT-INF/lib)
fi
echo "check-edge: runtime $("$JRE" -version 2>&1 | head -1)"
need=$(jdeps --ignore-missing-deps --multi-release 21 --print-module-deps \
  "$WORK/BOOT-INF/classes" $(ls "$WORK"/BOOT-INF/lib/sync-core-*.jar) 2>/dev/null | tr -d '\r' | tr ',' ' ')
# Windows tools end lines with CR: strip it, or "jdk.httpserver\r" never matches.
have=$("$JRE" --list-modules | tr -d '\r' | sed 's/@.*//')
missing=""
for m in $need; do
  echo "$have" | grep -qx "$m" || missing="$missing $m"
done
if [ -n "$missing" ]; then
  fail "check-edge: the runtime lacks module(s):$missing — add them to MODULES in build-edge.sh (jdeps said: $need; runtime has: $(echo $have))"
fi
echo "check-edge: modules OK ($need)"

# 2. Start it for real (no central, no LAN ports, a throwaway data folder).
# Works in Git Bash on Windows too: no python, and Windows paths for the Windows JVM.
port=$((20000 + $$ % 20000))
data="$WORK/data"
jar="$OUT/edge-service.jar"
if command -v cygpath >/dev/null 2>&1; then
  data=$(cygpath -w "$data")
  jar=$(cygpath -w "$jar")
fi
EDGE_DATA_DIR="$data" EDGE_PORT=$port EDGE_KEY_PROVIDER=file EDGE_CENTRAL_URL= \
  "$JRE" -Xmx256m -jar "$jar" --edge.peer-port=0 --edge.beacon-port=0 > "$WORK/run.log" 2>&1 &
PID=$!
for i in $(seq 1 90); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/local/v1/status" || true)
  if [ "$code" = "401" ] || [ "$code" = "200" ]; then
    echo "check-edge: the service starts and answers on the trimmed runtime (${i}s)"
    exit 0
  fi
  if ! kill -0 "$PID" 2>/dev/null; then break; fi
  sleep 1
done
fail "check-edge: the service did not start on the trimmed runtime (last HTTP code: ${code:-none}):
$(grep -E "ERROR|Caused by|NoClassDefFound|Exception|Error" "$WORK/run.log" | head -12)
--- last lines:
$(tail -n 15 "$WORK/run.log")"
