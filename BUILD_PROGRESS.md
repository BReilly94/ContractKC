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
| P | Runbooks, NN test matrix, open-questions sweep | current |

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
