#!/bin/sh
# Creates the Nguon POS device certificate authority (two levels):
#
#   ROOT CA     (10 years) — signs only the issuing CA. Its key must live
#                OFFLINE (USB stick in a safe), never on the server.
#   ISSUING CA  (5 years)  — signs the tills' certificates; its key goes to
#                the VPS as a secret (~/nguon-pos/secrets/device-ca/).
#
# Usage: create-ca.sh <root-dir> <issuing-dir>
#   root-dir    receives root-ca.key + root-ca.crt  (keep offline)
#   issuing-dir receives issuing-ca.key, issuing-ca.crt, ca-chain.pem
# To renew the issuing CA later, run with an existing root-dir: the root
# is reused, only a new issuing CA is made.
set -eu
ROOT=${1:?root dir}
ISSUING=${2:?issuing dir}
umask 077
mkdir -p "$ROOT" "$ISSUING"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

if [ ! -f "$ROOT/root-ca.key" ]; then
  openssl ecparam -name prime256v1 -genkey -noout | openssl pkcs8 -topk8 -nocrypt -out "$ROOT/root-ca.key"
  openssl req -x509 -new -key "$ROOT/root-ca.key" -sha256 -days 3650 \
    -subj "/O=Nguon POS/CN=Nguon POS Device Root CA" \
    -addext "basicConstraints=critical,CA:TRUE,pathlen:1" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" \
    -addext "subjectKeyIdentifier=hash" \
    -out "$ROOT/root-ca.crt"
fi

openssl ecparam -name prime256v1 -genkey -noout | openssl pkcs8 -topk8 -nocrypt -out "$ISSUING/issuing-ca.key"
openssl req -new -key "$ISSUING/issuing-ca.key" -subj "/O=Nguon POS/CN=Nguon POS Device Issuing CA" -out "$TMP/issuing.csr"
printf 'basicConstraints=critical,CA:TRUE,pathlen:0\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid\n' > "$TMP/ext.cnf"
openssl x509 -req -in "$TMP/issuing.csr" -CA "$ROOT/root-ca.crt" -CAkey "$ROOT/root-ca.key" -set_serial "0x$(openssl rand -hex 16)" \
  -days 1825 -sha256 -extfile "$TMP/ext.cnf" -out "$ISSUING/issuing-ca.crt"
cat "$ISSUING/issuing-ca.crt" "$ROOT/root-ca.crt" > "$ISSUING/ca-chain.pem"
chmod 644 "$ISSUING/issuing-ca.crt" "$ISSUING/ca-chain.pem"

openssl verify -CAfile "$ROOT/root-ca.crt" "$ISSUING/issuing-ca.crt"
echo "Root CA (keep offline): $ROOT"
echo "Issuing CA (server secret): $ISSUING"
