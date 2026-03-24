#!/bin/bash
# Backup PostgreSQL database on NAS
# Usage: ssh terminal-user@192.168.1.129 'bash -s' < deploy/backup-db.sh
# Or add to NAS cron: 0 3 * * * /opt/docker/pd-backups/backup-db.sh

BACKUP_DIR="/opt/docker/pd-backups"
CONTAINER="pd-db-prod"
DB_NAME="dashboard_prod"
DB_USER="dash"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Create backup dir if not exists
mkdir -p "$BACKUP_DIR"

# Dump database
docker exec $CONTAINER pg_dump -U $DB_USER $DB_NAME | gzip > "$BACKUP_DIR/pd-backup-$TIMESTAMP.sql.gz"

# Check result
if [ $? -eq 0 ]; then
  echo "Backup created: pd-backup-$TIMESTAMP.sql.gz ($(du -h "$BACKUP_DIR/pd-backup-$TIMESTAMP.sql.gz" | cut -f1))"
else
  echo "ERROR: Backup failed!" >&2
  exit 1
fi

# Rotate - keep last 7 days
find "$BACKUP_DIR" -name "pd-backup-*.sql.gz" -mtime +7 -delete
echo "Old backups cleaned. Remaining: $(ls "$BACKUP_DIR"/pd-backup-*.sql.gz 2>/dev/null | wc -l)"
