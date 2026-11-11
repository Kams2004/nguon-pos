#!/bin/sh
# Checks the trimmed Java runtime really runs the till's local server
# (called by build-edge.sh; fails the build otherwise). Two checks:
#  1. every Java module our own code uses (jdeps) is in the runtime;
#  2. the service starts on that runtime and answers on its local API.
# A missing module once shipped a till that could not start (0.3.0).
#
# No `set -e`: every step is checked and explains its failure, on GitHub
# too (annotations are readable without the job log). Works in Git Bash.
set -u

ci() { # level message
  if [ "${GITHUB_ACTIONS:-}" = true ]; then
    printf '::%s title=check-edge::%s\n' "$1" "$(printf '%s' "$2" | tr -d '\r' | sed ':a;N;$!ba;s/%/%25/g;s/\n/%0A/g')"
  fi
}
fail() {
  printf 'check-edge: %s\n' "$1" >&2
  ci error "$1"
  exit 1
}
step() {
  echo "check-edge: $1"
  ci notice "$1"
}

[ -n "${1:-}" ] || fail "usage: check-edge.sh <build/edge folder>"
OUT=$(cd "$1" && pwd) || fail "no such folder: $1"
JRE="$OUT/jre/bin/java"
[ -f "$OUT/edge-service.jar" ] || fail "missing $OUT/edge-service.jar"
WORK=$(mktemp -d) || fail "mktemp failed"
PID=
trap 'if [ -n "$PID" ]; then kill "$PID" 2>/dev/null; fi; rm -rf "$WORK"' EXIT

version=$("$JRE" -version 2>&1 | tr -d '\r' | head -n 1) || fail "the runtime does not run: $JRE"
step "runtime: $version"

# 1. Modules our classes need.
if command -v unzip >/dev/null 2>&1; then
  (cd "$WORK" && unzip -q "$OUT/edge-service.jar" 'BOOT-INF/classes/*' 'BOOT-INF/lib/*') || fail "unzip of the service jar failed"
else
  (cd "$WORK" && jar xf "$OUT/edge-service.jar" BOOT-INF) || fail "jar extraction of the service jar failed"
fi
core=$(ls "$WORK"/BOOT-INF/lib/sync-core-*.jar 2>/dev/null | head -n 1)
[ -n "$core" ] || fail "sync-core jar not found inside the service jar"
classes="$WORK/BOOT-INF/classes"
if command -v cygpath >/dev/null 2>&1; then # Windows JDK tools want Windows paths
  classes=$(cygpath -w "$classes")
  core=$(cygpath -w "$core")
fi
need=$(jdeps --ignore-missing-deps --multi-release 21 --print-module-deps "$classes" "$core" 2>"$WORK/jdeps.err" | tr -d '\r' | tr ',' ' ')
[ -n "$need" ] || fail "jdeps found nothing: $(head -c 600 "$WORK/jdeps.err")"
# Our code certainly uses these: if jdeps does not see them, it did not read our classes.
for m in java.sql jdk.httpserver; do
  echo " $need " | grep -q " $m " || fail "jdeps did not analyse the service classes (found only: $need; $(head -c 300 "$WORK/jdeps.err"))"
done
have=$("$JRE" --list-modules 2>&1 | tr -d '\r' | sed 's/@.*//')
missing=""
for m in $need; do
  echo "$have" | grep -qx "$m" || missing="$missing $m"
done
[ -z "$missing" ] || fail "the runtime lacks module(s):$missing — add them to MODULES in build-edge.sh (needed: $need)"
step "modules OK ($need)"

# 2. Start it for real (no central, no LAN ports, a throwaway data folder).
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
code=none
i=0
while [ $i -lt 90 ]; do
  i=$((i + 1))
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/local/v1/status" 2>/dev/null) || code=down
  if [ "$code" = "401" ] || [ "$code" = "200" ]; then
    step "the service starts and answers on the trimmed runtime (${i}s)"
    exit 0
  fi
  kill -0 "$PID" 2>/dev/null || break
  sleep 1
done
fail "the service did not start on the trimmed runtime (after ${i}s, last HTTP: $code):
$(grep -E "ERROR|Caused by|NoClassDefFound|Exception|Error" "$WORK/run.log" | head -n 12)
--- last lines:
$(tail -n 15 "$WORK/run.log")"
