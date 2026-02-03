#!/usr/bin/env bash
set -e

BACKEND_URL=""
PORT=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --port)
      PORT="$2"
      shift 2
      ;;
    *)
      if [ -z "$BACKEND_URL" ]; then
        BACKEND_URL="$1"
      fi
      shift
      ;;
  esac
done

if [ -z "$BACKEND_URL" ]; then
  echo "Error: Backend URL is required"
  echo "Usage: bun run start:cloud <backend-url> [--port <port>]"
  echo "Example: bun run start:cloud https://console-xxx.cloud.redpanda.com --port 3004"
  exit 1
fi

# Extract cluster ID from backend URL
# Example: https://console-2fd2fedf.d5mst2vnnfekmiescdb0.fmc.ign.cloud.redpanda.com
# Example: https://console-2498fb74.d5tp5kntujt599ksadgg.byoc.ign.cloud.redpanda.com
# Extracts: d5mst2vnnfekmiescdb0 or d5tp5kntujt599ksadgg
CLUSTER_ID=$(echo "$BACKEND_URL" | sed -E 's/.*\.([a-z0-9]+)\.(fmc\.ign|byoc\.ign|rpd)\.cloud\.redpanda\.com.*/\1/')

export PROXY_TARGET="$BACKEND_URL"
export AI_GATEWAY_URL="https://ai-gateway.${CLUSTER_ID}.clusters.ign.rdpa.co"
export REACT_APP_ENABLED_FEATURES=SINGLE_SIGN_ON,REASSIGN_PARTITIONS

echo "Starting frontend dev server..."
echo "Proxying to: $PROXY_TARGET"
[ -n "$PORT" ] && echo "Port: $PORT"
echo ""

if [ -n "$PORT" ]; then
  exec rsbuild dev --port "$PORT"
else
  exec rsbuild dev
fi
