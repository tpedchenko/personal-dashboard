#!/bin/bash
# Deploy Next.js dev to NAS
# Run from the next/ directory on your local machine
#
# Prerequisites: /opt/docker/secrets/.env.pd-dev must exist on NAS
set -e

NAS="${DEPLOY_HOST:-user@your-server}"
DOCKER="/usr/local/bin/docker"
SECRETS_FILE="/opt/docker/secrets/.env.pd-dev"

echo "=== Building Docker image (dev) ==="
docker build --platform linux/amd64 -t pd-next-dev:latest .

echo "=== Transferring to NAS ==="
docker save pd-next-dev:latest | gzip | ssh $NAS 'cat > /tmp/pd-next-dev.tar.gz'

echo "=== Loading image on NAS ==="
ssh $NAS "sudo $DOCKER load < /tmp/pd-next-dev.tar.gz"

echo "=== Stopping old container ==="
ssh $NAS "sudo $DOCKER stop pd-app-dev 2>/dev/null; sudo $DOCKER rm pd-app-dev 2>/dev/null" || true

echo "=== Starting new container ==="
ssh $NAS "sudo $DOCKER run -d --name pd-app-dev --restart unless-stopped \
  --network pd-backend-dev -p 8002:3000 \
  --env-file $SECRETS_FILE \
  -e NODE_ENV=production \
  pd-next-dev:latest && \
  sudo $DOCKER network connect pd-frontend-dev pd-app-dev 2>/dev/null"

echo "=== Verifying ==="
sleep 3
ssh $NAS "sudo $DOCKER logs --tail 5 pd-app-dev"

echo "=== Done! dev.taras.cloud -> localhost:8002 ==="
