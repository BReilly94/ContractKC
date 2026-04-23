# Local Development Setup

**Scope:** How to run the Contract Knowledge Base on a single Windows 11 developer machine during the build phase. Azure is the production target; this runbook keeps local dev independent of it.

**Read first:** `CLAUDE.md` §3 (tech stack), the deployment-context memory, and `docs/architecture/data-model.md` / `email-ingestion.md` if working on those areas.

---

## 1. Pinned Decisions

Three decisions that the rest of this runbook depends on. Override any of them in an ADR if we change our mind; the provider-abstraction pattern (§4) means code shouldn't need to change either way.

| Decision | Choice | Reason |
|---|---|---|
| Local database | **SQL Server 2022 in Docker** (`mcr.microsoft.com/mssql/server:2022-latest`) | Closest dialect to Azure SQL. Azure-native T-SQL features (temporal tables, hash indexes) work identically. Containerized keeps setup uniform with the rest of the stack. |
| Local search | **OpenSearch 2.x in Docker**, with a shim implementing our `SearchClient` interface over its REST API | Azure AI Search has no emulator. OpenSearch supports hybrid vector + BM25 retrieval, which is the §5.3 requirement. We wrap it so Azure AI Search substitution later is a config flip. |
| Local email ingestion | **Filesystem watcher** dropping `.eml` files from `./dev/inbox/<contract-slug>/` into the same worker pipeline a real SendGrid webhook would feed | Exercises the full ingestion worker offline. No ngrok, no public URL, no test SendGrid account. When we want end-to-end smoke tests with a real provider, ngrok is a second-tier option. |

**Other pinned substitutes:**

| Azure service | Local substitute |
|---|---|
| Azure Blob Storage | Azurite (official MS emulator, Docker image `mcr.microsoft.com/azure-storage/azurite`) |
| Azure Service Bus | BullMQ on Redis (`redis:7-alpine`) behind a `QueueClient` abstraction. RabbitMQ deferred until pub/sub semantics are actually required. |
| Azure Key Vault | gitignored `.env` behind a `SecretsProvider` abstraction |
| Azure AD / Entra ID | Dev-mode auth provider: hard-coded test users gated on `AUTH_MODE=local-dev` |
| Anthropic API | Real API (no emulator). API key in `.env`. |

---

## 2. Prerequisites

Install on the host (Windows 11):

| Tool | Version | Purpose |
|---|---|---|
| Docker Desktop | Current stable | Runs all dependency services |
| Node.js | LTS (≥ 20.x) | Builds and runs the app |
| pnpm | Current stable | Monorepo package manager |
| Git | Current stable | Version control |
| VS Code (or IDE of choice) | Current stable | Editing |
| Azure Data Studio *(optional)* | Current stable | Query the local SQL Server |

No WSL required. Docker Desktop on Windows uses WSL2 under the hood but none of this guide touches a WSL shell directly — commands run from Git Bash or PowerShell on Windows.

**Line endings:** the earlier `git init` surfaced CRLF warnings. Set repo-level EOL handling before the first real commit:

```
git config core.autocrlf false
```

Then add a `.gitattributes` that pins LF for source files. (Not in the current repo yet — add when we start committing code.)

---

## 3. Architecture at a Glance (Local vs. Azure)

