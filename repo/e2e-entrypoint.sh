#!/bin/sh
# Forward the container's localhost:3000/3001 to the `web` and `api`
# Compose services so Chromium treats the app's origin as secure
# (service workers require HTTPS or localhost). Then run the test command.
set -eu

socat TCP-LISTEN:3000,fork,reuseaddr TCP:web:3000 &
SOCAT_WEB_PID=$!
socat TCP-LISTEN:3001,fork,reuseaddr TCP:api:3001 &
SOCAT_API_PID=$!

# Give socat a moment to bind the listeners.
sleep 0.5

cleanup() {
  kill "$SOCAT_WEB_PID" "$SOCAT_API_PID" 2>/dev/null || true
}
trap cleanup EXIT

exec "$@"
