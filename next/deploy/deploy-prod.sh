#!/bin/bash
# Deploy Next.js prod to NAS with separate PostgreSQL
# Run from the next/ directory on your local machine
#
# Infrastructure:
#   pd-db-prod       — PostgreSQL 16 (dashboard_prod)
#   pd-pgbouncer-prod — PgBouncer connection pooler (port 6432)
#   pd-next-prod     — Next.js app (port 8003)
#   Networks: pd-backend-prod (internal), pd-frontend-prod
#
# URL: https://prod.taras.cloud
set -e

NAS="terminal-user@192.168.1.129"
DOCKER="/usr/local/bin/docker"
COMPOSE_FILE="/opt/repos/pd/deploy/docker-compose.next-prod.yml"
REMOTE_DIR="/opt/repos/pd"
SECRETS_DIR="$(cd "$(dirname "$0")/../../../.." && pwd)/secrets"
NAS_SECRETS="/opt/docker/secrets"

echo "=== Step 0: Deploying secrets to NAS ==="
if [ -f "$SECRETS_DIR/pd-prod.env.enc" ]; then
  sops --decrypt "$SECRETS_DIR/pd-prod.env.enc" | ssh $NAS "cat > $NAS_SECRETS/.env.pd-prod && chmod 600 $NAS_SECRETS/.env.pd-prod"
  echo "Secrets deployed from SOPS"
  # Source PG_PASSWORD for migration step
  eval "$(sops --decrypt "$SECRETS_DIR/pd-prod.env.enc" | grep PG_PASSWORD)"
else
  echo "WARNING: No SOPS secrets found at $SECRETS_DIR/pd-prod.env.enc"
  echo "Expecting secrets to already exist on NAS at $NAS_SECRETS/.env.pd-prod"
fi

echo "=== Step 1: Building Docker image ==="
docker build --platform linux/amd64 -t pd-next-prod:latest .

echo "=== Step 2: Transferring image to NAS ==="
docker save pd-next-prod:latest | gzip | ssh $NAS 'cat > /tmp/pd-next-prod.tar.gz'

echo "=== Step 3: Syncing compose file to NAS ==="
ssh $NAS "sudo mkdir -p $REMOTE_DIR/deploy/nas"
cat deploy/docker-compose.next-prod.yml | ssh $NAS "cat > /tmp/docker-compose.next-prod.yml"
ssh $NAS "sudo cp /tmp/docker-compose.next-prod.yml $REMOTE_DIR/deploy/"

echo "=== Step 4: Loading image on NAS ==="
ssh $NAS "sudo $DOCKER load < /tmp/pd-next-prod.tar.gz"

echo "=== Step 5: Starting PostgreSQL (if not running) ==="
if ssh $NAS "sudo $DOCKER ps -q -f name=pd-db-prod" | grep -q .; then
  echo "pd-db-prod already running"
else
  echo "Starting pd-db-prod..."
  ssh $NAS "sudo $DOCKER compose -f $COMPOSE_FILE up -d pd-db-prod"
  echo "Waiting for PostgreSQL to be ready..."
  for i in $(seq 1 30); do
    if ssh $NAS "sudo $DOCKER exec pd-db-prod pg_isready -U dash -d dashboard_prod" 2>/dev/null; then
      echo "PostgreSQL ready!"
      break
    fi
    sleep 2
  done
fi

echo "=== Step 5b: Starting PgBouncer (if not running) ==="
if ssh $NAS "sudo $DOCKER ps -q -f name=pd-pgbouncer-prod" | grep -q .; then
  echo "pd-pgbouncer-prod already running"
else
  echo "Starting pd-pgbouncer-prod..."
  if ssh $NAS "sudo $DOCKER compose -f $COMPOSE_FILE up -d pd-pgbouncer-prod" 2>/dev/null; then
    echo "Waiting for PgBouncer to be ready..."
    for i in $(seq 1 15); do
      if ssh $NAS "sudo $DOCKER exec pd-pgbouncer-prod pg_isready -h localhost -p 6432" 2>/dev/null; then
        echo "PgBouncer ready!"
        break
      fi
      sleep 2
    done
  else
    echo "PgBouncer skipped (service not configured in docker-compose)"
  fi
fi

echo "=== Step 6: Backing up prod DB ==="
BACKUP_FILE="prod_$(date +%Y-%m-%d_%H-%M).sql"
ssh $NAS "sudo mkdir -p /opt/docker/backups/pg"
ssh $NAS "sudo $DOCKER exec pd-db-prod pg_dump -U dash dashboard_prod > /tmp/$BACKUP_FILE && sudo mv /tmp/$BACKUP_FILE /opt/docker/backups/pg/$BACKUP_FILE"
echo "Backup saved: /opt/docker/backups/pg/$BACKUP_FILE"

echo "=== Step 7: Running Prisma migrations (direct to DB, bypassing PgBouncer) ==="
DIRECT_DB_URL="postgresql://dash:${PG_PASSWORD:?PG_PASSWORD must be set}@pd-db-prod:5432/dashboard_prod"
ssh $NAS "sudo $DOCKER run --rm --network pd-backend-prod \
  -e DATABASE_URL=$DIRECT_DB_URL \
  pd-next-prod:latest \
  npx prisma migrate deploy" || echo "WARNING: Prisma migrate skipped (no migrations dir or failed)"

echo "=== Step 8: Deploying Next.js container ==="
ssh $NAS "sudo $DOCKER stop pd-next-prod 2>/dev/null; sudo $DOCKER rm pd-next-prod 2>/dev/null" || true
ssh $NAS "sudo $DOCKER compose -f $COMPOSE_FILE up -d pd-next-prod"

echo "=== Step 9: Verifying ==="
echo "Waiting for container to start..."
for i in $(seq 1 12); do
  sleep 5
  STATUS=$(ssh $NAS "sudo $DOCKER inspect pd-next-prod --format '{{.State.Status}}'" 2>/dev/null || echo "missing")
  if [ "$STATUS" = "running" ]; then
    HEALTH=$(ssh $NAS "curl -s -o /dev/null -w '%{http_code}' http://localhost:8003/api/health" 2>/dev/null || echo "000")
    if [ "$HEALTH" = "200" ]; then
      echo "✓ Health check passed! (HTTP $HEALTH)"
      break
    fi
    echo "  Attempt $i: container running, health check: $HEALTH"
  else
    echo "  Attempt $i: container status: $STATUS"
  fi
done

echo ""
echo "=== Container logs ==="
ssh $NAS "sudo $DOCKER logs --tail 10 pd-next-prod"

echo ""
echo "=== Done! ==="
echo "  Local:  http://192.168.1.129:8003"
echo "  Public: https://prod.taras.cloud (needs Cloudflare tunnel route)"