```
                          LOCAL DEV                                         AZURE (eventual)
                          ─────────                                         ────────────────
        Browser                                                     Browser
           │                                                           │
           ▼                                                           ▼
    ┌─────────────┐                                            ┌─────────────┐
    │  Next.js    │  apps/web (localhost:3000)                │  Next.js    │  App Service
    └──────┬──────┘                                            └──────┬──────┘
           │                                                           │
           ▼                                                           ▼
    ┌─────────────┐                                            ┌─────────────┐
    │  NestJS API │  apps/api (localhost:4000)                │  NestJS API │  App Service
    └──────┬──────┘                                            └──────┬──────┘
           │                                                           │
   ┌───────┼─────────┬─────────────┬────────────┐          ┌──────────┼─────────┬──────────────┬────────────┐
   ▼       ▼         ▼             ▼            ▼          ▼          ▼         ▼              ▼            ▼
┌──────┐ ┌──────┐ ┌──────────┐ ┌──────────┐ ┌────────┐  ┌────────┐ ┌────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐
│ MSSQL│ │Azurit│ │  Redis   │ │OpenSearch│ │.env    │  │Azure   │ │Azure   │ │Azure     │ │Azure AI  │ │Key     │
│ 2022 │ │e blob│ │ (BullMQ) │ │          │ │secrets │  │SQL     │ │Blob    │ │Service   │ │Search    │ │Vault   │
└──────┘ └──────┘ └──────────┘ └──────────┘ └────────┘  └────────┘ └────────┘ │Bus       │ └──────────┘ └────────┘
                                                                              └──────────┘

                    Ingestion (local):                                  Ingestion (Azure):
                    dev/inbox/*.eml → folder-watcher                    contracts.technicamining.com → SendGrid
                            → EmailIngestClient                                 → Webhook
                                                                                → EmailIngestClient
```

The API, worker, and web code are identical. What changes between environments is which implementation of each client interface is wired into the DI container at boot.

---

## 4. Provider Abstractions — The Core Rule

Every cloud-dependent concern goes behind an interface. Business code never imports an Azure SDK or a local-substitute SDK. Dependency injection chooses the implementation at boot based on `PROVIDER_MODE=local|azure`.

### 4.1 Interfaces to define in `packages/*`

| Interface | Package | Local impl | Azure impl |
|---|---|---|---|
| `LLMClient` | `packages/ai/client/` | Anthropic SDK (real API) | Anthropic SDK (real API) — same, just different key source |
| `StorageClient` | `packages/storage/` | Azurite (Azure Storage SDK pointed at emulator) | Azure Blob Storage |
| `QueueClient` | `packages/queue/` | BullMQ on Redis | Azure Service Bus + BullMQ on Azure Cache for Redis |
| `SearchClient` | `packages/search/` | OpenSearch REST | Azure AI Search |
| `SecretsProvider` | `packages/secrets/` | `.env` loader | Azure Key Vault |
| `AuthProvider` | `packages/auth/` | Dev-mode local users | Entra ID OIDC |
| `EmailIngestClient` | `apps/ingestion/` | Folder watcher | SendGrid webhook handler |
| `MalwareScanner` | `packages/scanning/` | ClamAV in Docker | Defender for Storage (TBC per Q-EI-2) |

### 4.2 Contract discipline

- The interface lives in `packages/<name>/src/interface.ts`.
- Each implementation lives in `packages/<name>/src/impl/<provider>.ts`.
- The DI factory in `packages/<name>/src/factory.ts` picks an impl from config.
- Any behavior an implementation *can't* support locally is an explicit `throw NotSupportedInLocalError("reason")`, never a silent no-op.

### 4.3 What *doesn't* go behind an interface

- Framework choices (NestJS, Next.js, React Query, Zustand) — these run identically in both environments.
- Domain logic in `packages/domain/` — pure TypeScript, no provider awareness.
- The `LLMClient` has only one "impl" (real Anthropic API) — the abstraction exists for capability isolation and test-mocking per `.claude/rules/ai-layer.md` §3, not for provider swapping.

---

## 5. First-Time Setup

Assumes the repo is cloned at `C:\Users\sarge\Desktop\ContractKC`.

### 5.1 Install toolchain

1. Install Docker Desktop; confirm with `docker --version` and `docker compose version`.
2. Install Node LTS; confirm with `node --version`.
3. Install pnpm: `npm install -g pnpm`; confirm with `pnpm --version`.

### 5.2 Clone secrets template

