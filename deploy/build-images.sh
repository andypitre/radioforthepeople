#!/bin/bash
# Build all three images for linux/amd64 and push to Nexlayer's registry.
# Run from the monorepo root:
#   deploy/build-images.sh v1
#
# Before first run, log in once:
#   docker login -u nexlayer-mcp-user -p NexlayerUser01 registry.nexlayer.io
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ENV_FILE="$ROOT/deploy/.env.production"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

TAG="${1:-$(date +%Y%m%d-%H%M%S)}"
NX_USER="${NEXLAYER_USER:?set NEXLAYER_USER in deploy/.env.production}"

REG="registry.nexlayer.io/nexlayer-mcp/$NX_USER"

echo "Building images with tag: $TAG"
echo "Registry: $REG"

docker build --platform linux/amd64 -t "$REG/rftp-app:$TAG"    -f app/Dockerfile    .
docker build --platform linux/amd64 -t "$REG/rftp-server:$TAG" -f server/Dockerfile .
docker build --platform linux/amd64 -t "$REG/rftp-db:$TAG"     -f db/Dockerfile     db

docker push "$REG/rftp-app:$TAG"
docker push "$REG/rftp-server:$TAG"
docker push "$REG/rftp-db:$TAG"

echo
echo "Image tags to paste into deploy/.env.production:"
echo "  APP_IMAGE=$REG/rftp-app:$TAG"
echo "  SERVER_IMAGE=$REG/rftp-server:$TAG"
echo "  DB_IMAGE=$REG/rftp-db:$TAG"
