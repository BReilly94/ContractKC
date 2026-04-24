# Phase 1 Build Progress

## Phase 0 — Scaffolding + §5.1 item 1 + §5.11 partial

- [x] Monorepo, TS strict, ESLint, Prettier, Vitest, Playwright
- [x] Docker local stack (SQL Server, Azurite, Redis, OpenSearch, ClamAV, MailHog)
- [x] `packages/shared`, `packages/domain`, `packages/secrets`, `packages/auth`, `packages/audit`, `packages/ui-kit`
- [x] `apps/api` skeleton with Health/Contracts/Access/Parties/Users modules
- [x] `apps/web` skeleton with login + contract creation wizard
- [x] Migration 0001 (contract/party/user/access/email_alias/lifecycle)
- [x] Migration 0002 (append-only `audit_log`) — Non-Negotiable #4
- [x] `check-secrets` repo scan — Non-Negotiable #8

## Phase 1

### §5.1 Contract Creation & Document Ingestion
- [x] Item 1 — `Contract` entity + creation wizard (Phase 0)
- [x] Item 2 — project-designated email provisioning
- [x] Item 3 — document upload (Slice C, web upload in Slice M)
- [x] Item 4 — document categorization
- [x] Item 5 — OCR pipeline (pdf-parse + Tesseract, Slice E)
- [x] Item 6 — version control for revisable types (Slice C)
- [x] Item 7 — metadata tagging (12-entry taxonomy seeded, Slice C)
- [x] Item 8 — ingestion audit

### §5.2 Project-Designated Email Integration
- [x] DNS/MX handshake (infra-owned — stubbed at app layer)
- [x] Address provisioning + aliases
- [x] Inbound parse webhook + local folder-watcher dev driver (Slice B)
- [x] Attachment extraction + malware scan (Slice D, E)
- [x] Thread reconstruction (Slice D)
- [x] Sender trust + review queue (Slice C, D)
- [x] Duplicate detection (Slice D)
- [x] AI privileged-content pre-screen (capability exists, enqueued from worker — wired in Slice F, enqueued from ingest in Slice D; Slice P note: pre-screen worker that consumes the capability output is a follow-on, capability is in place)
- [ ] Auto-reply (deferred — Q-EI-3, no outbound in Phase 1)
- [x] Address lifecycle (deactivate_reason column; deactivation on close is manual in Phase 1)
- [x] Edge: encrypted attachments (detection → review queue)
- [x] Edge: shared-link content (detection → review queue; auto-pull deferred Q-EI-4)
- [x] Edge: `.ics` invites (parse → calendar_event; promotion via Deadline verify)

### §5.3 AI-Assisted Q&A with Mandatory Citations
- [x] `LLMClient` + Anthropic impl + zero-retention gate (Slice A)
- [x] Retrieval: hybrid vector + BM25 per-contract namespace (Slice G)
- [x] Prompt template library (Slice F)
- [x] Synthesis + citation enforcement + confidence signal (Slice H)
- [x] Feedback loop (Slice H + web chat in Slice M)

### §5.4 Contract Summary / Cheat Sheet
- [x] Summary capability + `UNVERIFIED` badge + human verification gate (Slice I)

### §5.5 Notice & Deadline Tracker
- [x] Deadline-extract capability (Slice F)
- [x] Verification gate on external-facing alerts (Slice J)
- [x] Calendar + list UI (Slice M — DeadlinesPanel)
- [x] Obligation lifecycle state machine (Slice J)

### §5.6 Clause-to-Clause Cross-Referencing
- [x] Clause-extract capability (Slice F, K)
- [x] `clause_relationship` graph (Slice K)
- [x] Viewer anchors (chunk indexing — Slice K; clause-level deep-link fallback noted as ASSUMPTION)

### §5.7 Client & Stakeholder Contact Directory
- [x] Contacts with authority levels (Slice L)

### §5.8 Global Search
- [x] Unified keyword + metadata search, contract-scoped (Slice G)

### §5.9 Basic Notification Digest
- [x] Per-event email + in-app notifications (Slice N)

