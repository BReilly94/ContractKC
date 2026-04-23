# Phase 0 Build Plan

**Status:** Plan for review. No code yet.
**Purpose:** Stand up the repo scaffolding, provider abstractions, local infrastructure, schema, and test harness needed before any Phase 1 §5.x feature can start. Phase 0 ends when an `.eml` dropped into `dev/inbox/<contract>/` flows through the real ingestion worker, lands in immutable blob storage, creates an `email` row, and writes an audit-log entry — all with the local stack up and the Non-Negotiables that *can* be enforced locally enforced.

**Read first:**
- `CLAUDE.md` §3 (tech stack), §4 (repo layout), §7 (AI rules), §10 (gates).
- `.claude/rules/*.md`.
- `docs/architecture/data-model.md`.
- `docs/architecture/email-ingestion.md`.
- `docs/runbooks/local-dev.md` — the operational target Phase 0 is reaching.

**Not in Phase 0:** any Phase 1 feature from SOW §5. Phase 0 is pure scaffolding; feature work starts at Phase 1.

---

## 1. Wave Structure

Six waves. Within a wave, most items are parallel; waves are sequenced by dependency. A wave is "done" when its exit criteria are green.

```
Wave 0 — Foundations
   │
   ├──► Wave 1 — Provider abstractions
   │        │
   │        └──► Wave 2 — Schema + audit
   │                 │
   │                 └──► Wave 3 — App scaffolding
   │                          │
   │                          ├──► Wave 4 — Search + seed + samples
   │                          │
   │                          └──► Wave 5 — Test harness
   │                                   │
   └───────────────────────────────────►  Wave 6 — Acceptance
```

Wave 5 (test harness) can run partially in parallel with Wave 4 — they share no blocking dependencies. Wave 6 is a verification wave, not a build wave.

---

## 2. Decisions to Pin Before Wave 0

These shape every later wave. Calling them out so we don't discover them mid-build.

| Decision | Recommendation | Rationale |
|---|---|---|
| Package manager / monorepo | pnpm workspaces | Fast, first-class TypeScript monorepo support, matches CLAUDE.md tooling. |
| ORM / query builder | **Drizzle** (preferred) or TypeORM (fallback) | Drizzle is SQL-first with excellent TS inference — fits the explicit schema work in `data-model.md`. TypeORM has deeper NestJS integration but decorator-heavy models make enum/graph tables noisy. Propose Drizzle with a plain-SQL migration tool (e.g., `drizzle-kit`); revisit if Drizzle's MSSQL support blocks us. |
| Job queue / worker runtime | BullMQ on Redis | Simpler than RabbitMQ for Phase 0 needs (retries, delayed jobs, DLQ). Drop RabbitMQ from the local Docker stack until pub/sub semantics are actually required. Update `local-dev.md` §6 accordingly. |
| Regression harness path | Pinned at **`packages/ai/regression/`** | CLAUDE.md §4 previously showed `tests/ai-regression/` while §7.5 and `.claude/rules/ai-layer.md` §7 pointed to `packages/ai/regression/`. §4 now corrected. |
| Logging | Pino behind a `Logger` interface in `packages/shared/` | Structured logs, fast, correlation-ID-friendly. |
| Date / time | `date-fns` for manipulation; UTC at every boundary | Lighter than Luxon, no moment. |
| Test runner | Vitest (unit + integration), Playwright (e2e) | Matches CLAUDE.md. |
| Lint / format | ESLint + Prettier + `eslint-plugin-jsx-a11y` + `@typescript-eslint` | `ui.md` §2 requires a11y lint. |

Mark any of these as overridden and I'll re-plan the wave affected.

---

## 3. Wave 0 — Foundations

**Goal:** Clean monorepo, shared types, shared utilities. No cloud dependencies yet.

### 3.1 Items (parallel within wave)