Create `.env` at the repo root, gitignored. A template lives at `.env.example` (to be created — see §7).

### 5.3 Start dependency services

From repo root:

```
docker compose -f infra/local/docker-compose.yml up -d
```

This starts: SQL Server, Azurite, Redis, OpenSearch, ClamAV. All on fixed ports, all with deterministic dev credentials (fine locally, never reused in Azure).

### 5.4 Install and build

```
pnpm install
pnpm build
```

### 5.5 Bootstrap the database

```
pnpm db:migrate
pnpm db:seed
```

The seed creates: one system admin user, two dev users (a Contract Owner and a Viewer), one pilot contract, two sample documents, a handful of emails in `./dev/inbox/` ready to ingest.

### 5.6 Start the app

Three terminals:

```
pnpm dev:api        # NestJS API on :4000
pnpm dev:web        # Next.js on :3000
pnpm dev:workers    # Background workers + folder-watcher
```

Log in at `http://localhost:3000` with the dev user picker (only visible when `AUTH_MODE=local-dev`).

---

## 6. docker-compose Stack

File lives at `infra/local/docker-compose.yml` (to be created). Shape:

| Service | Image | Ports | Volume | Notes |
|---|---|---|---|---|
| `mssql` | `mcr.microsoft.com/mssql/server:2022-latest` | 1433 | `mssql-data` | `SA_PASSWORD` in `.env`, `ACCEPT_EULA=Y`, `MSSQL_PID=Express` |
| `azurite` | `mcr.microsoft.com/azure-storage/azurite:latest` | 10000-10002 | `azurite-data` | Default well-known key; fine locally |
| `redis` | `redis:7-alpine` | 6379 | `redis-data` | Backs BullMQ for job scheduling, retries, DLQ. |
| `opensearch` | `opensearchproject/opensearch:2` | 9200, 9600 | `opensearch-data` | `discovery.type=single-node`, security plugin disabled for dev only |
| `opensearch-dashboards` | `opensearchproject/opensearch-dashboards:2` | 5601 | — | Optional, for debugging indexes |
| `clamav` | `clamav/clamav:stable` | 3310 | `clamav-data` | Signature DB updates on first boot — slow initial start |

Each service has a healthcheck. `pnpm dev:*` scripts wait on healthchecks before starting.

---

## 7. Environment Variables

`.env.example` (committed) and `.env` (gitignored) carry these. Keep parity.

```
# Mode
NODE_ENV=development
PROVIDER_MODE=local
AUTH_MODE=local-dev

# API / Web
API_PORT=4000
WEB_PORT=3000
WEB_BASE_URL=http://localhost:3000

# SQL Server
DATABASE_URL=mssql://sa:<dev-password>@localhost:1433/ckb?encrypt=false

# Azurite (well-known dev credentials — safe because emulator only)
STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://localhost:10000/devstoreaccount1;

# Redis (backs BullMQ queues)
REDIS_URL=redis://localhost:6379

# OpenSearch
SEARCH_URL=http://localhost:9200
SEARCH_NAMESPACE_PREFIX=ckb-dev

# ClamAV
MALWARE_SCAN_URL=tcp://localhost:3310

# Anthropic (real API)
ANTHROPIC_API_KEY=<your-key>
ANTHROPIC_ZERO_RETENTION=true

# Dev ingestion
EMAIL_INBOX_DIR=./dev/inbox
```

**Rule:** `.env` never has a real Technica-tenant secret, even for Anthropic. If a production key is needed to test against the production Anthropic account, use a separately-managed key with usage caps.

---

## 8. Local Email Ingestion — How the Folder Watcher Works

The folder watcher is a dev-only implementation of `EmailIngestClient`. It does not replace the SendGrid webhook path; both call into the same ingestion worker.

### 8.1 Directory layout

