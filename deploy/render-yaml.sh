#!/bin/bash
# Substitute tokens in deploy/nexlayer.template.yaml using values from
# deploy/.env.production, writing the filled file to deploy/nexlayer.yaml.
# The filled file is gitignored and should never be committed.
#
# Run from the monorepo root:
#   deploy/render-yaml.sh
#
# Then paste the contents into nexlayer_deploy, or use your MCP-integrated
# tool to deploy directly.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TEMPLATE="$ROOT/deploy/nexlayer.template.yaml"
ENV_FILE="$ROOT/deploy/.env.production"
OUT="$ROOT/deploy/nexlayer.yaml"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found."
  echo "Copy deploy/.env.production.example and fill in the values."
  exit 1
fi

# Load env vars without exporting them to the parent shell's history.
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

required=(APP_IMAGE SERVER_IMAGE DB_IMAGE POSTGRES_PASSWORD RFTP_APP_PASSWORD SESSION_SECRET GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET SIMPLE_PRODUCT_API_KEY)
for var in "${required[@]}"; do
  if [[ -z "${!var:-}" ]]; then
    echo "ERROR: $var is not set in $ENV_FILE"
    exit 1
  fi
done

cp "$TEMPLATE" "$OUT"
# Substitute each __TOKEN__ with the value of the matching env var.
# We use sed with a safe delimiter since some values (image refs) contain slashes.
for var in "${required[@]}"; do
  value="${!var}"
  # Use | as delimiter; escape it in the value for safety.
  escaped="${value//|/\\|}"
  sed -i.bak "s|__${var}__|${escaped}|g" "$OUT"
done
rm -f "$OUT.bak"

echo "Rendered deploy/nexlayer.yaml (gitignored, do NOT commit)"
