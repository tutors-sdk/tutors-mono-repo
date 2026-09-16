#!/usr/bin/env bash
# Runs once, after the container is created. Mirrors the README quick start.
set -euo pipefail

# pnpm at the exact version pinned in package.json ("packageManager").
corepack enable
corepack install

pnpm install --frozen-lockfile

# Anonymous mode: no Supabase project or OAuth app needed. -n keeps an existing file.
cp -n .env.example apps/reader/.env || true

# Pre-build the three UI packages so the first `pnpm dev` is fast.
pnpm --filter @tutors/ui-primitives build
pnpm --filter @tutors/ui-navigators build
pnpm --filter @tutors/ui-components build
