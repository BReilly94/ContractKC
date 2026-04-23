# Phase 1 Build Progress

Tracks the §5.x units of work from `CLAUDE.md`. Each slice is committed when green.

## Phase 0 — Scaffolding + §5.1 item 1 + §5.11 partial

- [x] Monorepo, TS strict, ESLint, Prettier, Vitest, Playwright
- [x] Docker local stack (SQL Server, Azurite, Redis)
- [x] `packages/shared`, `packages/domain`, `packages/secrets`, `packages/auth`, `packages/audit`, `packages/ui-kit`
- [x] `apps/api` skeleton with Health/Contracts/Access/Parties/Users modules
- [x] `apps/web` skeleton with login + contract creation wizard
- [x] Migration 0001 (contract/party/user/access/email_alias/lifecycle)
- [x] Migration 0002 (append-only `audit_log`) — Non-Negotiable #4
- [x] `check-secrets` repo scan — Non-Negotiable #8

## Phase 1

### §5.1 Contract Creation & Document Ingestion
- [x] Item 1 — `Contract` entity + creation wizard (Phase 0)
- [x] Item 2 — project-designated email provisioning (backend in Phase 0)
- [ ] Item 3 — document upload (drag-drop, bulk, format matrix)
- [ ] Item 4 — document categorization
- [ ] Item 5 — OCR pipeline
- [ ] Item 6 — version control for revisable types
- [ ] Item 7 — metadata tagging (taxonomy + AI-assist)
- [ ] Item 8 — ingestion audit

### §5.2 Project-Designated Email Integration
- [ ] DNS/MX handshake (infra-owned — stubbed in app)
- [ ] Address provisioning + aliases (Phase 0 partial)
- [ ] Inbound parse webhook + local folder-watcher dev driver
- [ ] Attachment extraction + malware scan
- [ ] Thread reconstruction
- [ ] Sender trust + review queue
- [ ] Duplicate detection
- [ ] AI privileged-content pre-screen
- [ ] Auto-reply (deferred — Q-EI-3)
- [ ] Address lifecycle (deactivation on close)
- [ ] Edge: encrypted attachments
- [ ] Edge: shared-link content
- [ ] Edge: `.ics` invites

### §5.3 AI-Assisted Q&A with Mandatory Citations
- [ ] `LLMClient` + Anthropic impl + zero-retention gate
- [ ] Retrieval: hybrid vector + BM25 per-contract namespace
- [ ] Prompt template library
- [ ] Synthesis + citation enforcement + confidence signal
- [ ] Feedback loop

### §5.4 Contract Summary / Cheat Sheet
- [ ] Summary capability + `UNVERIFIED` badge + human verification gate

### §5.5 Notice & Deadline Tracker
- [ ] Deadline-extract capability
- [ ] Verification gate on external-facing alerts
- [ ] Calendar + list UI
- [ ] Obligation lifecycle state machine

### §5.6 Clause-to-Clause Cross-Referencing
- [ ] Clause-extract capability
- [ ] `clause_relationship` graph
- [ ] Viewer anchors

### §5.7 Client & Stakeholder Contact Directory
- [ ] Contacts (party extension with authority levels)

### §5.8 Global Search
- [ ] Unified keyword + metadata search, contract-scoped

### §5.9 Basic Notification Digest
- [ ] Per-event email + in-app notifications

### §5.10 Contract Dashboard & Core UI
- [ ] Dashboard (§8.1)
- [ ] Document viewer w/ clause anchoring (§8.2)
- [ ] Email thread viewer (§8.3)
- [ ] Query interface (§8.4)
- [ ] Deadline tracker view (§8.5)
- [ ] Contact directory (§8.6)
- [ ] Review queue (§8.12)
- [ ] Admin UI (§8.13)

### §5.11 Role-Based Permissions, Audit, SSO
- [x] RBAC structure (Phase 0)
- [x] Audit log append-only (Phase 0)
- [x] Dev-mode SSO shim; Entra ID stubbed
- [ ] Auditor export

### §5.12 Administration UI
- [ ] Contract creation (Phase 0 has backend)
- [ ] User/permission management
- [ ] Email address lifecycle UI
- [ ] Audit log access

### §5.13 Data Portability
- [ ] Native ZIP + structured JSON + manifest

---

## Non-Negotiable test matrix (§Section 10 Gate 2)

| # | Status |
|---|---|
| #1 Citations mandatory | pending — lands in Slice F/H |
| #2 Human verification gates | pending — summary (I), deadline (J) |
| #3 Originals immutable | pending — storage If-None-Match (Slice A) + email raw eml (Slice D) |
| #4 Append-only audit | **done** (migration 0002 + triggers + tests) |
| #5 Default deny on access | partial — ContractAccessGuard in Phase 0; round-trip test in Slice P |
| #6 Contract-scoped retrieval | pending — Slice G |
| #7 No browser storage | pending — lint rule + review in Slice M |
| #8 No secrets in code | **done** (scripts/check-secrets.ts) |
| #9 Contemporaneous lock | N/A Phase 1 (diary is Phase 2) |
| #10 Auto-BCC | N/A Phase 1 (outbound is Phase 2) |
