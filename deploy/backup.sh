#!/usr/bin/env bash
# Daily database backup: backups/taxi-YYYY-MM-DD.sql.gz next to the code, the last 14 kept.
# Installed as a nightly cron job by deploy/setup-server.sh. Copy the files off the server from time to time.
# Restore into an empty database:
#   gunzip -c backups/taxi-2026-10-03.sql.gz | docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml exec -T postgres psql -U taxi taxi
set -euo pipefail
cd "$(dirname "$0")/.."
read -r -a FILES <<< "${COMPOSE_FILES:--f docker-compose.yml -f deploy/docker-compose.prod.yml}"
KEEP="${BACKUP_KEEP:-14}"

mkdir -p backups
chmod 700 backups
file="backups/taxi-$(date +%F).sql.gz"
docker compose "${FILES[@]}" exec -T postgres pg_dump -U taxi --no-owner taxi | gzip > "$file.tmp"
# An empty or broken dump never replaces a good one.
if [ "$(gzip -cd "$file.tmp" | head -c 2000 | grep -c 'PostgreSQL database dump')" -eq 0 ]; then
  rm -f "$file.tmp"
  echo "$(date '+%Y-%m-%d %H:%M:%S') backup FAILED: no dump produced" >&2
  exit 1
fi
mv "$file.tmp" "$file"
chmod 600 "$file"
ls -1t backups/taxi-*.sql.gz | tail -n "+$((KEEP + 1))" | xargs -r rm --
echo "$(date '+%Y-%m-%d %H:%M:%S') backup ok: $file ($(du -h "$file" | cut -f1))"
