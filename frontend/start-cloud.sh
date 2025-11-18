#!/usr/bin/env bash
set -e

if [ -z "$1" ]; then
  echo "Error: Backend URL is required"
  echo "Usage: bun run start:cloud <backend-url>"
  echo "Example: bun run start:cloud https://console-xxx.cloud.redpanda.com"
  exit 1
fi

export PROXY_TARGET="$1"
export REACT_APP_ENABLED_FEATURES=SINGLE_SIGN_ON,REASSIGN_PARTITIONS

echo "Starting frontend dev server..."
echo "Proxying to: $PROXY_TARGET"
echo ""

exec rsbuild dev
