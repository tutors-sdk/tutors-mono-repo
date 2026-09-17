#!/usr/bin/env bash
#
# Run OpenSSF Scorecard locally against this repository, mirroring the
# checks performed by .github/workflows/scorecard.yml.
#
# Scorecard queries the GitHub API, so it needs a token. This script reuses
# your `gh` CLI login (gh auth token) — no separate PAT required for a local
# read of a public repo. Note: the Branch-Protection check needs a token with
# admin/administration:read on the repo; a plain user token reports it as 0.
#
# Usage:
#   scripts/scorecard-local.sh                       # analyse tutors-sdk/tutors-mono-repo
#   scripts/scorecard-local.sh --repo owner/name     # analyse another repo
#   scripts/scorecard-local.sh --checks SAST,Fuzzing # subset of checks
#   SCORECARD_FORMAT=json scripts/scorecard-local.sh  # machine-readable output
#
# Requires: gh (authenticated) and one of: scorecard on PATH, docker, or curl.

set -euo pipefail

REPO="tutors-sdk/tutors-mono-repo"
EXTRA_ARGS=()
FORMAT="${SCORECARD_FORMAT:-default}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo) REPO="$2"; shift 2 ;;
    --checks) EXTRA_ARGS+=("--checks=$2"); shift 2 ;;
    --format) FORMAT="$2"; shift 2 ;;
    *) EXTRA_ARGS+=("$1"); shift ;;
  esac
done

if ! command -v gh >/dev/null 2>&1; then
  echo "error: gh CLI not found; install it or export GITHUB_AUTH_TOKEN manually" >&2
  exit 1
fi

# Scorecard reads the token from GITHUB_AUTH_TOKEN.
export GITHUB_AUTH_TOKEN="${GITHUB_AUTH_TOKEN:-$(gh auth token)}"

run_native() {
  scorecard --repo="github.com/${REPO}" --format="${FORMAT}" "${EXTRA_ARGS[@]}"
}

run_docker() {
  docker run --rm -e GITHUB_AUTH_TOKEN \
    gcr.io/openssf/scorecard:stable \
    --repo="github.com/${REPO}" --format="${FORMAT}" "${EXTRA_ARGS[@]}"
}

# Download the released binary to a cache dir if nothing else is available.
run_download() {
  local cache="${HOME}/.cache/scorecard"
  local bin="${cache}/scorecard"
  if [[ ! -x "${bin}" ]]; then
    mkdir -p "${cache}"
    local tag ver os arch
    tag="$(gh api repos/ossf/scorecard/releases/latest --jq .tag_name)"
    ver="${tag#v}"
    os="$(uname -s | tr '[:upper:]' '[:lower:]')"
    case "$(uname -m)" in
      x86_64) arch="amd64" ;;
      aarch64|arm64) arch="arm64" ;;
      *) echo "error: unsupported arch $(uname -m)" >&2; exit 1 ;;
    esac
    echo "Downloading scorecard ${tag} (${os}/${arch})..." >&2
    curl -sSL "https://github.com/ossf/scorecard/releases/download/${tag}/scorecard_${ver}_${os}_${arch}.tar.gz" \
      | tar -xz -C "${cache}" scorecard
    chmod +x "${bin}"
  fi
  "${bin}" --repo="github.com/${REPO}" --format="${FORMAT}" "${EXTRA_ARGS[@]}"
}

echo "Running OpenSSF Scorecard against ${REPO}..." >&2
if command -v scorecard >/dev/null 2>&1; then
  run_native
elif command -v docker >/dev/null 2>&1; then
  run_docker
else
  run_download
fi
