# Contract Knowledge Base — Build SOW for Claude Code

**Project:** Contract Knowledge Base (CKB) — application within the Technica Knowledge Centre (TKC).
**Status:** Phase 1 (MVP) **shipped**. Phase 2 (Adoption & Lifecycle Depth) **substantially shipped** — see status snapshot in §5. Phase 3 not started.
**Last updated:** 2026-04-24.
**Source of truth for current progress:** `BUILD_PROGRESS.md` and the slice commit log.

---

## 0. How to Use This Document

Read at the start of every session, in this order:

1. This file (top to bottom).
2. `.claude/rules/*.md` — modular engineering rules (testing, security, ai-layer, ui, review-gates).
3. `BUILD_PROGRESS.md` — what's done, in progress, and pending per §5.x / §6.x.
4. `docs/architecture/*.md` — data model + ingestion plan.
5. `docs/open-questions.md` — unresolved decisions with named owners.
6. Only then open code.

**Working rules:**
- Every unit of work must pass the **Acceptance Gates** in §6 before being marked done.
- Sections marked `🔒 HUMAN GATE` are never self-certified.
- Ambiguities go in `docs/open-questions.md`, not silent inventions. Mark coded assumptions with `// ASSUMPTION:`.
- Non-Negotiables in §2 are absolute. Surface conflicts rather than comply silently.

---

## 1. Project Context

CKB consolidates every document, drawing, spec, negotiation record, and email tied to an individual contract into a single queryable repository, with an AI layer providing retrieval, analysis, drafting, and proactive flagging over that consolidated record.

Each contract gets a project-designated email address on `contracts.technicamining.com` that acts as the ingestion channel. CKB shares identity, audit, and notification services with other TKC applications and exchanges data with the Bid Intake & Generation application.

**Success criteria:**
- Any authorised user can produce a fully-cited, evidence-backed answer to a scope or claim question in minutes.
- No contractual notice period is missed on a contract managed in the platform.
- Claims are supported by platform-generated evidence bundles with chain-of-custody preserved.
- PMs, commercial staff, and site supervisors use the platform daily as an active commercial-defence tool.

---

## 2. Non-Negotiables

These rules apply to every line of code, every prompt, every UI surface, every test. Violations are build failures.

1. **Every AI response carries inline citations.** No citation → blocked at the API boundary. Post-generation citation verification is mandatory.
2. **Human verification gates are enforced in code.** AI-extracted summaries, deadlines, clauses cannot become "trusted" until a human approves them. Unverified items render with a visible `UNVERIFIED` badge and cannot feed downstream alerts.
3. **The original `.eml` and uploaded files are never altered.** Stored immutably with SHA-256 hashes; derived artefacts are separate blobs.
4. **Audit log is append-only.** No `UPDATE` or `DELETE` on audit records, ever. Enforced at the database layer (revoked grants and `INSTEAD OF` triggers, not just app discipline).
5. **Default deny on contract access.** Role does not imply access — access is per-contract and per-user.
6. **Retrieval is contract-scoped by default.** Cross-contract retrieval is Phase 3+. Isolation enforced at the vector-store namespace level.
7. **No browser-side storage of contract content.** No `localStorage` / `sessionStorage` / `IndexedDB`. In-memory only. (Exception: offline diary drafts in §6.6.)
8. **No secrets in code or `CLAUDE.md`.** All credentials via Azure Key Vault. `scripts/check-secrets.ts` enforces in CI.
9. **Contemporaneous records are locked.** Diary entries are not editable after end-of-next-business-day. Lock enforced server-side.
10. **Every outbound email is BCC'd to the project address automatically.** System invariant, not a user setting.

Mapping of NN to enforcement points lives in `BUILD_PROGRESS.md`.

---

## 3. Tech Stack

**Cloud:** Azure (Canada Central primary, Canada East backup).

