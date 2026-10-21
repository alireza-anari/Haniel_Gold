#!/usr/bin/env bash
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
mkdir -p backups
out="backups/haniel_$(date -u +%Y%m%dT%H%M%SZ).sql"
docker compose exec -T database sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$out"
test -s "$out" || { rm -f "$out"; echo 'Backup is empty' >&2; exit 1; }
echo "Database backup saved to $out (sensitive; excluded from git)"
