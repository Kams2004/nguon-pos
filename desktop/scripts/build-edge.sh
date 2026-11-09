#!/bin/sh
# Builds what the installer carries for the till's local server:
#   desktop/build/edge/edge-service.jar
#   desktop/build/edge/jre/   (jlink: only the Java modules the service uses)
# Run on each target OS (the JRE is native). Needs a JDK 21 with jmods.
set -eu
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
OUT="$ROOT/desktop/build/edge"
rm -rf "$OUT" && mkdir -p "$OUT"

(cd "$ROOT" && mvn -B -q -pl shared/sync-core,edge/edge-service -am package -DskipTests)
cp "$ROOT"/edge/edge-service/target/edge-service-*.jar "$OUT/edge-service.jar"
# The release version (tauri.conf.json), read by the service: it reports it
# to central and compares it with the version the back office publishes.
(cd "$ROOT/desktop/src-tauri" && node -p "require('./tauri.conf.json').version") > "$OUT/VERSION"

# Spring Boot's nested jars defeat jdeps, so the list is explicit — and
# checked: scripts/check-edge.sh starts the service on this runtime.
MODULES=java.base,java.compiler,java.desktop,java.instrument,java.logging,java.management,java.naming,java.net.http,java.prefs,java.rmi,java.scripting,java.security.jgss,java.security.sasl,java.sql,java.transaction.xa,java.xml,jdk.charsets,jdk.crypto.ec,jdk.localedata,jdk.management,jdk.net,jdk.unsupported,jdk.zipfs
jlink --add-modules "$MODULES" --strip-debug --no-man-pages --no-header-files --compress zip-6 --output "$OUT/jre"
# jlink marks the licence files read-only: the next build couldn't overwrite their copies.
chmod -R u+w "$OUT/jre"
du -sh "$OUT/jre" "$OUT/edge-service.jar"