**Backend:** TypeScript / Node 20 LTS, NestJS (API), Azure SQL (relational store; SQL Server 2022 locally), Azure Blob Storage with SSE-256 + content-addressed paths, Azure AI Search (hybrid vector + BM25, one index per contract; OpenSearch locally), Azure Service Bus + BullMQ workers (Redis locally), SendGrid Inbound Parse (Phase 1 — under review for Azure-native at Phase 3), Azure Communication Services Email outbound (Phase 2).

**Frontend:** Next.js (App Router), React, TypeScript, Tailwind, React Query for server state, Zustand for UI state. PDF.js + Mammoth for in-app viewing. Shared TKC design tokens in `packages/ui-kit/`.

**AI:** Claude (Anthropic API) only. Sonnet for routine retrieval / extraction / classification, Opus for drafting / synthesis / devil's advocate. Zero-data-retention enforced at `LLMClient` construction; SDK calls allowed only inside `packages/ai/`.

**Identity:** Azure AD / Entra ID via OIDC. AD FS bridge documented in `docs/runbooks/`. Local-dev shim picks fixed users.

**Conventions:** UTC timestamps; integer cents + ISO-4217 for money; SHA-256 for hashes; ULIDs for IDs; `x-correlation-id` propagated end-to-end; structured logs via Pino.

---

## 4. Repository Layout

```
/
├── CLAUDE.md                 # This file
├── BUILD_PROGRESS.md         # Authoritative slice/feature status
├── .claude/rules/            # Engineering rules (testing/security/ai/ui/review-gates)
├── .devcontainer/            # Codespaces config (Docker-in-Docker, port forwards)
├── docs/
│   ├── architecture/         # data-model, email-ingestion, ADRs
│   ├── runbooks/             # Operational procedures
│   ├── phase-0-build.md      # Scaffolding plan (historical)
│   └── open-questions.md
├── apps/
│   ├── api/                  # NestJS API (~25 modules; see app.module.ts)
│   ├── web/                  # Next.js web app
│   ├── workers/              # BullMQ background jobs (one file per stage)
│   └── ingestion/            # Inbound webhook + dev folder-watcher
├── packages/
│   ├── ai/                   # LLMClient + capabilities + regression harness
│   ├── audit/                # Append-only writer with hash chain
│   ├── auth/                 # Entra ID + dev shim
│   ├── domain/               # Pure types (Contract, Email, Document, Clause, Deadline, Claim, …)
│   ├── ocr/                  # pdf-parse + Tesseract; Azure Document Intelligence stubbed
│   ├── ocr-bluebeam/         # (if present) Bluebeam annotation handling
│   ├── queue/                # BullMQ + Service Bus stub
│   ├── runtime/              # Shared config + provider-client factory
│   ├── scanning/             # ClamAV INSTREAM
│   ├── search/               # OpenSearch hybrid; embedding provider abstraction
│   ├── secrets/              # Env + Azure Key Vault stub
│   ├── shared/               # Logger, correlation, hash, ids, money, errors
│   ├── storage/              # Azure Blob (Azurite local) with ifNoneMatch=*
│   └── ui-kit/               # TKC design tokens + components
├── infra/local/              # docker-compose for local stack
├── scripts/                  # check-secrets, dev orchestration
└── tests/e2e/                # Playwright (AI regression harness lives at packages/ai/regression/)
```

---

## 5. Status Snapshot

`BUILD_PROGRESS.md` is the canonical record. This summary is for fast orientation.

### Phase 1 — shipped

| § | Feature | State |
|---|---|---|
| 5.1 | Contract creation, document upload, OCR, versioning, taxonomy, ingestion audit | ✅ |
| 5.2 | Project email aliases, inbound parse + dev folder-watcher, attachments + scan, threads, dedup, sender trust, review queue, AI privileged pre-screen, encrypted-attachment + shared-link + .ics edge cases | ✅ |
| 5.3 | LLMClient + hybrid retrieval + Q&A with hard-enforced citation verification | ✅ |
| 5.4 | Contract summary + UNVERIFIED badge + Owner verification gate | ✅ |
| 5.5 | Deadline tracker + verification gate + lifecycle FSM | ✅ |
| 5.6 | Clause extraction + cross-reference graph + viewer anchors | ✅ |
| 5.7 | Contact directory with authority levels | ✅ |
| 5.8 | Contract-scoped global search (keyword + chunks) | ✅ |
| 5.9 | Per-event email + in-app notifications | ✅ |
| 5.10 | Core UI surfaces (dashboard, viewer, threads, query, deadlines, contacts, review queue, admin) | ✅ |
| 5.11 | RBAC + append-only audit + Entra/dev SSO + Auditor export (carried into Phase 2 Slice JJ) | ✅ |
| 5.12 | Administration UI (contracts, users, aliases, audit access) | ✅ |
| 5.13 | Native ZIP + JSON + manifest export with redaction policy | ✅ |

