#!/usr/bin/env bash
# --------------------------------------------------------------------------
# Mutation testing runner for the Tutors monorepo.
#
# Usage:
#   ./tests/mutation/run-mutation-tests.sh              # all targets
#   ./tests/mutation/run-mutation-tests.sh --module time # single module
#   STRYKER_CONCURRENCY=2 ./tests/mutation/run-mutation-tests.sh
# --------------------------------------------------------------------------

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CONFIG="$REPO_ROOT/stryker.config.json"
MODULE="${2:-}"
CONCURRENCY="${STRYKER_CONCURRENCY:-4}"

print_header() {
  echo ""
  echo "╔══════════════════════════════════════════════════════╗"
  echo "║          Tutors Mutation Testing (StrykerJS)         ║"
  echo "╠══════════════════════════════════════════════════════╣"
  echo "║  Tier 8 — Validates test suite kill-power            ║"
  echo "║  Run nightly / pre-release, not on every commit      ║"
  echo "╚══════════════════════════════════════════════════════╝"
  echo ""
}

run_all() {
  echo "[mutation] Running mutation tests against all configured targets..."
  npx stryker run "$CONFIG" --concurrency "$CONCURRENCY"
}

run_module() {
  local module="$1"
  local mutate_glob=""

  case "$module" in
    model)
      mutate_glob="packages/jsr/model/src/**/*.ts"
      ;;
    time)
      mutate_glob="packages/jsr/time/src/**/*.ts"
      ;;
    search)
      mutate_glob="packages/jsr/model/src/services/search.ts"
      ;;
    calendar)
      mutate_glob="packages/jsr/time/src/services/base-calendar-model.ts,packages/jsr/time/src/utils/calendar-utils.ts"
      ;;
    lo-utils)
      mutate_glob="packages/jsr/model/src/utils/lo-utils.ts"
      ;;
    *)
      echo "[mutation] Unknown module: $module"
      echo "[mutation] Valid modules: model, time, search, calendar, lo-utils"
      exit 1
      ;;
  esac

  echo "[mutation] Running mutation tests for module: $module"
  echo "[mutation] Mutating: $mutate_glob"
  npx stryker run "$CONFIG" --mutate "$mutate_glob" --concurrency "$CONCURRENCY"
}

print_header

if [[ "${1:-}" == "--module" && -n "$MODULE" ]]; then
  run_module "$MODULE"
elif [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  echo "Usage:"
  echo "  ./tests/mutation/run-mutation-tests.sh              # all targets"
  echo "  ./tests/mutation/run-mutation-tests.sh --module time # single module"
  echo ""
  echo "Modules: model, time, search, calendar, lo-utils"
  echo ""
  echo "Environment variables:"
  echo "  STRYKER_CONCURRENCY  Number of parallel workers (default: 4)"
else
  run_all
fi

echo ""
echo "[mutation] Report: reports/mutation/index.html"