```
dev/
├── inbox/
│   ├── <contract-slug>/              # Each subfolder maps to a contract's alias
│   │   ├── 2026-04-15-some-email.eml
│   │   └── 2026-04-16-another.eml
│   └── _unknown/                      # Drop emails with unresolvable recipient here
└── processed/
    └── <contract-slug>/
        └── 2026-04-15-some-email.eml  # Moved here after ingestion
```

### 8.2 Flow

1. A `.eml` file dropped into `dev/inbox/<contract-slug>/` triggers the watcher.
2. Watcher reads the file, creates an `inbound_email_event` row with `provider = LocalFolderWatcher`, stashes the raw bytes in Azurite.
3. Watcher enqueues an ingestion job with the same shape the SendGrid webhook produces.
4. The ingestion worker processes it identically: hash, parse, persist, index.
5. On success, the watcher moves the file to `dev/processed/<contract-slug>/`. On failure, it stays in `inbox/` with a sidecar `.error.json` describing the failure.

### 8.3 Sample emails for testing

`dev/inbox-samples/` (committed, not auto-ingested) holds a set of representative `.eml` files:
- Plain prose correspondence.
- Email with PDF attachment.
- Email with encrypted-PDF attachment (for the unlock flow).
- Email with OneDrive shared link.
- Email with `.ics` invite.
- Reply in an existing thread (for thread reconstruction).
- Duplicate of an earlier email (for dedup).

Copying from `inbox-samples/` to `inbox/<contract-slug>/` exercises the corresponding ingestion branch.

### 8.4 ngrok path (secondary, optional)

When we want to smoke-test against a real SendGrid-style webhook:

1. Free SendGrid account, verify a sandbox domain (not `contracts.technicamining.com`).
2. Configure Inbound Parse to POST to `https://<ngrok-tunnel>.ngrok.io/webhooks/inbound-email/sendgrid`.
3. Start `ngrok http 4000` and paste the URL into the SendGrid config.
4. Send mail to the sandbox address; watch it flow through the same worker.

Documented for completeness; not part of the default dev loop.

---

## 9. Database Bootstrap

### 9.1 Migrations

Migrations live in `apps/api/src/db/migrations/`. Tool: whatever the ORM shakes out as (proposed: Drizzle or TypeORM — pending ADR). `pnpm db:migrate` applies all pending migrations against `DATABASE_URL`.

### 9.2 Audit-table grants

Non-Negotiable #4 says the audit log has UPDATE/DELETE grants revoked for application-tier users. Enforce this locally from day one:

- Migration creates two SQL users: `ckb_app` and `ckb_auditor`.
- `ckb_app` has `INSERT, SELECT` on `audit_log` — no UPDATE, no DELETE.
- `ckb_auditor` has `SELECT` on `audit_log` plus the audit-export views.
- The app's connection string uses `ckb_app`.

Local dev enforces this even though everything runs on one machine — if a developer breaks it, they find out immediately rather than in an Azure cutover.

### 9.3 Seed data

`pnpm db:seed` creates:
- One system admin user (you).
- Two dev contacts (Contract Owner "Dana", Contract Viewer "Sam") with per-contract access.
- One pilot contract with canonical + human alias already provisioned.
- Two sample documents attached to the pilot contract.
- A handful of `.eml` files in `dev/inbox/<pilot-slug>/` ready to ingest on watcher start.

Seed is idempotent — re-running wipes and recreates dev data but leaves the schema intact.

---

## 10. Search Index Bootstrap

