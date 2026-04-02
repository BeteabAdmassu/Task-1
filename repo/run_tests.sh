#!/usr/bin/env bash
# run_tests.sh — run all tests for the GreenLeaf Operations Suite
# Usage: bash run_tests.sh
# Exit code: 0 if all suites pass, non-zero otherwise
#
# Requirements (host): Docker with the Compose plugin (v2) or the standalone
# docker-compose binary.  No Node.js, npm, or other runtimes are needed on the
# host — every test suite runs inside a Docker container.
#
# CI contract:
#   1. Docker images must be built before this script is called.
#   2. This script starts whatever services it needs (or reuses already-running
#      ones) and removes the ephemeral test containers on exit.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$REPO_DIR/docker/docker-compose.yml"
PASS=0
FAIL=0

# ── Detect docker compose invocation ──────────────────────────────────────────
if docker compose version >/dev/null 2>&1; then
  DC="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  DC="docker-compose"
else
  echo "ERROR: Neither 'docker compose' (plugin) nor 'docker-compose' (standalone) found." >&2
  echo "       Install Docker Desktop or the Docker Compose plugin and retry." >&2
  exit 1
fi

# ── run_suite <name> <compose-run-flags...> -- <service> <cmd> ────────────────
# Helper that:
#   1. Prints a header with <name>
#   2. Runs: $DC -f $COMPOSE_FILE run --rm <compose-run-flags> <service> sh -c <cmd>
#   3. Increments PASS or FAIL
#
# Usage:
#   run_suite "My suite" service "npm test"
#   run_suite "My suite" service "npm test" -e KEY=VALUE
#   run_suite "My suite" --no-deps service "npm test"
#   run_suite "My suite" --no-deps service "npm test" -e KEY=VALUE
#
# Convention: every argument after <name> and before the bare service name is
# treated as a docker compose run flag; the second-to-last arg is the service;
# the last arg is the shell command to execute.
run_suite() {
  local name="$1"
  shift

  # Last arg is the command to run; second-to-last is the service name.
  # Remaining args (if any) are extra compose-run flags / -e pairs.
  local all_args=("$@")
  local num=${#all_args[@]}
  local cmd="${all_args[$((num - 1))]}"
  local service="${all_args[$((num - 2))]}"
  local compose_flags=("${all_args[@]:0:$((num - 2))}")

  echo ""
  echo "══════════════════════════════════════════════════════"
  echo "  Running: $name"
  echo "  Service: $service  (Docker)"
  echo "══════════════════════════════════════════════════════"

  if $DC -f "$COMPOSE_FILE" run --rm \
      ${compose_flags[@]+"${compose_flags[@]}"} \
      "$service" sh -c "$cmd"; then
    echo ""
    echo "  ✔  $name — PASSED"
    PASS=$((PASS + 1))
  else
    echo ""
    echo "  ✘  $name — FAILED"
    FAIL=$((FAIL + 1))
  fi
}

# ── Ensure the database is healthy before running any backend tests ────────────
# `--wait` honours the service healthcheck and blocks until Postgres accepts
# connections (requires Docker Compose v2.1+).
echo ""
echo "Waiting for PostgreSQL to become healthy..."
if ! $DC -f "$COMPOSE_FILE" up -d --wait db; then
  echo "ERROR: PostgreSQL failed to become healthy — aborting." >&2
  exit 1
fi

# ── Backend (Jest) ────────────────────────────────────────────────────────────
# Runs inside the 'api' container, which ships with:
#   • Node.js + all npm deps (including jest and ts-jest)
#   • DB_HOST=db env var pointing at the running 'db' service, required by
#     the DB-backed integration test (search.db.integration.spec.ts)
run_suite \
  "Backend unit + integration tests (Jest)" \
  -e JWT_SECRET=test-secret-for-testing \
  api \
  "npm test"

# ── Frontend (Vitest) ─────────────────────────────────────────────────────────
# Pure unit/component tests — no database or backend required.
# --no-deps prevents compose from starting 'api' (and transitively 'db').
run_suite \
  "Frontend tests (Vitest)" \
  --no-deps \
  web \
  "npm test"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════"
echo "  Results:  ${PASS} passed  |  ${FAIL} failed"
echo "══════════════════════════════════════════════════════"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
