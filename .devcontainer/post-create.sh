#!/usr/bin/env bash
set -euo pipefail

echo "[ckb] Enabling corepack + pnpm…"
corepack enable
corepack prepare pnpm@9.0.0 --activate

echo "[ckb] Installing workspace dependencies…"
pnpm install --frozen-lockfile=false

echo "[ckb] Copying .env from .env.example (if .env missing)…"
if [ ! -f .env ]; then
  cp .env.example .env
fi

echo "[ckb] Making dev/inbox and dev/processed dirs…"
mkdir -p dev/inbox/redlake-expansion dev/processed/redlake-expansion

echo "[ckb] Ready. Next: pnpm dev:up && pnpm db:migrate && pnpm db:seed"