### §5.10 Contract Dashboard & Core UI
- [x] Dashboard (§8.1) — overview tab
- [x] Document viewer (§8.2) — metadata + download; in-browser PDF viewer deferred behind Q-002
- [x] Email thread viewer (§8.3) — list + detail + attachments
- [x] Query interface (§8.4) — chat with citations + confidence
- [x] Deadline tracker view (§8.5)
- [x] Contact directory (§8.6)
- [x] Review queue (§8.12)
- [x] Admin UI (§8.13) — base admin surfaces exist (Phase 0); email-address lifecycle UI is via contract-create wizard

### §5.11 Role-Based Permissions, Audit, SSO
- [x] RBAC structure (Phase 0)
- [x] Audit log append-only (Phase 0, expanded through P1)
- [x] Dev-mode SSO shim; Entra ID stubbed
- [ ] Auditor export UI — REST endpoint to export audit via hash chain lands in Phase 2 (infrastructure exists in the append-only table)

### §5.12 Administration UI
- [x] Contract creation (Phase 0)
- [x] User/permission management (list endpoints exist; full admin UI in Phase 2)
- [x] Email address lifecycle (via contract creation + deactivation)
- [x] Audit log access (Auditor role)

### §5.13 Data Portability
- [x] Native ZIP + structured JSON + manifest + audit + SHA-256 integrity (Slice O)

---

## Slice log

| Slice | Scope | Commit message anchor |
|---|---|---|
| A | Infra packages (storage, queue, search, scanning, ocr, ai skeleton) | "Slice A: infra packages…" |
| B | Workers + ingestion apps | "Slice B: apps/workers + apps/ingestion…" |
| C | Migration 0003 + Document/Email/ReviewQueue/SenderTrust/Tag APIs | "Slice C: Migration 0003…" |
| D | Ingestion worker pipeline | "Slice D: email-ingest worker…" |
| E | Malware scan + OCR | "Slice E: malware-scan + OCR…" |
| F | AI capabilities | "Slice F: AI capabilities…" |
| G | Search + embed-index | "Slice G: retrieval chunker…" |
| H | AI Q&A endpoint + citation enforcement | "Slice H: §5.3 Q&A endpoint…" |
| I | Contract Summary + verification gate | "Slice I: contract summary generation…" |
| J | Deadline Tracker | "Slice J: Notice & Deadline Tracker…" |
| K | Clauses + cross-ref graph | "Slice K: clause extraction…" |
| L | Contacts | "Slice L: Contact Directory…" |
| M | Web UI — tabs, chat, detail pages | "Slice M: core UI…" |
| N | Notifications | "Slice N: notifications…" |
| O | Data portability export | "Slice O: data portability export…" |
| P | Runbooks, NN test matrix, open-questions sweep | "Slice P: Phase 1 acceptance sweep…" |
| Q | Phase 2 lifecycle state machines (Claim/Variation/RFI/Submittal) | "Slice Q: lifecycle state machines…" |

---

## Phase 2

### Phase 2 slice index

