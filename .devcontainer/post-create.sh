#!/usr/bin/env bash
# Runs once, after the container is created. Mirrors the README quick start.
set -euo pipefail

# pnpm at the exact version pinned in package.json ("packageManager").
# The container runs as the non-root "node" user; enabling corepack writes
# shims into /usr/local/bin, so it needs sudo. Installing pnpm itself does not.
sudo corepack enable
corepack install

pnpm install --frozen-lockfile

# Anonymous mode: no Supabase project or OAuth app needed. Keeps an existing file.
if [ ! -f apps/reader/.env ]; then
  cp .env.example apps/reader/.env
  sed -i 's/^PUBLIC_ANON_MODE=.*/PUBLIC_ANON_MODE=TRUE/' apps/reader/.env
fi

# Pre-build the three UI packages so the first `pnpm dev` is fast.
pnpm --filter @tutors/ui-primitives build
pnpm --filter @tutors/ui-navigators build
pnpm --filter @tutors/ui-components build
