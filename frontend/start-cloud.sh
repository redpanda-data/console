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

export PROXY_TARGET="$BACKEND_URL"
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
