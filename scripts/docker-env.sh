#!/usr/bin/env bash
# Creates .env for docker compose from .env.example, with a fresh random database password and login secret.
# Safe to run again: an existing .env is never touched.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -f .env ]; then
  echo ".env already exists: kept as it is."
  exit 0
fi
db=$(openssl rand -hex 24)
jwt=$(openssl rand -base64 48 | tr -d '\n')
awk -v db="$db" -v jwt="$jwt" '
  /^POSTGRES_PASSWORD=/ { print "POSTGRES_PASSWORD=" db; next }
  /^JWT_SECRET=/        { print "JWT_SECRET=" jwt; next }
  { print }
' .env.example > .env
chmod 600 .env
echo "Created .env with random secrets. Next: docker compose up -d --build"
