#!/bin/bash
# Backup PostgreSQL database
# Usage: bash deploy/backup-db.sh [prod|dev]
#
# Backups saved to: backup directory

ENV=${1:-dev}
TIMESTAMP=$(date +%Y-%m-%d_%H-%M)
BACKUP_DIR="${BACKUP_DIR:-/opt/docker/backups}"

if [ "$ENV" = "prod" ]; then
  CONTAINER="pd-db-prod"
  DB_NAME="dashboard_prod"
  FILENAME="prod_${TIMESTAMP}.sql"
else
  CONTAINER="pd-db-dev"
  DB_NAME="dashboard_dev"
  FILENAME="dev_${TIMESTAMP}.sql"
fi

mkdir -p "$BACKUP_DIR"

echo "Backing up $DB_NAME from container $CONTAINER..."
docker exec "$CONTAINER" pg_dump -U dash "$DB_NAME" > "$BACKUP_DIR/${FILENAME}"

if [ $? -eq 0 ]; then
  SIZE=$(du -h "$BACKUP_DIR/${FILENAME}" | cut -f1)
  echo "Backup saved: $BACKUP_DIR/${FILENAME} ($SIZE)"
else
  echo "ERROR: Backup failed!"
  exit 1
fi
