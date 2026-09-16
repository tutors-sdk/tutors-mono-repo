#!/usr/bin/env bash
# Runs every time the container starts. Starts the reader in the background so
# the forwarded port comes up on its own; the log is in /tmp/tutors-dev.log.
set -uo pipefail

if [ ! -f apps/reader/.env ]; then
  cp .env.example apps/reader/.env
fi

nohup pnpm --filter tutors-reader dev --host 0.0.0.0 > /tmp/tutors-dev.log 2>&1 &

echo "Tutors reader starting on port 5173. Open http://localhost:5173/course/reference-course"
echo "Log: tail -f /tmp/tutors-dev.log"