### Phase 2 — substantially shipped

| § | Feature | State |
|---|---|---|
| 6.1 | Bid → contract handoff (event + replay) | ✅ |
| 6.2 | Contract change-log + timeline | ✅ |
| 6.3 | Variation register with FSM | ✅ |
| 6.4 | Risk register | ✅ |
| 6.5 | Interpretation / decision log | ✅ |
| 6.6 | Daily site diary with contemporaneous lock + offline drafts | ✅ |
| 6.7 | Safety / QA-QC / inspection record flags + hold points | ✅ |
| 6.8 | Payment application tracking | ✅ |
| 6.9 | Insurance / bond / permit policies | ✅ |
| 6.10 | Claim drafting workspace | ✅ |
| 6.11 | Evidence packaging (ZIP + PDF portfolio + chain-of-custody manifest + redaction log) | ✅ |
| 6.12 | Claim register + lifecycle | ✅ |
| 6.13 | Claim Readiness Score + override audit | ✅ |
| 6.14 | ERP read-only linkage (approved value + variations) | ✅ |
| 6.15 | Proactive AI flagging (Sonnet first-pass, Opus deep review, per-contract budgets) | ✅ |
| 6.16 | Outbound correspondence with subject conventions + auto-BCC (NN #10) | ✅ |
| 6.17 | Drawing comparison tool | ✅ |
| 6.18 | "Send to Contract" Outlook add-in | ⏳ deferred (separate distribution target) |
| 6.19 | Meeting minutes ingestion + action item extraction | ✅ |
| 6.20 | Submittals & transmittal register | ✅ |
| 6.21 | Closeout checklists + certificate generation | ✅ |
| 6.22 | Lifecycle FSMs for Contract / Claim / Variation / RFI / Submittal / Obligation | ✅ |
| 6.23 | Configurable notification digest | ✅ |
| 6.24 | Ethical walls + individual access revocation | ✅ (revocation in Phase 0; ethical-wall UX wraps it) |
| 6.25 | Redaction controls + redaction log | ✅ |

Outstanding Phase 2 work: §6.18 Outlook add-in (browser/Office add-in stack — separate build pipeline). Track in `BUILD_PROGRESS.md`.

---

## 6. Acceptance Gates

Every unit of work passes through these gates in order.

**Gate 1 — Self-verification (Claude Code):** unit + integration tests added, type-check + lint green, no orphan TODO/FIXME, AI capabilities pass regression at or above baseline, no `.claude/rules/` change without rationale.

**Gate 2 — Non-Negotiable check:** PR description names the relevant NNs from §2 and how the change preserves them.

**Gate 3 — 🔒 Human review** required for any PR touching:
- Audit-log code path or hash chain
- Authorisation / per-contract access / revocation logic
- Prompt templates (`packages/ai/capabilities/*/prompt.ts`)
- Model routing (`packages/ai/routing.ts`)
- Code implementing a Non-Negotiable
- `.claude/rules/*.md`
- Database migrations
- `infra/`
- Encryption / secrets / key handling
- Data portability export format

**Gate 4 — 🔒 Operational readiness** before any production deploy: runbook present in `docs/runbooks/`, observability complete, performance load test against §7 targets, dependency audit clean, security review, rollback plan documented.

---

## 7. Non-Functional Targets (CI-gated)

| Target | Value |
|---|---|
| Encryption | TLS 1.2+ in transit; AES-256 at rest |
| Upload + indexing | < 2 min for ≤ 100 MB |
| AI query response | < 10 s typical, < 30 s complex multi-doc synthesis |
| Search | < 2 s global keyword |
| Email ingestion latency | < 2 min from arrival to searchable |
| Uptime | 99.5% business hours, 99% overall |
| RPO / RTO | 1 h / 4 h |
| Year-1 scale | 200 contracts, 500 users, 5M docs/emails |
| Accessibility | WCAG 2.1 AA |
| Data residency | Azure Canada Central (primary), Canada East (backup) |

---

## 8. AI Layer — Pinned Decisions

Full rules in `.claude/rules/ai-layer.md`. Highlights:

- All LLM calls go through `LLMClient` in `packages/ai/client/`. No direct Anthropic SDK use elsewhere.
- Capabilities live under `packages/ai/capabilities/<name>/` with `prompt.ts` + `schema.ts` + `evaluate.ts` + `index.ts`. Not "done" without a regression entry.
- Routing (current — see `packages/ai/src/routing.ts`):
  - **Sonnet:** email-prescreen, deadline-extract, clause-extract, qa-synth, drawing-diff, minutes-extract, proactive-flag-first-pass, flag-generate.
  - **Opus:** contract-summary, proactive-flag-deep-review, draft, devils-advocate (Phase 3).
- Citation grammar `[cite:<chunkId>]` enforced at prompt time + post-generation by `verifyCitations`. Failures block the response (NN #1).
- Confidence levels: `high | medium | low | insufficient_context` on every Q&A response.
- Zero-data-retention: enforced at `LLMClient` construction; fails closed.
- Cost control: proactive-flag first pass uses Sonnet + small windows; only candidates escalate to Opus. Per-contract daily budgets with alerts.
- Prompt template version bump on every material change. Regression must pass on both tiers when a route changes.

---

## 9. Open Discovery Items (live)

Track in `docs/open-questions.md` with named owners. As of 2026-04-24:

- **Q-001 ERP integration surface** — needed for §6.14 quantum component depth.
- **Q-002 Bluebeam rendering** — confirm coverage of annotation types in chosen viewer.
- **Q-003 Mobile DWG viewer** — licensed vs. open-source.
- **Q-004 Multi-language (FR / ES) volume** — confirms whether `packages/ai` ships multilingual prompts and embeddings in Phase 2 or defers.
- **Q-005 Inbound email infra** — SendGrid Inbound Parse vs. Azure-native acceptable to IT Security?
- **Q-006 Evidentiary signing of exports** — chain-of-custody manifest signing requirements.
- **Q-007 Pilot contract selection** — for UAT (SOW 12.31).

---

## 10. Out of Scope (Phase 3+)

Not built; do not start without explicit SOW amendment:

- Cross-contract precedent search.
- Devil's advocate claim review.
- Automated lessons learned.
- Subcontractor / supplier flow-down checking.
- AI-assisted contract review at tender.
- Contract risk scoring dashboard.
- Photo / video evidence ingestion.
- Voice note ingestion.
- P6 / MS Project scheduling integration.
- Native mobile app.
- In-app drawing markup (drawing comparison in §6.17 is the only drawing-side feature in current scope).
- Full DMS graduation (Phase 4).
- Replacement of ERP, public-facing client portal, legal advice generation.

---

## 11. References

- Business SOW v0.6 — `docs/business-sow-v0.6.docx` (authoritative business intent).
- Data model — `docs/architecture/data-model.md`.
- Email ingestion plan — `docs/architecture/email-ingestion.md`.
- Phase 0 history — `docs/phase-0-build.md`.
- Engineering rules — `.claude/rules/*.md`.
- Build progress — `BUILD_PROGRESS.md`.
- Open questions — `docs/open-questions.md`.
- Runbooks — `docs/runbooks/`.

---

**When in doubt, re-read §2 (Non-Negotiables) and §6 (Acceptance Gates).**