| Slice | Scope | Migration | Status |
|---|---|---|---|
| Q | Lifecycle state machines (Claim/Variation/RFI/Submittal FSMs) | 0010 | ✅ |
| R | Redaction controls + individual access revocation (§9.4, §9.6) | 0011 | ✅ |
| S | Commercial registers (Variation full CRUD, Risk, Interpretation) | 0012 | ✅ |
| T | Operational registers (Submittals, Payment Applications, Insurance/Bonds/Permits) | 0013 | ✅ |
| U | Daily Site Diary + offline behaviour + NN #9 contemporaneous lock | 0014 | ✅ |
| V | Safety / QA-QC / Inspection / HoldPoint flags (§3.14b) | 0015 | ✅ |
| W | Outbound correspondence + auto-BCC (NN #10) — enforced subject conventions, template library | 0020 | ✅ |
| X | "Send to Contract" Outlook add-in — new `apps/outlook-addin/` + `/api/contracts/:id/emails/forward` | — | ✅ (agent) |
| Y | Bid-to-contract handoff | 0016 | ✅ |
| Z | ERP read-only linkage | 0017 | ✅ |
| CC | Timeline view | — | ✅ |
| AA | Drawing comparison tool — `drawing-diff` capability + worker + record_flag raise | 0022 | ✅ |
| BB | Meeting minutes ingestion — `minutes-extract` capability + worker → Unverified deadlines (NN #2) | 0022 | ✅ |
| GG | Proactive AI Flagging — two-tier Sonnet→Opus routing, citation verification, per-contract budget alert (never silent throttle) | 0023 | ✅ |
| HH | Project closeout checklist (🔒 exception waiver gate) | 0016 | ✅ |
| II | Full configurable notification digest | 0017 | ✅ |
| JJ | Auditor export UI (Phase 1 carry-forward) | 0018 | ✅ |
| DD | Evidence Packaging (chain-of-custody + redaction log + lock-on-submit) | 0021 | ✅ |
| EE | Claim register + drafting workspace (Opus-routed capability, assertion-level citations) | 0022 | ✅ |
| FF | Claim Readiness Score (🔒 submission gate, override logging) | — | ✅ |
| — | `audit_log` whitelist consolidation (source: `packages/domain/src/audit.ts`) | 0024 | ✅ |

**Validation (2026-04-24):**
- `packages/domain`: `pnpm build` clean, 117 tests passing across 18 files.
- `apps/api`: `pnpm typecheck` clean.
- `apps/workers`: `pnpm typecheck` clean.
- `apps/web`: `pnpm typecheck` clean.
- `apps/outlook-addin`: `pnpm typecheck` clean (ambient shim bumped to `any` for React types — placeholder until `pnpm install` brings real `@types/react`).
- `packages/ai`: `pnpm typecheck` clean.
- `packages/erp`: `pnpm typecheck` clean.
- Full repo: 212 tests passing, 11 integration tests skipped (require live DB).

### Slice Q — Lifecycle state machines (§3.34, §6.22)

Phase 2 foundation. Establishes the typed FSMs + backing tables for the
four Phase 2 register entities. Contract lifecycle (Draft → Onboarding →
Active → IssueInProgress → Closeout → Archived) already shipped in
Phase 1; Deadline/Obligation lifecycle shipped in Slice J.

- [x] Migration `0010_lifecycle_registers.sql` — `claim`, `variation`,
  `rfi`, `submittal` tables with `lifecycle_state` + CHECK constraints.
- [x] Per-entity `<entity>_lifecycle_transition` seed tables (defense in
  depth for the service-layer guards added in Slices S/T).
- [x] `audit_log` `entity_type` + `action` constraints extended with
  `Claim`/`Variation`/`Rfi`/`Submittal` and per-entity
  `*.create`/`*.update`/`*.lifecycle.transition` actions.
- [x] Domain types + transition arrays + `isLegal*Transition` helpers in
  `packages/domain` (`claim.ts`, `variation.ts`, `rfi.ts`, `submittal.ts`).
- [x] Unit tests: 33 tests covering happy paths, permitted branches, and
  illegal-transition rejection on every FSM. Includes tests that terminal
  states are unreachable-from (no resurrection of closed/resolved records).

Full register CRUD, link tables (Claim↔Variation, Claim↔Evidence, etc.),
and per-entity services land in Slices S (commercial registers) and T
(operational registers). Services emit the `<entity>.lifecycle.transition`
audit actions defined here.

### Slice HH — Project Closeout Checklist (§3.23, §6.21, §8.11)

Per-contract checklist instantiated from per-kind templates (EPC /
Construction / Supply / Services), with per-item sign-off and waivers.
Archive gate is enforced inside `ContractsService.transitionLifecycle`
— Closeout → Archived blocks while any item is Pending, and blocks when
no checklist exists at all.

- [x] Migration `0016_closeout_checklist.sql` — `closeout_template`,
  `closeout_checklist`, `closeout_checklist_item` tables with CHECK
  constraints enforcing `Pending` → `Signed|Waived` with matching stamps.
  Seeds the four starter templates.
- [x] Domain: `packages/domain/src/closeout.ts` — `CloseoutTemplate*`,
  `CloseoutChecklist*`, `CloseoutItemStatus`, `evaluateCloseoutArchiveGate`.
- [x] API: `apps/api/src/closeout/` — `CloseoutService` with
  `createFromTemplate`, `signItem`, `waiveItem`, `generateCertificate`,
  `evaluateArchiveGate`; controllers at `/api/closeout/templates` and
  `/api/contracts/:id/closeout`.
- [x] 🔒 HUMAN GATE on waive: requires Owner/Administrator contract role
  AND a minimum-length reason. Audit row `closeout.item.waive` captures
  the reason; signing audits `closeout.item.sign`.
- [x] Archive gate wired into `ContractsService.transitionLifecycle`:
  blocks Closeout → Archived unless every item is `Signed` or `Waived`.
- [x] `audit_log` constraints extended with `CloseoutTemplate`,
  `CloseoutChecklist`, `CloseoutChecklistItem` entities and
  `closeout_template.create`, `closeout.checklist.create`,
  `closeout.item.sign`, `closeout.item.waive`,
  `closeout.certificate.generate` actions.
- [x] Unit tests: `packages/domain/src/closeout.test.ts` covers the
  archive-gate truth table.

**ASSUMPTION (§6.21 certificate):** actual PDF rendering for the closeout
certificate is deferred. `generateCertificate` records the blob path and
audit stamp so the archive workflow operates end-to-end; the renderer
lands with the §6.11 Evidence Packaging portfolio tool. `TODO` marker in
`closeout.service.ts` flags the hand-off.

### Slice II — Configurable Notification Digest (§3.9 Phase 2, §6.23)

Per-user digest preferences with a background worker that aggregates
upcoming deadlines, pending review-queue items, new flags, claim
lifecycle changes, and contract events.

- [x] Migration `0017_digest_preferences.sql` — `digest_preference`
  with partial-unique indexes (one user-wide row per user; one per
  (user, contract)). `notification.kind` whitelist extended with
  `digest_summary`.
- [x] Domain: `packages/domain/src/digest-preference.ts` —
  `DigestFrequency`, `DigestChannel`, `DigestCategory`,
  `resolveEffectivePreference`, `isDigestDue`.
- [x] API: `apps/api/src/digest/` — `DigestService.upsert` (user
  self-service only; KC/System admins can read via listForUser),
  controller at `/api/users/:id/digest-preferences`.
- [x] Worker: `apps/workers/src/workers/digest.ts` on the `notify.digest.v1`
  queue — scans all accessible users, resolves preference, collects
  per-category summary since `last_dispatched_at`, writes a
  `digest_summary` notification row, sends SMTP when the Email channel
  is enabled, logs `digest.send`, and stamps `last_dispatched_at`.
- [x] `audit_log` constraints extended with `DigestPreference` entity
  and `digest_preference.update`, `digest.send` actions.
- [x] Unit tests: `packages/domain/src/digest-preference.test.ts` covers
  scope resolution and due-time arithmetic.

**Scheduling:** the worker consumes a `{ scope: 'all' }` tick payload.
In local dev, enqueue via the existing queue client; in Azure, a Logic
App or Function timer pushes the tick daily + weekly.

### Slice JJ — Auditor Export UI (§5.11 carry-forward)

REST endpoint + minimal admin UI for the `Auditor` global role to stream
the append-only audit log as CSV with hash chain intact. Closes the
BUILD_PROGRESS.md §5.11 gap.

- [x] Migration `0018_audit_export.sql` — `audit_export_job` row per
  export request. `audit_log` CHECK constraint extended with
  `AuditExport` entity and `audit.export.request` /
  `audit.export.complete` actions.
- [x] Domain: `packages/domain/src/audit-export.ts` —
  `AuditExportJob`, `AuditExportFilters`.
- [x] API: `apps/api/src/audit-export/` — `GET /api/admin/audit/export`
  streams CSV with columns: `sequence_number, id, actor_user_id, action,
  entity_type, entity_id, correlation_id, created_at, prev_hash,
  row_hash, before_json, after_json`. Gated to `Auditor` and
  `SystemAdministrator` global roles. Emits `audit.export.request`
  ahead of stream and `audit.export.complete` on success (both in the
  same append-only chain, so the act of exporting is itself audited).
- [x] Web: `apps/web/app/admin/audit/page.tsx` — filter form (from/to,
  entityType, userId) + Download button that fetches with the bearer
  token and triggers a browser download. Styled with `@ckb/ui-kit`
  primitives (TextField, Button) and existing `.ckb-card` conventions.

### Slice AA — Drawing Comparison Tool (§3.20, §6.17)

Diffs a newly-ingested Drawing revision against its prior version. OCR text
layers feed the Sonnet `drawing-diff` capability, which classifies scope
impact (`None | Minor | Suspected | Major`) and emits structured change
regions. A material diff raises a record_flag (`Observation`) with
severity derived from scope impact, and enqueues a proactive-flag trigger
for Slice GG.

- [x] Migration `0022_drawing_diff_and_meeting_minutes.sql` — `drawing_diff`
  table with `scope_impact` CHECK, unique pair constraint, FK to
  `document_version` + `record_flag`. Also extends `document.category`
  CHECK for MeetingMinutes (Slice BB) and extends the `audit_log`
  whitelists.
- [x] Domain: `packages/domain/src/drawing-diff.ts` — `DrawingDiff*` types
  + `severityForScopeImpact`.
- [x] AI capability: `packages/ai/src/capabilities/drawing-diff/` —
  prompt v1.0.0, Zod schemas, deterministic mock, regression fixtures,
  Sonnet-routed, closed citation grammar (`prior:<doc>` / `new:<doc>`).
- [x] Worker: `apps/workers/src/workers/drawing-diff.ts` — fires off the
  OCR completion hook for Drawing documents; idempotent on
  (document, prior, new) triple.
- [x] Audit actions: `drawing_diff.compute`, `drawing_diff.flag_raised`.
  Entity: `DrawingDiff`.

### Slice BB — Meeting Minutes Ingestion (§3.22, §6.19)

Extracts structured action items from MeetingMinutes-category documents.
Action items land as `Unverified` deadlines (`sourceType='MeetingMinutes'`)
flowing through the existing Deadline Tracker verification gate
(Non-Negotiable #2).

- [x] Migration `0022_drawing_diff_and_meeting_minutes.sql` — adds
  `MeetingMinutes` to `document.category` CHECK; creates
  `meeting_minutes_extraction` table (1:1 per document).
- [x] Domain: `packages/domain/src/meeting-minutes.ts` — extraction
  row type + `ExtractedActionItem`. Reused `DeadlineSourceType` already
  contained `MeetingMinutes`.
- [x] AI capability: `packages/ai/src/capabilities/minutes-extract/` —
  prompt v1.0.0, Sonnet-routed, Zod schemas, mock with party-action-date
  grammar, closed citation (`minutes:<documentName>`).
- [x] Worker: `apps/workers/src/workers/minutes-extract.ts` — triggered
  from OCR completion; writes extraction + per-item deadline rows; drops
  items whose citation does not match the closed grammar.
- [x] Audit actions: `minutes.extract`, `minutes.action_item.create`.
  Entity: `MeetingMinutesExtraction`.

### Slice GG — Proactive AI Flagging (§3.36, §6.15, §7.10)

Unprompted flags raised on ingestion events (emails, documents, diary
entries, drawing revisions). Two-tier routing per §7.10:

1. **First-pass** — Sonnet classifier, tight context, decides whether
   the event is worth deep review.
2. **Deep-review** — Opus + full retrieval + mandatory citations. Every
   raised flag's reasoning runs through the citation verifier
   (Non-Negotiable #1); failures are logged as AI quality incidents and
   never persisted or surfaced.

Per-contract daily budget (`contract.daily_flag_budget`, default 50):
when exceeded, the pipeline records a `flag_budget_alert` row and emits
a `flag_budget_exceeded` notification to the KnowledgeCentreAdministrator.
**Never silently throttles** (§7.10).

- [x] Migration `0023_proactive_flag.sql` — `proactive_flag` table with
  status CHECK + citation JSON columns; `flag_budget_alert` table
  (unique per contract-day); `contract.daily_flag_budget` column; extends
  `notification.kind` whitelist; extends `audit_log` whitelists.
- [x] Domain: `packages/domain/src/proactive-flag.ts` — `ProactiveFlag*`
  types + FSM transitions + tests (6 tests).
- [x] AI capability: `packages/ai/src/capabilities/proactive-flag/` —
  `first-pass.ts` (Sonnet), `deep-review.ts` (Opus), Zod schemas,
  deterministic mocks for both passes, regression fixtures.
- [x] Routing update in `packages/ai/src/routing.ts` — new capabilities
  `proactive-flag-first-pass` (Sonnet) and `proactive-flag-deep-review`
  (Opus). 🔒 HUMAN GATE — routing and prompt changes require PR review.
- [x] Worker: `apps/workers/src/workers/proactive-flagger.ts` — enforces
  budget check before Opus call, drops un-verified flags, emits audit +
  notification.
- [x] API: `apps/api/src/proactive-flags/proactive-flags.module.ts` —
  list + action endpoints (`Actioned` / `Dismissed` / `Escalated`).
- [x] Audit actions: `proactive_flag.raise`, `proactive_flag.action`,
  `proactive_flag.dismiss`, `proactive_flag.escalate`, `flag_budget.alert`.
  Entities: `ProactiveFlag`, `FlagBudget`.

---

## Non-Negotiable coverage (§Section 10 Gate 2)

| # | Status | Primary test / enforcement |
|---|---|---|
| #1 Citations mandatory | **enforced** | `packages/ai/src/citations.test.ts` (verifier unit tests); `runQaSynth` blocks on failure and records via `query_log.blocked=1`; mock + real regression harness green. |
| #2 Human verification gates | **enforced** | `contract_summary.verification_state`, `deadline.verification_state`, `clause.verification_state` + DB check constraints; `SummaryService.verify` gated on Owner role; `DeadlinesService.transition` refuses `Active` when Unverified. |
| #3 Originals immutable | **enforced** | `StorageClient.put({ ifNoneMatch: '*' })` contract + Azurite behaviour; content-addressed path `sha256/<hash>/...`; DB `ck_email_raw_eml_path` / `ck_document_blob_path` CHECK. Export manifest records SHA-256 of every file. |
| #4 Append-only audit | **enforced** | Migration 0002 INSTEAD OF UPDATE/DELETE triggers on `audit_log`; hash chain per row tested in `packages/audit/src/hash-chain.test.ts` and `writer.integration.test.ts`. |
| #5 Default deny on access | **enforced** | `ContractAccessGuard` on every contract-scoped route; `ContractAccessService` for routes not scoped by `:id`; `contract_access_revocation` checked ahead of grants. |
| #6 Contract-scoped retrieval | **enforced** | `SearchClient` per-contract index namespace; indexing refuses foreign chunks; all SQL paths join `contract_id`. |
| #7 No browser storage | **respected** | Web client uses only React state + Zustand in memory. No localStorage/sessionStorage/IndexedDB writes of contract content in this codebase. Offline diary exception is Phase 2. |
| #8 No secrets in code | **enforced** | `scripts/check-secrets.ts` scans every file in `git ls-files` against Anthropic/AWS/PEM/JWT/Azure storage patterns; fails CI on hit. |
| #9 Contemporaneous lock | N/A Phase 1 | Diary is Phase 2 feature. |
| #10 Auto-BCC outbound | N/A Phase 1 | Outbound mail is Phase 2 feature. |

---

### Slice Y — Bid-to-Contract Handoff (§3.1 item 2, §6.1, §7.7)

Receiving endpoint for the Bid Intake & Generation application. Idempotent on
`(bid_id, contract_id)` — replays are recorded in audit but do not double-
create downstream rows. Risks land as `source='BidHandoff'` (unverified by
convention per NN #2). Contacts populate the Contact Directory. Correspondence
items ingest through the same `document` table as any other upload, so the
ingestion audit trail stays single-sourced.

- [x] Migration `0016_bid_handoff.sql` — `bid_handoff` table with JSON raw
  payload + SHA-256 hash + idempotency UNIQUE `(bid_id, contract_id)`.
- [x] `packages/domain/src/bid-handoff.ts` — `BidHandoffPayload` schema and
  per-section item types (winning proposal, estimates, assumptions,
  qualifications, risks, correspondence, contacts).
- [x] `BidHandoffService.receive(contractId, input, correlationId)` —
  validates, persists raw payload, creates risks + contacts + documents in
  one SERIALIZABLE transaction, logs `bid_handoff.receive`.
- [x] Dry-run mode returns preview counts without writing.
- [x] `POST /api/bid-handoffs` — two auth modes: KC-admin session bearer
  OR `x-bid-integration-token` header (secret from
  `BID_INTEGRATION_TOKEN`).
- [x] Audit actions `bid_handoff.receive` / `bid_handoff.replay`; entity
  `BidHandoff`.
- [x] Scan + OCR queues are fanned out post-transaction for each imported
  document.

### Slice Z — ERP Read-Only Linkage (§6.14 Phase 2, §7.8)

Phase 2 scope = approved contract value + approved variations, keyed on the
Variation register + Claim Readiness Score quantum component. ERP stays
system-of-record. Manual-entry is the default so the stack operates before
a real ERP wiring lands.

- [x] Migration `0017_erp_snapshot.sql` — `erp_snapshot` table + XOR
  CHECK (`user_id` or `system_label`, not both).
- [x] `packages/erp/` — new package with `ErpClient` interface,
  `ManualFallbackClient`, and factory. Registered in
  `@ckb/runtime` clients alongside the other providers.
- [x] `ErpService.getLatestSnapshot(contractId)` +
  `refresh(contractId, principal)` (user-initiated) +
  `recordManualEntry(contractId, principal, input)` (manual fallback).
- [x] `GET  /api/contracts/:id/erp-snapshot` — any REGISTER_READ role.
- [x] `POST /api/contracts/:id/erp-snapshot/refresh` — Owner +
  Administrator (Commercial Lead) only.
- [x] `POST /api/contracts/:id/erp-snapshot/manual` — same write roles.
- [x] `apps/workers/src/workers/erp-refresh.ts` — daily-refresh worker
  consuming `erp.refresh.v1`, writes `last_refreshed_by_system='scheduler'`.
- [x] Audit actions `erp.refresh` / `erp.manual_entry`; entity `ErpSnapshot`.

### Slice CC — Timeline View (§3.10, §6.2, §8.7)

Read-only, no new migration. Single chronological feed spanning every Phase 2
entity, unioned in SQL with `TOP (limit+1)` for cursor-based pagination.
Contract lifecycle transitions are recovered from `audit_log` rather than
requiring a dedicated event store.

- [x] `TimelineService.listForContract(contractId, {from, to, kinds,
  limit, cursor})` returning rows of `{ id, contractId, occurredAt, kind,
  entityType, entityId, title, subtitle, severity? }`.
- [x] `GET /api/contracts/:id/timeline?from=&to=&kinds=&limit=&cursor=` —
  REGISTER_READ_ROLES + contract-access guard.
- [x] Unions: contract.lifecycle (audit_log), variation, claim, rfi,
  submittal, email, document (uploads), diary, record_flag,
  payment_application, deadline.triggered, interpretation, notification.
- [x] Cursor is base64url(`${iso_occurredAt}|${id}`); ordering is
  `(occurred_at DESC, id DESC)` for deterministic ties.
- [x] No audit action for reads (matches other read-only endpoints).

---

## Open assumptions (recorded in code with `// ASSUMPTION:` and in docs/open-questions.md)

- Hash-based embedding provider (non-semantic) pending Azure OpenAI embedding wiring.
- PDF.js / Mammoth inline viewer deferred (Q-002 Bluebeam) — documents download via native MIME.
- Multi-page scanned-PDF rasterization in Tesseract path returns empty pages until the rasterizer lands.
- Clause char_offset alignment against document text pending real fixtures (Q-002 adjacent).
- SendGrid vs Azure-native inbound — webhook signs with HMAC until Q-005 resolves.
- Malware scanner Azure impl pending Q-EI-2 (ClamAV used locally).
- Shared-link auto-pull (OneDrive/SharePoint via Graph) deferred Q-EI-4; all detections currently route to review queue.
- Encrypted attachments paired-documents approach (Q-EI-1) pending Legal confirmation.
- Auto-reply deferred (Q-EI-3) — no outbound mail in Phase 1.
- Export signing (Q-006) — manifest includes SHA-256 but is not cryptographically signed.
- Risk register has no `verification_state` column yet (Q-RISK-1). Bid-handoff
  risks land with `source='BidHandoff'`; the unverified-until-reviewed
  convention is carried by the review queue UI, not a DB column. Column add
  is queued for when Risk register gets its verification flow.
- Real ERP client (SAP / Dynamics / Viewpoint / JDE) is not wired —
  `ErpSourceSystem` values beyond `Manual` fall back to `ManualFallbackClient`
  until IT Security + vendor selection complete (Q-ERP-1).
- ERP refresh worker is enqueue-only — no cron scheduler. External cron or
  a subsequent "scheduler" worker must enqueue `erp.refresh.v1` per contract
  on the desired cadence.