| # | Item | Contents |
|---|---|---|
| 0.1 | Monorepo root | `package.json` with pnpm workspaces; root `tsconfig.json` (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`); ESLint + Prettier configs; `.editorconfig`; per-package `tsconfig` that extends root. |
| 0.2 | Git hygiene | `.gitignore` (Node, build, `.env`, `.env.local`, `dev/processed/`, OS junk); `.gitattributes` pinning LF for source and binary-flag for `.eml` samples; `git config core.autocrlf false` note in `local-dev.md`. |
| 0.3 | `.env.example` | From `local-dev.md` §7. |
| 0.4 | `infra/local/docker-compose.yml` | SQL Server 2022, Azurite, Redis, OpenSearch (+ dashboards optional), ClamAV. Healthchecks on each. Named volumes. No RabbitMQ per §2. |
| 0.5 | `packages/shared/` | Pure cross-cutting utilities. Contents below. |
| 0.6 | `packages/domain/` | Pure types — no IO. Contents below. |
| 0.7 | Root scripts | `pnpm dev:up` (docker compose up + wait for health), `pnpm dev:down`, `pnpm build`, `pnpm check` (lint + typecheck + test + build), `pnpm clean`. |

### 3.2 `packages/shared/` contents

- `logger.ts` — Pino-backed `Logger` interface with `info/warn/error/debug`, child-logger with correlation ID. Implementation swappable.
- `correlation.ts` — ULID generation; AsyncLocalStorage-based correlation context; helper to attach correlation ID to outgoing HTTP / queue messages.
- `time.ts` — `utcNow()`, `parseIso()`, `formatInZone()`. All business code calls these, never `new Date()` raw.
- `hash.ts` — `sha256(Buffer): string` (64-char hex), `contentAddressedPath(sha256, suffix?): string` returning `sha256/<hash>[/<suffix>]`. Pure; no IO.
- `ids.ts` — `newUlid()`, branded ID helpers.
- `money.ts` — `Money = { cents: number; currency: ISO4217 }`, formatters (presentation only; storage is cents).
- `result.ts` — `Ok<T> | Err<E>` helper if the team wants explicit error returns. Optional.
- `errors.ts` — `NotSupportedInLocalError`, `NotFoundError`, `UnauthorizedError`, `ForbiddenError`, `ConflictError`, `ValidationError`. All carry `code`, `message`, `details`.

### 3.3 `packages/domain/` contents

Pure types — no classes, no IO, no SDK imports. Source of truth for shapes used across app and packages.

- `contract.ts` — `Contract`, `ContractLifecycleState` enum, `ConfidentialityClass` enum, `ContractSummary`, `VerificationState` enum.
- `document.ts` — `Document`, `DocumentVersion`, `DocumentCategory` enum, `MalwareScanStatus`, `OcrStatus`, `EncryptionState`, `RedactionState` enums.
- `email.ts` — `Email`, `EmailThread`, `EmailAlias`, `SenderTrustEntry`, `ReviewQueueItem`, `SharedLinkCapture`, `CalendarEvent`, `InboundEmailEvent`.
- `clause.ts` — `Clause`, `ClauseRelationship`, `ClauseType` enum (candidate list from `data-model.md` §5).
- `access.ts` — `ContractAccess`, `ContractRole` enum, `ContractAccessRevocation`.
- `audit.ts` — `AuditLogEntry` (read-shape only; writer lives in `packages/audit/`).
- `ids.ts` — branded: `ContractId`, `DocumentId`, `EmailId`, `ClauseId`, `UserId`, `AccessGrantId`, etc.

### 3.4 Exit criteria

- `pnpm install` succeeds on a clean clone.
- `pnpm check` runs without source files (lint/typecheck/test are no-op or trivially green).
- `pnpm dev:up` starts all containers; `pnpm dev:health` reports each healthy.
- `packages/domain/` and `packages/shared/` build cleanly, no external SDK imports.

---

## 4. Wave 1 — Provider Abstractions

**Goal:** Every cloud-dependent concern behind an interface, with a working local implementation and a stub for the Azure implementation.

Rule: interface file + local impl file + factory file + README documenting the provider, the config keys it reads, and any known divergences from the eventual Azure impl.

### 4.1 Items (parallel within wave)

| # | Package | Interface | Local impl | Notes |
|---|---|---|---|---|
| 1.1 | `packages/secrets/` | `SecretsProvider.get(key): Promise<string>`, `getRequired(key)`, `has(key)` | Reads `process.env` (dotenv loaded at app boot, not by this package) | Azure impl stubbed. Fails closed if a required secret is missing. |
| 1.2 | `packages/storage/` | `put(path, bytes, { ifNoneMatch? })`, `get(path)`, `stat(path)`, `exists(path)`, `contentAddressedPath(sha256, suffix?)` | `@azure/storage-blob` pointed at Azurite via `STORAGE_CONNECTION_STRING` | Azurite uses the real Azure Storage SDK — the Azure impl is the same SDK with a different connection string. Single impl, config-driven. |
| 1.3 | `packages/queue/` | `enqueue(queueName, payload, opts?)`, `consume(queueName, handler, { concurrency })`, `dlq(queueName): AsyncIterable<FailedJob>` | BullMQ on Redis | Azure impl (Service Bus + Azure Redis) stubbed for cutover. |
| 1.4 | `packages/search/` | `ensureNamespace(contractId)`, `indexChunks(contractId, chunks[])`, `hybridQuery(contractId, q, filters?)`, `deleteNamespace(contractId)` | OpenSearch REST via `@opensearch-project/opensearch` | Per-contract index named `<prefix>-contract-<ulid>`. Hybrid scoring formula pinned in the contract. |
| 1.5 | `packages/auth/` | `verifyToken(token): Principal \| null`, `issueDevToken(userId)`, `listDevUsers(): User[]` (local-only method, gated) | In-memory dev users from `.env`-configured list plus seed data | `AUTH_MODE=local-dev` required. Any non-local env sets `AUTH_MODE=entra` and the dev methods throw. |
| 1.6 | `packages/scanning/` | `scan(bytes): Promise<{ clean: boolean; signatures?: string[] }>` | ClamAV over TCP | Azure impl (Defender for Storage) stubbed; choice pending Q-EI-2. |
| 1.7 | `packages/ai/` skeleton | `LLMClient.complete({ model, messages, ... })` with zero-retention enforcement | Real Anthropic SDK | No capabilities yet. Capability scaffolding added as features land. Regression harness skeleton at `packages/ai/regression/`. |

### 4.2 `packages/ai/` Phase 0 scope

Build only what later capabilities need to hang off:

- `client/interface.ts` — `LLMClient` interface.
- `client/anthropic.ts` — real impl. Verifies zero-retention header at init; fails closed if not set.
- `client/factory.ts` — always returns Anthropic impl (only one).
- `routing.ts` — empty capability→model table (capabilities fill it in as they land).
- `regression/runner.ts` — skeleton that iterates `queries.jsonl` and reports pass/fail against `baseline.json`. Empty inputs at Phase 0 — green because empty.
- `regression/queries.jsonl` — empty.
- `regression/baseline.json` — `{ "minPassRate": 1.0 }`.

No capabilities at Phase 0. First capability (email pre-screen) lands when we start the ingestion worker's AI stage.

### 4.3 Exit criteria

- Each provider package builds, lints, and has a smoke test that hits its local service (e.g., `StorageClient` writes and reads a 4 KB buffer; `QueueClient` enqueues and consumes a test message; `SearchClient` creates and deletes a test namespace).
- `AUTH_MODE` fallthrough enforced: trying to boot with `PROVIDER_MODE=azure` but Azure impls missing fails at startup with a clear message.
- Every package has a `README.md` describing purpose, config keys read, and local/Azure divergences.

---

## 5. Wave 2 — Schema + Audit

**Goal:** Database at the shape described in `data-model.md` and `email-ingestion.md`, with audit-table grants enforcing Non-Negotiable #4 from day one.

### 5.1 Items (sequenced; migrations apply in order)

| # | Item | Contents |
|---|---|---|
| 2.1 | `apps/api/src/db/` connection | Drizzle client wired via `SecretsProvider`. Two pools: one for `ckb_app` (day-to-day), one for `ckb_auditor` (read-only + audit-export views). |
| 2.2 | Migration `0001_initial` | Create tables: `contract`, `contract_summary`, `user`, `party`, `contract_access`, `contract_access_revocation`, `document`, `document_version`, `document_tag`, `tag`, `email`, `email_thread`, `email_alias`, `sender_trust_entry`, `email_review_queue_item`, `shared_link_capture`, `calendar_event`, `inbound_email_event`, `clause`, `clause_relationship`. Indexes per `data-model.md`. Enums per `data-model.md` / `email-ingestion.md`. |
| 2.3 | Migration `0002_audit_log` | Create `audit_log` table, hash-chain trigger, `ckb_app` and `ckb_auditor` SQL users. Revoke UPDATE / DELETE on `audit_log` from `ckb_app`. |
| 2.4 | `packages/audit/` | `AuditWriter.log(actor, action, entityType, entityId, before?, after?, correlationId)`; `AuditReader.query(filters)` and `export(filters): Stream`; hash-chain computed in the writer (each row hashes over prior row's hash + row payload). |
| 2.5 | Lifecycle transition tables | Static data / DB table enumerating legal transitions per entity (Contract, Email review item, Document version). Consumed by the FSM code later. |

### 5.2 Schema details worth calling out

- **Content-addressed blob paths** stored as `string` columns (`blob_path`, `raw_eml_blob_path`, `ocr_text_blob_path`). Constraint: path starts with `sha256/` in local and in Azure.
- **`raw_eml_sha256`** on `email` is `CHAR(64)`, indexed. Required.
- **Enums** as SQL Server `VARCHAR` + CHECK constraints (not native enum types; portability to other engines is easier and Drizzle supports this cleanly).
- **ULIDs** as `CHAR(26)`.
- **Timestamps** as `DATETIMEOFFSET`, all stored UTC.
- **Money columns** as `BIGINT` (cents) + `CHAR(3)` (currency).
- **Many-to-many** junction tables named explicitly, no "inferred" names.

### 5.3 Exit criteria

- `pnpm db:migrate` applies all migrations to an empty DB and completes without error.
- `pnpm db:migrate` is idempotent — rerunning on an up-to-date DB is a no-op.
- A test suite for `packages/audit/` verifies: (a) writes succeed from `ckb_app`, (b) UPDATE / DELETE on `audit_log` fails from `ckb_app` with a clear permissions error, (c) hash chain is intact across 100 sequential writes, (d) tampering with any row in between breaks verification.
- Non-Negotiable #4 test exists and passes.

---

## 6. Wave 3 — App Scaffolding

**Goal:** Boot each app end-to-end. No features, but each app starts cleanly, resolves its clients, logs structured output, and passes a health check.

### 6.1 `apps/api/` — NestJS

- Module layout: `AppModule`, `HealthModule`, `AuthModule`, `CorrelationModule`. Feature modules added in Phase 1.
- Providers wired via DI: `SecretsProvider`, `StorageClient`, `QueueClient`, `SearchClient`, `AuthProvider`, `MalwareScanner`, `LLMClient`, `AuditWriter`. All injectable by interface, not by impl.
- Middleware:
  - Correlation ID — pulls `x-correlation-id` from the request or generates a new ULID; binds to AsyncLocalStorage; emits on response header.
  - Structured request logger.
  - Global exception filter — no stack traces or internal state in user-facing responses (per `ui.md` §9 and `security.md` §13); full detail in logs keyed on correlation ID.
- Guards:
  - `AuthGuard` — validates token via `AuthProvider`, attaches `Principal` to request.
  - `ContractAccessGuard` — requires a contract ID on the route; checks `contract_access` + revocation stack (`security.md` §3).
- Routes at Phase 0:
  - `GET /health` — returns status + liveness of each client (DB, storage, queue, search, scanner, LLM if reachable).
  - `GET /health/ready` — readiness probe — returns 200 once all dependencies are healthy.
  - *(none else)*

### 6.2 `apps/workers/`

- BullMQ worker bootstrap against Redis.
- One heartbeat worker logging every 60 s to prove the stack is alive.
- Worker registry pattern — capability workers registered via a file scan under `apps/workers/src/jobs/`. Phase 0 has only the heartbeat.
- Shares the same DI container factory as `apps/api/` for provider clients.

### 6.3 `apps/ingestion/`

- Folder watcher over `EMAIL_INBOX_DIR` using `chokidar`.
- On new file:
  1. Read `.eml` bytes.
  2. Resolve contract by folder slug (`dev/inbox/<slug>/...` → `email_alias` lookup).
  3. `StorageClient.put('sha256/<hash>/raw.eml', bytes, { ifNoneMatch: '*' })`.
  4. Insert `inbound_email_event` with `provider = LocalFolderWatcher`, `worker_status = Queued`, fresh correlation ID.
  5. `QueueClient.enqueue('email.ingest.v1', { inboundEventId })`.
  6. On success, move the file to `dev/processed/<slug>/`.
  7. On failure, leave the file in place and write `<filename>.error.json`.
- The actual ingestion worker (parse, thread, dedup, etc.) is Phase 1 §5.2 work. Phase 0 ingestion stops at "event recorded, blob stored, job enqueued."

### 6.4 `apps/web/` — Next.js

- App Router skeleton.
- `/login` — visible only when `NEXT_PUBLIC_AUTH_MODE=local-dev`; dropdown of dev users; on select, issues a dev token via the API.
- `/` — minimal dashboard shell after login: "Logged in as Dana (Contract Owner)." No contract data yet.
- `ui-kit` package set up with one component (the dev-user picker) as proof that the shared design-system path works.
- No feature pages in Phase 0.

### 6.5 `packages/ui-kit/`

- `tokens.ts` — design-token file (colors, spacing, typography). Placeholder values — a proper TKC palette lands when we get design input from TKC.
- One component: `<DevUserPicker />` used by `/login`. Proves the export shape.
- `eslint-plugin-jsx-a11y` configured and running on this package.

### 6.6 Exit criteria

- `pnpm dev:api`, `pnpm dev:web`, `pnpm dev:workers`, `pnpm dev:ingestion` each start cleanly against a migrated DB.
- `GET /health` returns all-green with all provider clients reachable.
- Logging in as a dev user on `/login` successfully redirects to `/` and the API accepts the dev token.
- Dropping a bare `.eml` into `dev/inbox/<pilot>/` produces: `inbound_email_event` row, blob in Azurite, queue job visible in the BullMQ dashboard, file moved to `dev/processed/`.

---

## 7. Wave 4 — Search, Seed, Samples

**Goal:** Retrieval index live (even if empty), realistic seed data, representative sample `.eml` files.

### 7.1 Items

| # | Item | Contents |
|---|---|---|
| 4.1 | `packages/search/` index bootstrap | On API boot, `ensureNamespace()` for every active contract. Index mapping per `local-dev.md` §10. Embedding dims left as a config variable until embedding model is picked. |
| 4.2 | Seed scripts | `pnpm db:seed` creates: admin user "Brian", dev users "Dana" (Contract Owner), "Sam" (Viewer); pilot contract "Redlake Expansion" with canonical + human alias; two sample documents already attached; access grants for Dana and Sam. Idempotent — drops and recreates the dev rows but leaves schema. |
| 4.3 | `dev/inbox-samples/` | Committed `.eml` fixtures: plain correspondence, PDF attachment, encrypted-PDF attachment, OneDrive shared link, `.ics` invite, reply in an existing thread, duplicate of an earlier email. Each ~ a few KB, redacted/synthetic content. |
| 4.4 | `dev/inbox/` structure | Gitignored. A `pnpm dev:seed-inbox` script copies selected fixtures from `inbox-samples/` into `inbox/<pilot-slug>/` for interactive testing. |

### 7.2 Exit criteria

- Seed runs clean on an empty DB; dev users can log in immediately after.
- `pnpm dev:seed-inbox` puts a handful of `.eml` files into `dev/inbox/redlake-expansion/`; within 10 seconds they're moved to `dev/processed/` with rows in `inbound_email_event`.
- Each contract at seed time has its own OpenSearch namespace; a manual `SearchClient.hybridQuery()` returns zero hits (no indexed content yet) rather than an error.

---

## 8. Wave 5 — Test Harness

**Goal:** Everything written so far is testable, and Non-Negotiables that can be verified at Phase 0 have tests guarding them.

### 8.1 Items (parallel with Wave 4)

| # | Item | Contents |
|---|---|---|
| 5.1 | Vitest per package | Root `vitest.config.ts` with per-package overrides. `packages/domain`, `packages/shared`, `packages/audit`, `packages/auth` required to reach coverage targets per `.claude/rules/testing.md` §2. |
| 5.2 | Playwright base | Config, base fixtures, `@axe-core/playwright` wired. Single placeholder test that logs in as a dev user and hits `/`. |
| 5.3 | AI regression harness | `packages/ai/regression/runner.ts` runs in CI; Phase 0 harness has zero queries and passes trivially. Wiring proven so capability authors can add queries as they land. |
| 5.4 | `pnpm check` | Runs lint, typecheck, unit + integration tests, build, in that order. Exits non-zero on any failure. This is the single command that gates a PR. |
| 5.5 | Phase 0 Non-Negotiable tests | See §8.2. |

### 8.2 Non-Negotiables tested at Phase 0

| NN | Test | Location |
|---|---|---|
| #3 Originals immutable | `StorageClient.put(path, bytes, { ifNoneMatch: '*' })` on an existing path rejects or is a no-op, never overwrites. Integration test against Azurite. | `packages/storage/tests/` |
| #4 Audit append-only | `ckb_app` connection cannot UPDATE or DELETE `audit_log` — attempts fail with a permissions error. Integration test against a real migrated DB. | `packages/audit/tests/` |
| #5 Default deny | API request to a contract-scoped route 403s when the Principal has no row in `contract_access`, even with a valid dev token. | `apps/api/tests/` |
| #6 Contract-scoped retrieval | `SearchClient.hybridQuery(contractId, q)` refuses to return hits from a different contract's namespace (positive test: same namespace returns; negative test: cross-namespace rejects). | `packages/search/tests/` |
| #8 No secrets in code | Repo-wide lint rule / CI grep that fails on obvious secret patterns (private-key headers, long base64 blobs, hardcoded Anthropic-style keys). | Root `check` script. |

Non-Negotiables #1, #2, #7, #9, #10 are Phase 1+ features; they get tests when the features land.

### 8.3 Exit criteria

- `pnpm check` passes on a clean clone after `pnpm dev:up && pnpm db:migrate && pnpm db:seed`.
- Running `pnpm check` on a branch that breaks any Phase-0 Non-Negotiable test fails clearly.
- Coverage on `packages/domain`, `packages/shared`, `packages/audit`, `packages/auth` meets thresholds from `testing.md`.

---

## 9. Wave 6 — Phase 0 Acceptance

Not a build wave — a sign-off wave. Phase 0 is complete when all of the following are observable on a fresh machine following `local-dev.md` start-to-finish.

### 9.1 End-to-end smoke script

1. `git clone` → `pnpm install` → `pnpm dev:up` → all services healthy within 2 minutes.
2. `pnpm db:migrate` → green.
3. `pnpm db:seed` → green.
4. `pnpm dev:api`, `pnpm dev:web`, `pnpm dev:workers`, `pnpm dev:ingestion` start without errors.
5. Open `http://localhost:3000/login` → pick "Dana" → redirected to `/` → dashboard renders.
6. `GET http://localhost:4000/health` → all clients green.
7. Copy a plain-correspondence `.eml` from `dev/inbox-samples/` into `dev/inbox/redlake-expansion/`.
8. Within 10 seconds: file is in `dev/processed/redlake-expansion/`; `inbound_email_event` row exists with `worker_status = Succeeded`; blob exists at the content-addressed path in Azurite.
9. `pnpm check` → green.

### 9.2 Handoff artifacts

- `docs/runbooks/local-dev.md` — already written; re-read and update anywhere Phase 0 reality diverged.
- This doc (`docs/phase-0-build.md`) updated with actual file paths and any deviations.
- `docs/open-questions.md` carries every open question discovered during Phase 0.
- `CHANGELOG.md` or first tagged commit marking Phase 0 complete.

### 9.3 Human gate

Phase 0 completion is a self-certifiable gate per `.claude/rules/review-gates.md` §5, **except** for:
- The initial migrations (schema change — review-gates §2.7).
- The audit-log grants (audit-log path — review-gates §2.1).
- The `AuthProvider` implementation (authz path — review-gates §2.2).

Those three land as separately reviewable PRs with explicit human sign-off before Phase 1 starts.

---

## 10. Risks and Open Questions

### 10.1 Risks to flag early

| Risk | Mitigation |
|---|---|
| Drizzle's SQL Server support lags behind Postgres | Prototype schema against MSSQL in Wave 0; fall back to TypeORM if we hit a blocker. No other code changes. |
| OpenSearch hybrid scoring doesn't cleanly replicate in Azure AI Search | `SearchClient` contract pins scoring semantics. Azure impl must pass the same tests OpenSearch does. |
| ClamAV in Docker is slow to initialize on first boot | Document in `local-dev.md`. Healthcheck tolerates first-boot delay. |
| Dev auth convenience bleeds into non-local environments | `AuthProvider` dev methods throw outside `AUTH_MODE=local-dev`; startup fails closed on mismatch. |
| Schema churn in Phase 1 invalidates seed data | Seed is idempotent and re-generated from canonical fixtures; no "precious" seed data. |
| Anthropic API cost during dev | Zero retention confirmed at client init; capability harness runs only on demand, not on every PR push — wired into `check` via an opt-in env flag. |

### 10.2 Open questions specific to Phase 0

Add to `docs/open-questions.md` when pinned:

- **Q-P0-1.** ORM confirmation — Drizzle vs. TypeORM. Propose: Drizzle. Recommendation stands unless MSSQL compatibility blocks us.
- **Q-P0-2.** Embedding model — local OpenSearch needs a vector dimension. Two candidates: a local sentence-transformer for full offline dev, or calling an Anthropic embedding endpoint (if/when available). Defer until Wave 4; pick a placeholder dimension for the mapping.
- **Q-P0-3.** UI-kit tokens — placeholder palette vs. waiting for real TKC design tokens. Propose: placeholder so we're unblocked; flag a task to swap when tokens land.
- **Q-P0-4.** Dev-user set — Dana (Owner) and Sam (Viewer) cover the two main role paths. Add a Restricted Viewer and an Auditor for completeness, or keep minimal until the features need them? Propose minimal now; extend when needed.

### 10.3 Known Phase-1 work Phase 0 sets up but does not deliver

- The ingestion pipeline *parses* emails (Phase 1 §5.2 — parse headers, bodies, attachments, thread, dedup, pre-screen). Phase 0 stops at "blob stored, event logged, job enqueued."
- AI capabilities (summary, deadline extraction, pre-screen, clause extraction). Phase 0 delivers the regression harness frame and `LLMClient`; no capabilities.
- Any UI beyond the dev-user picker.

---

## 11. Sequenced Build List (At a Glance)

```
Wave 0 ── 0.1 monorepo ─┐
         ├─ 0.2 git      │
         ├─ 0.3 .env     │
         ├─ 0.4 compose  │
         ├─ 0.5 shared   │── parallel
         ├─ 0.6 domain   │
         └─ 0.7 scripts ─┘

Wave 1 ── 1.1 secrets ─┐
         ├─ 1.2 storage │
         ├─ 1.3 queue   │── parallel
         ├─ 1.4 search  │
         ├─ 1.5 auth    │
         ├─ 1.6 scanning│
         └─ 1.7 ai skel ┘

Wave 2 ── 2.1 db conn   → 2.2 init migration → 2.3 audit migration → 2.4 audit pkg → 2.5 FSM tables
         (sequenced)

Wave 3 ── 3.1 api ─┐
         ├─ 3.2 workers │── parallel once Wave 2 done
         ├─ 3.3 ingestion│
         ├─ 3.4 web     │
         └─ 3.5 ui-kit  ┘

Wave 4 ─┬─ 4.1 search bootstrap
        ├─ 4.2 seed                   ┐
        ├─ 4.3 sample .eml            │── parallel
        └─ 4.4 inbox seeder           ┘

Wave 5 ─┬─ 5.1 vitest
        ├─ 5.2 playwright             ┐── parallel with Wave 4
        ├─ 5.3 ai regression harness  │
        ├─ 5.4 pnpm check             │
        └─ 5.5 NN tests               ┘

Wave 6 ── acceptance smoke + handoff artifacts
```

---

## 12. What to Do After Phase 0

The first Phase 1 slice should be §5.2 ingestion deepening — take the stubbed worker past "blob stored, job enqueued" and implement parse → hash → persist → sender-trust → thread → dedup → index. That's the shortest path from a working scaffold to a user-visible feature (browsable emails on a contract dashboard).

After that, §5.1 (contract creation wizard) is the second slice — the pilot contract is seeded for now, but real creation UX unblocks onboarding.

Everything else in §5 follows once those two are in place.
