#!/usr/bin/env bash
# Creates .env for docker compose from .env.example, with a fresh random database password, login secret and
# browser push (VAPID) key pair.
# Safe to run again: an existing .env is kept as it is; only a missing browser push key pair is added to it.
set -euo pipefail
cd "$(dirname "$0")/.."

# Browser push keys (VAPID), made with openssl only: a P-256 key pair in the form the backend reads
# (com.taxi.notification.VapidKeys): base64url without padding, the public key as the raw 65-byte uncompressed
# point (04 || X || Y), the private key as the raw 32-byte number.
b64url() { base64 | tr -d '\n=' | tr '/+' '_-'; }
vapid_keys() {
  local key
  key=$(openssl ecparam -name prime256v1 -genkey -noout)
  # SEC1 DER: 30 77 02 01 01 04 20 <32-byte private key> ...; SubjectPublicKeyInfo DER ends with the 65-byte point.
  VAPID_PRIVATE_KEY=$(printf '%s\n' "$key" | openssl ec -outform DER 2>/dev/null | tail -c +8 | head -c 32 | b64url)
  VAPID_PUBLIC_KEY=$(printf '%s\n' "$key" | openssl ec -pubout -outform DER 2>/dev/null | tail -c 65 | b64url)
  if [ "${#VAPID_PUBLIC_KEY}" -ne 87 ] || [ "${#VAPID_PRIVATE_KEY}" -ne 43 ]; then
    echo "Could not make the browser push keys with openssl." >&2
    exit 1
  fi
}

if [ -f .env ]; then
  if grep -q '^VAPID_PUBLIC_KEY=..*' .env; then
    echo ".env already exists: kept as it is."
  else
    # Older .env without browser push keys: add a pair (never replaced later: browsers subscribe with that key).
    vapid_keys
    tmp=$(mktemp)
    grep -v '^VAPID_PUBLIC_KEY=\|^VAPID_PRIVATE_KEY=' .env > "$tmp" || true
    printf 'VAPID_PUBLIC_KEY=%s\nVAPID_PRIVATE_KEY=%s\n' "$VAPID_PUBLIC_KEY" "$VAPID_PRIVATE_KEY" >> "$tmp"
    cat "$tmp" > .env && rm -f "$tmp"
    echo ".env already exists: kept, browser push keys added."
  fi
  exit 0
fi
db=$(openssl rand -hex 24)
jwt=$(openssl rand -base64 48 | tr -d '\n')
vapid_keys
awk -v db="$db" -v jwt="$jwt" -v vpub="$VAPID_PUBLIC_KEY" -v vpriv="$VAPID_PRIVATE_KEY" '
  /^POSTGRES_PASSWORD=/ { print "POSTGRES_PASSWORD=" db; next }
  /^JWT_SECRET=/        { print "JWT_SECRET=" jwt; next }
  /^VAPID_PUBLIC_KEY=/  { print "VAPID_PUBLIC_KEY=" vpub; next }
  /^VAPID_PRIVATE_KEY=/ { print "VAPID_PRIVATE_KEY=" vpriv; next }
  { print }
' .env.example > .env
chmod 600 .env
echo "Created .env with random secrets and browser push keys. Next: docker compose up -d --build"
