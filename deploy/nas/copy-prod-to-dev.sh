#!/usr/bin/env bash
# Copy production database to dev environment
# Usage: bash deploy/nas/copy-prod-to-dev.sh
#
# Dumps pd-db-prod and restores into pd-db-dev.

set -euo pipefail

NAS_HOST="${NAS_HOST:-terminal-user@your-nas-ip}"

echo "=== Copying production DB to dev ==="

echo "→ Dumping production database (pd-db-prod)..."
ssh "${NAS_HOST}" "sudo /usr/local/bin/docker exec pd-db-prod pg_dump -U dash -d dashboard_prod --clean --if-exists" > /tmp/pd-prod-dump.sql

echo "  Dump size: $(wc -c < /tmp/pd-prod-dump.sql | tr -d ' ') bytes"

echo "→ Restoring into dev database (pd-db-dev)..."
ssh "${NAS_HOST}" "sudo /usr/local/bin/docker exec -i pd-db-dev psql -U dash -d dashboard_dev" < /tmp/pd-prod-dump.sql 2>&1 | tail -5

echo "→ Verifying..."
ssh "${NAS_HOST}" "sudo /usr/local/bin/docker exec pd-db-dev psql -U dash -d dashboard_dev -c 'SELECT COUNT(*) AS users FROM users; SELECT COUNT(*) AS transactions FROM transactions; SELECT COUNT(*) AS workouts FROM gym_workouts;'"

echo "✓ Production data copied to dev."
rm -f /tmp/pd-prod-dump.sql