On first boot, `packages/search/` creates one OpenSearch index per active contract following the namespace pattern `<SEARCH_NAMESPACE_PREFIX>-contract-<ulid>`. This mirrors the per-contract isolation rule (Non-Negotiable #6) that Azure AI Search will enforce later.

Index mapping (summary):
- `chunk_id` (keyword)
- `contract_id` (keyword)
- `source_type` (keyword — `Document`, `Email`, `Clause`, `DiaryEntry`)
- `source_id` (keyword)
- `text` (text, analyzed)
- `embedding` (knn_vector, dims TBD after we pick an embedding model)

Re-indexing: `pnpm search:reindex --contract <id>` walks the contract's documents and emails and rebuilds the index.

---

## 11. Known Divergences from Azure

Call these out in code comments where they matter. No silent drift.

| Concern | Local | Azure | Mitigation |
|---|---|---|---|
| Data residency | N/A (on your laptop) | Canada Central / East enforced in infra | Infra module has a region guard; fails plan time. Non-Negotiable only activates in Azure. |
| Secret rotation | Not exercised | Key Vault rotation policies | Plan cutover checklist includes rotating every `.env` secret. |
| Queue ordering | BullMQ FIFO per queue (single consumer) | Service Bus sessions | Worker code must not depend on strict FIFO across queues; document where ordering is assumed. |
| Search hybrid semantics | OpenSearch `knn` + BM25 combined client-side | Azure AI Search native hybrid | `SearchClient` contract pins the hybrid scoring formula; implementations reproduce it. |
| Auth flows | Fake users, no MFA | Entra ID with MFA required | `AUTH_MODE=local-dev` gates the fake path. Any non-local environment must have `AUTH_MODE=entra`. Startup fails closed if misconfigured in a non-dev environment. |
| Outbound email DKIM | Not tested locally | ACS Email with DKIM | Phase 2 only. Validate during cutover, not before. |
| Blob SSE-256 | Azurite uses its own scheme | SSE-256 with Azure-managed keys | Storage contract doesn't expose encryption details; both impls satisfy "at rest encrypted". |

---

## 12. What to Do When Something Doesn't Work Locally

Some Phase 1/2 features genuinely can't be validated on a single machine:

- **Real MX + SPF + DMARC reporting** — needs the real subdomain. Validate in a pre-prod Azure environment, not locally.
- **Outbound DKIM signing** — same as above.
- **Entra ID MFA flows** — needs the real tenant. Dev-mode auth is the local stand-in; MFA is proven during cutover.
- **Data residency policy enforcement** — only meaningful in Azure.
- **Cross-region failover (RPO 1h / RTO 4h)** — validate in Azure, not locally.

For each: note the "tested in Azure cutover" status and keep an explicit test plan in `docs/runbooks/azure-cutover.md` (to be written when cutover is real).

---

## 13. When We Move to Azure

Prerequisite: `docs/runbooks/azure-cutover.md` is written and reviewed. At minimum it covers:

1. Terraform / Bicep for every service in §3 right-side column.
2. Key Vault population — rotate every dev secret before production use.
3. Database migration path — export from local SQL Server, import to Azure SQL, run migrations to catch any drift.
4. Blob migration — copy content-addressed blobs from Azurite to Azure Blob (hashes remain the same, so references stay valid).
5. Search reindex — rebuild against Azure AI Search from the relational source of truth.
6. DNS cutover for `contracts.technicamining.com`.
7. `PROVIDER_MODE=azure`, `AUTH_MODE=entra`, redeploy.
8. Smoke tests covering each Non-Negotiable.

Local dev continues to work against `PROVIDER_MODE=local` indefinitely — the abstraction layer is not removed after cutover.

---

## 14. Status of This Runbook

This runbook describes the intended setup. None of the artifacts below exist yet — they're the work the runbook will drive:

- [ ] `infra/local/docker-compose.yml`
- [ ] `.env.example`
- [ ] `.gitattributes`
- [ ] `packages/storage/`, `packages/queue/`, `packages/search/`, `packages/secrets/`, `packages/auth/`, `packages/scanning/` — interfaces + local impls
- [ ] `apps/api/src/db/migrations/` initial schema from `data-model.md`
- [ ] Seed scripts
- [ ] Folder watcher implementation
- [ ] Sample `.eml` set in `dev/inbox-samples/`

Treat the checklist above as the Phase 0 work — nothing else meaningfully moves until this is in place.
