#!/usr/bin/env bash
# run_tests.sh — run all tests for the GreenLeaf Operations Suite
# Usage: bash run_tests.sh
# Exit code: 0 if all suites pass, non-zero otherwise

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PASS=0
FAIL=0

run_suite() {
  local name="$1"
  local dir="$2"
  local cmd="$3"
  local env_prefix="${4:-}"

  echo ""
  echo "══════════════════════════════════════════════════════"
  echo "  Running: $name"
  echo "  Dir:     $dir"
  echo "══════════════════════════════════════════════════════"

  if (cd "$dir" && eval "$env_prefix $cmd"); then
    echo ""
    echo "  ✔  $name — PASSED"
    PASS=$((PASS + 1))
  else
    echo ""
    echo "  ✘  $name — FAILED"
    FAIL=$((FAIL + 1))
  fi
}

# ── Backend (Jest) ────────────────────────────────────────────────────────────
run_suite \
  "Backend unit + integration tests (Jest)" \
  "$REPO_DIR/server" \
  "npm test" \
  "JWT_SECRET=test-secret-for-testing"

# ── Frontend (Vitest) ─────────────────────────────────────────────────────────
run_suite \
  "Frontend tests (Vitest)" \
  "$REPO_DIR/client" \
  "npm test"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════"
echo "  Results:  ${PASS} passed  |  ${FAIL} failed"
echo "══════════════════════════════════════════════════════"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
