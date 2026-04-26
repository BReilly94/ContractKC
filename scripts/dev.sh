#!/usr/bin/env bash
# One-command dev startup for Contract Knowledge Base.
# Usage: pnpm dev   (from repo root)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

GREEN='\033[0;32m' BLUE='\033[0;34m' YELLOW='\033[1;33m' NC='\033[0m'
step() { echo -e "${BLUE}▶ $1${NC}"; }
ok()   { echo -e "${GREEN}✓ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠ $1${NC}"; }

# ── 1. Docker services ────────────────────────────────────────────────────────
step "Checking Docker services..."
if ! docker info &>/dev/null; then
  echo "Docker is not running. Please start Docker and re-run." >&2
  exit 1
fi

COMPOSE="docker compose -f infra/local/docker-compose.yml --env-file .env"

if ! $COMPOSE ps --status running 2>/dev/null | grep -q "ckb-mssql"; then
  step "Starting Docker services..."
  $COMPOSE up -d
else
  ok "Docker services already running"
fi

# ── 2. Wait for SQL Server ────────────────────────────────────────────────────
step "Waiting for SQL Server to be healthy..."
ATTEMPTS=0
until [ "$(docker inspect -f '{{.State.Health.Status}}' ckb-mssql 2>/dev/null)" = "healthy" ]; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ $ATTEMPTS -ge 40 ]; then
    echo "SQL Server did not become healthy after 120 s. Check: docker logs ckb-mssql" >&2
    exit 1
  fi
  sleep 3
done
ok "SQL Server ready"

# ── 3. Build workspace packages (only when dist/ is missing) ─────────────────
NEEDS_BUILD=false
for pkg in packages/shared packages/domain packages/auth packages/audit packages/ai packages/erp packages/ui-kit; do
  if [ ! -d "$ROOT/$pkg/dist" ]; then
    NEEDS_BUILD=true
    break
  fi
done

if [ "$NEEDS_BUILD" = "true" ]; then
  step "Building workspace packages (first run — subsequent starts skip this)..."
  pnpm -r build
  ok "Packages built"
else
  ok "Packages already built"
fi

# ── 4. Database migrations ────────────────────────────────────────────────────
step "Running database migrations..."
pnpm db:migrate
ok "Migrations complete"

# ── 5. Start API + web concurrently ──────────────────────────────────────────
step "Starting API (port 4000), workers, and web app (port 3000)..."
echo ""
echo "  API:     http://localhost:4000/health"
echo "  Web:     http://localhost:3000"
echo "  Workers: malware-scan, OCR, embed-index, clause-extract, and more"
echo ""
echo "  In Codespaces — open the PORTS tab and click the globe next to port 3000."
echo "  Press Ctrl+C to stop everything."
echo ""

exec npx --yes concurrently \
  --names "api,workers,web" \
  --prefix-colors "cyan,yellow,magenta" \
  --kill-others-on-fail \
  "pnpm --filter @ckb/api run dev" \
  "pnpm --filter @ckb/workers run dev" \
  "pnpm --filter @ckb/web run dev"
