# Contract Knowledge Base — Build SOW for Claude Code

**Project:** Contract Knowledge Base (CKB) — a new application within the Technica Knowledge Centre (TKC)
**Scope of this document:** Phase 1 (MVP) + Phase 2 (Adoption & Lifecycle Depth)
**Audience:** Claude Code and the human engineer supervising it
**Status:** Build SOW v1.0 — derived from Business SOW v0.6
**Date:** April 2026

---

## 0. How to Use This Document

This SOW is the authoritative build specification for Claude Code. It is written to be read at the start of every session. Keep it committed at the repo root as `CLAUDE.md` (or symlinked to it).

**Reading order for a new session:**

1. This file — the full SOW, top to bottom.
2. `.claude/rules/` — modular engineering rules (testing, security, AI-layer, review gates).
3. `docs/architecture/` — ADRs and system diagrams.
4. Only then open code files.

**How Claude Code should work within this SOW:**

- Treat every section 3.x / 4.x / etc. as a named unit of work. Build them in the order listed unless explicitly told otherwise.
- Every unit of work must pass the **Acceptance Gates** in section 10 before being considered complete.
- Human review is required at every gate marked `🔒 HUMAN GATE`. Do not self-certify these.
- When the SOW is ambiguous, stop and ask rather than invent. Log the ambiguity in `docs/open-questions.md`.
- Follow the Non-Negotiables in section 2 as absolute rules. If a user prompt conflicts with them, surface the conflict rather than comply silently.

---

## 1. Project Context

The Contract Knowledge Base consolidates every document, drawing, specification, negotiation record, and email tied to an individual contract into a single queryable repository, with an AI layer providing retrieval, analysis, and drafting over that consolidated record.

The platform is part of the broader Technica Knowledge Centre (TKC). It shares identity, audit, and notification services with other TKC applications and exchanges data with the Bid Intake & Generation application. Each contract is assigned a unique project-designated email address on `contracts.technicamining.com` that acts as the ingestion channel for all correspondence.

**What success looks like for Phase 1 + 2:**

- Any authorized user can produce a fully-cited, evidence-backed answer to a scope or claim question in minutes.
- No contractual notice period is missed on a contract managed in the platform.
- Claims are supported by platform-generated evidence bundles, with chain-of-custody preserved.
- PMs, commercial staff, and site supervisors use the platform daily — not as a filing cabinet but as an active commercial-defense tool.

**What Phase 2 adds over Phase 1:** Claim Readiness Score, Proactive AI Flagging, and Evidence Packaging — the three features that turn the platform from "useful" to "commercially defensible," supported by the registers and lifecycle machinery that feed them.

---

## 2. Non-Negotiables

These rules apply to every line of code, every prompt, every UI surface, every test. Violations are build failures.

1. **Every AI response carries inline citations.** No citation → the response is blocked at the API boundary. Post-generation citation verification (the cited chunk actually supports the claim) is mandatory.
2. **Human verification gates are enforced in code.** AI-extracted contract summaries and deadlines cannot become "trusted" until a human approves them. Unverified items render with a visible `UNVERIFIED` badge and cannot feed downstream alerts.
3. **The original `.eml` is never altered.** Email ingestion parses a working copy; the raw `.eml` is stored immutably with its hash. Same rule for uploaded documents.
4. **Audit log is append-only.** No update or delete operations on audit records, ever. Enforce at the database layer (e.g., revoked UPDATE/DELETE grants, not just app-layer discipline).
5. **Default deny on contract access.** A user sees no contract they have not been explicitly granted access to. Role does not imply access — access is per-contract and per-user.
6. **Retrieval is contract-scoped by default.** Cross-contract retrieval is a Phase 3 feature and is not to be built or exposed in Phase 1 or 2. Isolation is enforced at the vector-store namespace level, not by query filters alone.
7. **No browser-side storage of contract content.** No `localStorage`, `sessionStorage`, or IndexedDB for contract data. In-memory only; server is source of truth. (Exception: offline diary drafts — see 5.10.)
8. **No secrets in code or CLAUDE.md.** All credentials via Azure Key Vault. If Claude Code is about to write a secret inline, stop and surface the mistake.
9. **Contemporaneous records are locked.** Diary entries are not editable after end-of-next-business-day. The lock is enforced server-side, not just in the UI.
10. **Every outbound email is BCC'd to the project address automatically.** Not a user setting — a system invariant.

---

## 3. Tech Stack & Conventions

**Cloud:** Azure (Canada Central primary, Canada East backup per Section 4.1 of v0.6 business SOW).

**Backend:**
- Language: TypeScript on Node.js (LTS).
- Framework: NestJS for the API layer.
- Database: Azure SQL (primary relational store). PostgreSQL is acceptable if there is a specific reason documented in an ADR.
- Object storage: Azure Blob Storage with SSE-256 and content-addressed hashes.
- Vector store: Azure AI Search with vector + BM25 hybrid retrieval, one index namespace per contract.
- Queue / background jobs: Azure Service Bus + BullMQ workers.
- Email inbound: SendGrid Inbound Parse in Phase 1; migrate to an Azure-native equivalent if available at Phase 2 re-evaluation.
- Email outbound (Phase 2): Azure Communication Services Email, DKIM-signed from `contracts.technicamining.com`.

**Frontend:**
- Framework: Next.js (App Router) + React + TypeScript.
- Styling: Tailwind CSS with a shared TKC design-token file (see `.claude/rules/ui.md`).
- State: React Query for server state; Zustand for client UI state.
- Document viewer: PDF.js for PDFs, Mammoth for DOCX, a lightweight DWG viewer TBD in Phase 1 discovery.

**AI Layer:**
- Primary model: Claude (Anthropic API).
- Tiered routing (per SOW 6.7): Claude Sonnet for routine retrieval, deadline detection, routine flagging; Claude Opus for drafting, complex synthesis, devil's advocate review.
- Zero-data-retention configuration required.
- LLM calls are abstracted behind an internal `LLMClient` interface — no direct provider SDK calls in business logic.

**Identity:** Azure AD / Entra ID (OIDC). AD FS federation as a documented interim fallback if M365 migration slips (see SOW 7.2).

**Testing:** Vitest for unit, Playwright for end-to-end, a dedicated **AI regression harness** (see section 7) for every prompt template.

**Conventions:**
- All times are stored in UTC. Display in the user's local timezone.
- All money is stored as integer cents in the contract's governing currency; display is a presentation concern.
- All file hashes are SHA-256.
- All IDs are ULIDs (time-sortable, URL-safe).
- All API responses include `x-correlation-id` header, propagated into logs.

---

## 4. Repository Layout

```
/
├── CLAUDE.md                      # This file
├── .claude/
│   └── rules/
│       ├── testing.md             # Test coverage and gate rules
│       ├── security.md            # Authz, encryption, secrets
│       ├── ai-layer.md            # Prompt discipline, citation rules, regression harness
│       ├── ui.md                  # TKC design tokens, accessibility rules
│       └── review-gates.md        # What requires human sign-off
├── docs/
│   ├── architecture/              # ADRs, diagrams, data model
│   ├── open-questions.md          # Claude Code logs ambiguities here
│   └── runbooks/                  # Ops procedures
├── apps/
│   ├── api/                       # NestJS API
│   ├── web/                       # Next.js web app
│   ├── workers/                   # Background job workers
│   └── ingestion/                 # Email + document ingestion pipeline
├── packages/
│   ├── ai/                        # LLMClient abstraction, prompt templates, regression harness
│   ├── auth/                      # Azure AD integration, per-contract access lists
│   ├── audit/                     # Append-only audit log
│   ├── domain/                    # Core entity models (Contract, Document, Clause, etc.)
│   └── ui-kit/                    # Shared TKC design system components
├── infra/                         # Terraform / Bicep for Azure resources
└── tests/
    ├── e2e/                       # Playwright
    └── ai-regression/             # Representative queries with known answers
```

---

## 5. Phase 1 — MVP

**Goal:** A production-grade tool that PMs, site supervisors, and commercial staff use daily from launch. The AI layer is included in Phase 1 as a deliberate decision (SOW 11.1) — stripping it would produce a filing cabinet with search.

### 5.1 Contract Creation & Document Ingestion

**Build order:**

1. `Contract` entity and creation wizard (metadata capture: name, client, value, start/end dates, governing law, key parties, responsible PM, confidentiality classification).
2. On contract creation, provision the project-designated email address (see 5.2).
3. Document upload endpoint supporting drag-and-drop and bulk upload. Formats: PDF, DOCX, XLSX, DWG, PNG, JPG, TIFF, `.eml`, `.msg`, `.txt`, `.csv`, Bluebeam PDF with markups preserved.
4. Document categorization on upload: Master Agreement, Schedule, Appendix, Amendment, Drawing, Specification, Negotiation Record, Correspondence, Permit, Insurance, Bond, Other.
5. OCR pipeline for scanned documents and image-based PDFs. Store both the OCR'd text layer and the original file.
6. Version control for revisable types (drawings, specs, amendments). Superseded versions remain queryable but are flagged.
7. Metadata tagging — manual and AI-assisted. Central taxonomy, not per-contract free-form.
8. Ingestion audit: every upload logs who, when, file hash, and source (manual upload, email ingestion, bid handoff).

**Out of scope for Phase 1:** In-app drawing markup (view-only in Phase 1; markup is Phase 2 per SOW 12.7).

### 5.2 Project-Designated Email Integration

1. DNS + email infrastructure: `contracts.technicamining.com` with MX, SPF, DKIM, DMARC (infra team owns DNS; Claude Code owns the app integration).
2. Address provisioning: each contract gets `contract-<id>@contracts.technicamining.com` plus a human-readable alias (e.g., `redlake-expansion@...`). Both resolve to the same contract.
3. Inbound parse webhook (SendGrid in Phase 1): parses email, stores raw `.eml` immutably with SHA-256 hash, persists parsed representation separately.
4. Attachment extraction: each attachment is scanned (malware), hashed, stored as a `Document`, and linked to the originating email.
5. Thread reconstruction via RFC 5322 `Message-ID` and `References` headers.
6. Sender whitelisting: approved domains/addresses are auto-indexed; unapproved senders route to a review queue.
7. Duplicate detection via message-ID + content hash.
8. Content filtering: AI-assisted pre-screen for privileged or sensitive content, routed to review queue.
9. Optional auto-reply with confirmation receipt (configurable per contract).
10. Address lifecycle: deactivation on contract close; incoming mail bounces with a configurable message.

**Phase 1 edge cases that must be handled (per SOW 3.2 v0.6 additions):**

- **Encrypted and password-protected attachments** (Mimecast, Proofpoint, client portals) → route to review queue with a password-entry prompt for authorized users. Preserve the original encrypted file alongside the decrypted version.
- **Oversized attachments and shared-link content** (WeTransfer, OneDrive, SharePoint, Dropbox) → detect shared-link content in the email body; where authentication permits, follow the link and pull the content; otherwise, capture the link and prompt an authorized user to attach manually. The originating email and provenance are preserved regardless.
- **Calendar invites (.ics)** → parse into structured events; promotable to Notice & Deadline Tracker via the human verification gate.

### 5.3 AI-Assisted Q&A with Mandatory Citations

1. `LLMClient` abstraction in `packages/ai`. No direct SDK calls elsewhere.
2. Retrieval pipeline: hybrid vector + keyword (BM25) search scoped to the contract's isolated index namespace. Return ranked chunks with source metadata (document, page, clause, email `Message-ID`).
3. Prompt template library in `packages/ai/prompts/`. Every template has a version, owner, description, test set, and is loaded from the file system — not inline strings in application code.
4. Synthesis call: model receives query + retrieved context, prompted to answer only from the context and to refuse or flag uncertainty when context is insufficient.
5. **Citation enforcement** (Non-Negotiable #1): post-generation pass verifies every factual claim is backed by a citation to a retrieved chunk. Responses failing citation verification are blocked and logged as quality incidents.
6. Confidence signaling: high / medium / low / insufficient-context, surfaced to the user.
7. Feedback loop: thumbs up/down + optional comment per response, stored for prompt refinement.
8. Every response includes a clickable citation that opens the source document at the exact location (see 5.11).

### 5.4 Contract Summary / Cheat Sheet

1. Structured one-page summary generated on contract ingestion: parties, value, term, key dates, payment terms, notice periods, liquidated damages and caps, termination triggers, governing law, dispute resolution, insurance and bonding, flagged unusual/high-risk clauses.
2. Summary rendered with a **`UNVERIFIED` badge** until a human (Contract Owner) approves it.
3. Only verified summaries are treated as "trusted" by downstream features.
4. Displayed prominently on the contract dashboard.

🔒 **HUMAN GATE:** Contract Owner must approve the summary before the contract moves from `Onboarding` to `Active`.

### 5.5 Notice & Deadline Tracker

1. Deadline extraction capability in `packages/ai/capabilities/deadlines/`. Normalizes expressions like "within 14 days of becoming aware" into absolute or conditional dates. Tags each with trigger conditions, owner, and alert lead time.
2. Each extracted obligation is presented for human verification before activation. Unverified items are visible but flagged.
3. Verified deadlines feed a live dashboard, calendar view, and configurable alerts (in-app, email; SMS optional).
4. Deadlines link back to the originating clause.
5. Manual add/edit/complete with full audit trail.
6. Obligation lifecycle states: `Extracted (unverified)` → `Verified` → `Active` → `Triggered` → `Complete / Missed`.

🔒 **HUMAN GATE:** No unverified deadline generates external-user-facing alerts. Only `Verified` deadlines trigger email/SMS.

### 5.6 Clause-to-Clause Cross-Referencing

1. Clause extraction capability parses contract documents into structured clauses with position references (document, page, clause number).
2. When viewing any clause, the system surfaces related clauses, amendments that modified it, and emails/RFIs that reference it.
3. Superseded clauses are clearly flagged.
4. Clause-to-clause relationships are modeled as a many-to-many graph (see data model in `docs/architecture/data-model.md`).

### 5.7 Client & Stakeholder Contact Directory

1. Per-contract directory of parties: client reps, consultants, subcontractors, Technica team, regulatory contacts.
2. Each contact carries an **authority level**: can direct extra work / can issue site instructions / can approve variations / administrative only.
3. Authority level is visible at the point of decision (e.g., in the email viewer when the sender is displayed).
4. In Phase 1, contacts are created manually or imported from the contract summary extraction; bid handoff pre-population is Phase 2.

### 5.8 Global Search

1. Unified search across documents, clauses, emails, attachments, metadata, contacts, deadlines.
2. Filters: document type, date range, sender, revision status, tags, verification status.
3. Snippet previews with matched terms highlighted.
4. Search is scoped to the contracts the user has access to — enforce at the query-planner level, not in post-filtering.

### 5.9 Basic Notification Digest

1. In-app notifications and per-event email alerts for: deadlines, review-queue items, unapproved email senders.
2. Phase 1 is per-event; Phase 2 introduces the configurable daily/weekly digest (see 6.12).

### 5.10 Contract Dashboard & Core UI

See section 8 for UI surfaces in Phase 1. Note especially:
- Contract dashboard (8.1)
- Document viewer with clause-level anchoring (8.2)
- Email thread viewer (8.3)
- Query interface (8.4)
- Notice & deadline tracker view (8.5)
- Contact directory (8.6)
- Review queue (8.12)
- Administration UI (8.13)

### 5.11 Role-Based Permissions, Audit, SSO

1. Azure AD / Entra ID integration via OIDC. MFA required. AD FS bridge fallback documented in `docs/runbooks/adfs-fallback.md`.
2. Global roles: System Administrator, Knowledge Centre Administrator, Auditor.
3. Contract roles: Contract Owner, Contract Administrator, Contributor, Viewer, Restricted Viewer (excludes sensitive/negotiation material).
4. Per-contract access lists, default-deny.
5. Audit log: immutable, append-only, covering user actions, AI queries and responses, email ingestion, permission changes, exports.
6. Audit log is searchable and exportable by Auditor role.

### 5.12 Administration UI (Phase 1 minimum)

1. Contract creation and configuration.
2. User and permission management.
3. Email address lifecycle management.
4. Audit log access (Auditor role).

### 5.13 Data Portability (v0.6 addition, Section 4.9)

Phase 1 must deliver a minimum viable export capability:
1. Native files (original PDFs, DWGs, `.eml`) as a ZIP.
2. Structured data as JSON (contract metadata, clauses, deadlines, contacts, audit log subset).
3. Human-readable manifest describing the export's contents and timestamp.
4. Export requests are logged; redactions respected by default; non-redacted exports require elevated permission and separate logging.

**Full Phase 1 export is a pre-launch deliverable, not a "nice to have."** Several mining clients require contractual data portability and leadership needs this as a de-risking point.

---

## 6. Phase 2 — Adoption & Lifecycle Depth

**Goal:** Convert the platform from "useful" to "commercially defensible." Phase 2 is a coherent release, not a grab-bag. The three commercial-defense features (Claim Readiness Score, Proactive AI Flagging, Evidence Packaging) depend on the registers and lifecycle machinery delivered alongside them. Cut any in isolation and the release weakens.

### 6.1 Bid-to-Contract Handoff

1. Define the handoff contract (API schema, field mapping) with the Bid Intake & Generation team during Phase 1.
2. Build receiving endpoint in Phase 2: winning proposal, estimates, assumptions, qualifications, bid-phase risks, key correspondence.
3. Event-driven trigger on bid-win + on-demand re-sync.
4. Handoff is optional — manual contract creation remains supported if the Bid app is not ready.

### 6.2 Contract Change Log & Timeline

Single chronological timeline of every contract event: amendments, RFIs, notices, claims submitted, variations, milestones met/missed, correspondence, permits, insurance renewals.

### 6.3 Variation / Change Order Register

1. Lifecycle states: `Proposed` → `Priced` → `Submitted` → `Approved / Rejected / Disputed` → `Closed`.
2. Each variation links to originating instruction, supporting correspondence, pricing, client response.
3. Reconciles against contract baseline value to show current projected final value (see 6.14 for ERP linkage).

### 6.4 Risk Register

1. Identified risks, owners, mitigation plans, status, residual exposure.
2. Pre-populated from bid handoff.
3. Feeds lessons learned at closeout (Phase 3).

### 6.5 Interpretation / Decision Log

1. Captures reasoning behind contract interpretation decisions with date, parties, cited clause, cited correspondence.
2. Becomes authoritative for the contract — prevents re-litigating the same question on staff turnover.

### 6.6 Daily Site Diary

1. Entries: date, weather, labor, equipment on site, subcontractors, visitors, incidents, delays, verbal instructions.
2. **Contemporaneous lock** (Non-Negotiable #9): not editable after end-of-next-business-day. Enforced server-side.
3. Mobile-responsive entry form.
4. **Offline Diary Behaviour (v0.6 addition, SOW 8.10b):**
   - Local-draft capture with stable creation timestamp set at moment of creation (not sync).
   - Queued for sync when connectivity returns; sync timestamp captured separately.
   - UI clearly shows per-entry state: Local Only, Syncing, Synced, Sync Failed.
   - Edit-lock window keyed to creation timestamp, not sync timestamp.
   - Conflict handling: both versions preserved if same entry edited on multiple devices, with reconciliation by author.
5. Retrievable by date, author, tags.

### 6.7 Safety, QA/QC & Inspection Records (v0.6 addition, SOW 3.14b)

1. Diary entries, documents, and correspondence can carry first-class flags: incident, NCR, inspection record, hold-point release.
2. Contractual reporting timelines on these events feed the deadline tracker via the standard verification gate.
3. Hold points are tracked with required notification lead time and release status.
4. Flagged records are selectable as evidence in Evidence Packaging (6.11).

### 6.8 Payment Application Tracking

1. Progress claims submitted, certified amounts, paid amounts, disputed items.
2. Statutory payment timelines feed the deadline tracker (many jurisdictions have hard deadlines with legal consequences).

### 6.9 Insurance, Bonds & Permit Tracking

1. Policies, bonds, permits: type, coverage, named insureds, expiry, renewal responsibility.
2. Expiry dates feed the deadline tracker automatically.
3. Pre-expiry alerts.

### 6.10 Claim Drafting Workspace

1. Split-view UI: draft on left, evidence panel on right.
2. AI generates first draft; user refines.
3. Every assertion in the draft is tied to a cited clause, email, document, or diary entry.
4. Evidence bundle (6.11) is compiled automatically as the draft develops.

### 6.11 Evidence Packaging (SOW 3.37, v0.6 expanded)

Single-most-important Phase 2 feature. Demonstrates claim-day ROI.

1. One-click bundling from any claim, variation, dispute, or standalone query.
2. Selects cited documents, emails (with original `.eml`), drawings, diary entries, relevant clauses.
3. Produces two deliverables:
   - PDF portfolio: embedded attachments, cover page, table of contents, chronological timeline, citation index.
   - ZIP package: original files in native format for counsel/arbitrator requirements.
4. **Chain-of-custody manifest (v0.6):** standalone PDF recording, per artifact, source, original filename, SHA-256 hash, ingestion timestamp, ingesting user, subsequent version events.
5. **Redaction log (v0.6):** accompanies any bundle containing redacted content. Records redactor, timestamp, scope, reason category — not the redacted content itself.
6. Bundles are versioned; once externally submitted, they lock against modification.
7. Export respects redactions by default; unredacted export requires elevated permission and is logged separately.

### 6.12 Claim Register & Status Tracker + Claim Lifecycle States

1. Lifecycle states: `Draft` → `Internal Review` → `Submitted` → `Client Response Received` → `Under Negotiation` → `Resolved (Won / Settled / Lost / Withdrawn)`.
2. Each claim carries the evidence bundle from 6.11.
3. Commercial dashboard rollup for leadership.

### 6.13 Claim Readiness Score (SOW 3.35)

Live indicator per draft claim, computed continuously as evidence changes.

**Components (each scored red / amber / green with drill-down):**
1. Notice compliance — all required contractual notices filed on time?
2. Evidence completeness — documents, emails, drawings, diary entries cited?
3. Timeline validity — dates/sequence consistent with contract and contemporaneous records?
4. Clause support — every claim assertion tied to a specific clause?
5. Quantum substantiation — cost and time impact supported by evidence (see 6.14)?

**Gate:** a claim cannot be marked `Submitted` until the score passes a minimum threshold OR the Commercial/Claims Lead explicitly overrides with a logged justification.

🔒 **HUMAN GATE:** score overrides require documented reason. Surface the override in the audit log and on the claim itself.

### 6.14 ERP / Cost System Read-Only Linkage (v0.6 addition, SOW 7.8)

**Phase 2 scope:** approved contract value and approved variations (for the variation register and Claim Readiness Score quantum component).
**Phase 3 scope:** committed cost, certified-to-date, paid-to-date.

1. Read-only integration — ERP is and remains the system of record for cost and commercial data.
2. Scheduled daily refresh + on-demand refresh for Contract Owner and Commercial/Claims Lead.
3. Timestamp of last refresh visible wherever ERP-sourced values appear.
4. Manual entry remains the fallback if ERP integration is not viable in Phase 2; build the manual path first, integrate second.

### 6.15 Proactive AI Flagging (SOW 3.36)

AI monitors incoming emails, documents, and diary entries against the contract and raises flags unprompted.

**Example flag types:**
- "This email from the client may constitute a notice under Clause 14.2. Consider whether a response is required within 14 days."
- "This site instruction directs work that appears to be outside Schedule A scope. Consider raising a variation."
- "A milestone deadline falls within 7 days; no preparation activity logged."
- "Drawing revision changes the ventilation layout; potential scope impact."

1. Every flag includes reasoning, cited clause/document, recommended next action.
2. Flags appear on the contract dashboard, in the notification digest, and on the relevant document/email.
3. Users can dismiss, action, or escalate — every flag action logged.
4. Flag sensitivity is tunable per contract type.
5. Flagging runs on ingestion events, not on a polling loop.

**Cost caution:** proactive flagging runs across every incoming email and document. Route to Claude Sonnet with tight context windows; escalate to Opus only on the subset of flags that require deep reasoning. See 7.3.

### 6.16 Outbound Correspondence from Project Address

1. RFIs, delay notices, variation requests, change order responses, notices of default, cure notices.
2. **Enforced subject line conventions:** contract number, doc type (RFI/Notice/VAR/etc.), sequence number, revision, brief description.
3. **Automatic metadata tagging** on send.
4. **Automatic BCC to project address** (Non-Negotiable #10).
5. Template library, version-controlled, centrally owned (commercial lead).
6. All outbound logged to audit trail.

### 6.17 Drawing Comparison Tool

1. On revised drawing upload or email ingestion, auto-diff against prior revision.
2. Flag changes potentially introducing scope creep.
3. Surface in the timeline and as a proactive flag (6.15).

### 6.18 "Send to Contract" Outlook Add-in

1. One-click routing of any email + attachments to the correct project-designated address.
2. Contract selection UI (searchable dropdown scoped to user's accessible contracts).
3. Auth via user's Azure AD session (post-M365-migration) or Azure AD token (pre-migration bridge).
4. Handles both received and sent items.
5. Offline queuing with sync-on-reconnect for field staff.
6. Deployed through Technica's M365 tenant.

### 6.19 Meeting Minutes Ingestion with Action Item Extraction

1. AI parses uploaded minutes, extracts commitments per party.
2. Action items feed the deadline tracker via the verification gate.
3. Commitments link to originating clauses where applicable.

### 6.20 Submittals & Transmittal Register (v0.6 addition, SOW 3.11b)

Distinct from the RFI register.

1. Tracks shop drawings, material data, samples, method statements, ITPs, welder qualifications, other items requiring client/consultant review.
2. Submittal lifecycle states: `Draft` → `Submitted` → `Under Review` → `Approved / Approved as Noted / Revise and Resubmit / Rejected` → `Closed`. Resubmissions preserve a chain.
3. Contractual review clocks feed the deadline tracker. Overdue reviews flagged as potential grounds for delay entitlement.
4. Each submittal links to originating clause, associated documents, client responses, downstream variations/claims.
5. Filters: status, discipline, work package, overdue reviews.

### 6.21 Project Closeout Checklists

1. Configurable per contract: deliverables, final payments, warranties, demobilization, lien waivers, as-built drawings, O&M manuals, final account, claims resolution, client sign-off, closeout certificates, archival.
2. Templates by contract type (EPC, construction, supply, services).
3. Per-item sign-off workflow with owner.
4. Generates a closeout certificate on completion.
5. Contract cannot move to `Archived` until checklist complete or exceptions explicitly waived.

### 6.22 Lifecycle State Machines

Every core entity moves through a defined state machine with controlled transitions, per-state permissions, and audit logging on every change.

- **Contract:** `Draft` → `Onboarding` → `Active` → `Issue-in-Progress` → `Closeout` → `Archived`. Archive gate: closeout checklist complete or exceptions waived.
- **Claim:** see 6.12.
- **Variation:** see 6.3.
- **RFI:** `Draft` → `Issued` → `Awaiting Response` → `Response Received` → `Closed`.
- **Submittal:** see 6.20.
- **Obligation/Deadline:** see 5.5.

Implement state machines as typed finite state machines with explicit transition tables, not scattered `if` checks.

### 6.23 Full Configurable Notification Digest

Daily or weekly digest per user summarizing upcoming deadlines, pending reviews, new flagged items, claim status changes, contract events.

### 6.24 Ethical Walls & Individual Access Revocation (v0.6 addition, SOW 9.6)

1. Contract Owner, Knowledge Centre Administrator, or Legal Counsel can explicitly revoke a named individual's access to a contract.
2. Revocation overrides role-based defaults and inherited group access.
3. Scope: blocks view, search, query, notifications. Cross-contract search (Phase 3) honors revocations.
4. Audit records: revoker, revoked user, reason category (conflict of interest, role change, legal instruction, ethical wall), free-text justification. Reversals equally logged.
5. Per-revocation configurable notification to the affected user — silent for sensitive situations, explicit for routine.

### 6.25 Redaction Controls (SOW 9.4)

1. Authorized users (Contract Owner, Knowledge Centre Admin, Legal Counsel) can apply redactions to passages in documents or emails without altering originals.
2. Displayed view hides redacted content; original preserved for evidentiary integrity.
3. Per-redaction log: redactor, timestamp, reason category, scope (passage / page / document).
4. Redaction reversal logged.
5. AI retrieval context includes instruction to ignore redacted passages and signal that redacted content exists — not bypass.
6. Evidence bundles respect redactions by default (see 6.11).

---

## 7. AI Layer — Engineering Rules

See `.claude/rules/ai-layer.md` for the full ruleset. Summary:

### 7.1 Capabilities as First-Class Modules

Each AI capability (Retrieval, Clause & Obligation Extraction, Deadline Detection, Risk Flagging, Drafting, Synthesis) lives in `packages/ai/capabilities/<name>/` with:
- `prompt.ts` — the prompt template (versioned).
- `schema.ts` — input and output Zod schemas.
- `evaluate.ts` — regression test set + evaluator.
- `index.ts` — the public function.

No capability is "done" without its regression test set.

### 7.2 Prompt Template Library

Templates are code, not config. Version-controlled. Named owner per template. Changes require the regression harness to pass.

Required templates for Phase 1 + 2:
- In-scope / out-of-scope analysis
- Delay claim analysis (Phase 2)
- Claim drafting (Phase 2)
- Clause interpretation
- Contract summary generation
- Deadline extraction
- Proactive flag generation (Phase 2)

### 7.3 Tiered Model Routing (v0.6 addition, SOW 6.7)

- **Claude Sonnet:** routine retrieval, basic Q&A, deadline detection, routine flag evaluation.
- **Claude Opus:** drafting, complex synthesis, devil's advocate review, contract review at tender.

Routing is per capability and lives in `packages/ai/routing.ts`. Changing a route requires the regression harness to pass on both tiers.

Cost telemetry: token consumption, model, latency captured per request, attributed to contract / capability / user. Dashboards surface cost by dimension. Monthly cost review (Knowledge Centre Admin + Commercial Lead + IT).

### 7.4 Hallucination Safeguards (Non-Negotiable #1)

- Mandatory citations — enforced at the API boundary.
- Post-generation citation verification — cited chunk actually supports claim.
- Confidence signaling on every response.
- Refusal on insufficient context — model says "the contract does not appear to address this" rather than guess.
- Human verification gates on summaries and deadlines (5.4, 5.5).

### 7.5 Regression Harness

`packages/ai/regression/` contains a representative set of queries with known answers. Run on every material change to prompts, retrieval, or model version. PRs that drop accuracy below the baseline are blocked.

### 7.6 Data Handling

- No contract data used to train third-party models.
- Zero-data-retention API configuration.
- All AI interactions logged in the audit trail with the retrieved context hash for reproducibility.

### 7.7 Multi-Language Support (v0.6 addition, SOW 6.2)

Flag during Phase 1 discovery; build in if confirmed:
- French (Quebec operations, federal contracts).
- Spanish (potential Latin American work).

Language detection per document and per query. Embedding model must support target languages without quality regression.

---

## 8. UI Surfaces (Phase 1 + 2)

### Phase 1

| # | Surface | Notes |
|---|---------|-------|
| 8.1 | Contract Dashboard | Primary landing. Summary, upcoming deadlines, activity, shortcuts, AI query bar |
| 8.2 | Document Viewer | PDF/DOCX/image/DWG inline. Clause-level anchoring for citations |
| 8.3 | Email Thread Viewer | Chronological, attachments, `.eml` download |
| 8.4 | Conversation/Query Interface | Chat-style, scoped to contract, inline citations, confidence indicator |
| 8.5 | Notice & Deadline Tracker | Calendar + list, filters, drill-down to clause |
| 8.6 | Contact Directory | With authority-level indicators |
| 8.12 | Review Queue | Unapproved senders, flagged emails, unverified summaries and deadlines. Bulk actions |
| 8.13 | Administration UI | Contract creation, users, email addresses, audit access |

### Phase 2

| # | Surface | Notes |
|---|---------|-------|
| 8.7 | Timeline View | Chronological rollup of contract events |
| 8.8 | Claim Draft Workspace | Split view, AI first draft, evidence panel |
| 8.9 | Register Views | Variation, risk, claim, payment, insurance/bond/permit, submittals |
| 8.10 | Daily Site Diary | Mobile-responsive; offline behaviour per 6.6 |
| 8.11 | Closeout Checklist | Per-item owner, sign-off, certificate generation |

### Universal UI Rules

- Mobile-responsive web (Phase 1 + 2). Native app deferred per SOW 12.13.
- WCAG 2.1 Level AA.
- Maximum three clicks from contract dashboard to any core function.
- TKC design tokens from `packages/ui-kit/`. No ad-hoc styling in feature code.
- Every AI output carries a visible citation affordance. Unverified content carries a visible `UNVERIFIED` badge.

---

## 9. Non-Functional Requirements (Implementation Targets)

| Category | Target |
|---|---|
| Encryption | TLS 1.2+ in transit; AES-256 at rest |
| Upload & indexing | < 2 min for documents up to 100 MB under normal load |
| AI query response | < 10 s typical; < 30 s complex multi-document synthesis |
| Search | < 2 s for global keyword + metadata search |
| Email ingestion latency | < 2 min from arrival to searchable |
| Uptime | 99.5% business hours; 99% overall |
| RPO | 1 hour |
| RTO | 4 hours |
| Scale target (end Year 1) | 200 contracts, 500 users, 5M indexed docs/emails |
| Accessibility | WCAG 2.1 AA |
| Data residency | Azure Canada Central primary; Canada East backup |

Performance targets are CI-gated. A PR that regresses any target below tolerance is blocked.

---

## 10. Acceptance Gates

Every unit of work passes through these gates in order:

### Gate 1 — Claude Code self-verification

- Unit tests added and passing.
- Integration tests added where the unit touches more than one module.
- Type-check passes, lint passes, no `// TODO` or `// FIXME` without a linked issue.
- No changes to `.claude/rules/` without accompanying rationale in the PR description.
- For AI capabilities: regression harness passes at or above baseline.

### Gate 2 — Non-Negotiable check

- Relevant Non-Negotiables from section 2 explicitly verified in the PR description.

### Gate 3 — 🔒 Human review

Required for any PR that:
- Touches the audit log code path.
- Changes any permission or authorization logic.
- Modifies a prompt template.
- Changes a model routing decision.
- Modifies anything in `.claude/rules/`.
- Relaxes a Non-Negotiable (requires explicit override in SOW).

### Gate 4 — 🔒 Operational readiness (pre-production only)

- Runbook for the unit exists in `docs/runbooks/`.
- Observability: logs, metrics, traces present and dashboarded.
- Security review completed (dependency audit, authz path traced, data residency confirmed).
- Load test executed against performance targets (section 9).

---

## 11. Discovery Items for Phase 1

Claude Code does not start building these without answers. Log here; raise with human owner:

1. Technica's ERP product and integration surface (for 6.14).
2. Bluebeam PDF rendering constraints in the chosen document viewer.
3. Mobile DWG viewer options — licensed vs. open source.
4. Confirm French / Spanish contract volume to scope multi-language work (7.7).
5. Confirm whether managed MX / SendGrid is acceptable to IT security, or if Azure-native inbound email parsing must ship in Phase 1.
6. Confirm whether contract data exports are required to be signed/timestamped for evidentiary use (affects 5.13 design).
7. Confirm pilot contract selection for user acceptance testing (SOW 12.31).

---

## 12. Out of Scope for Phase 1 + 2

Per SOW 1.3 and the phased plan, these are explicitly out of scope for this build:

- Replacement of Technica's financial/ERP systems.
- Cost tracking, invoicing, forecasting (ERP integration is read-only — see 6.14).
- Legal advice generation.
- Public-facing client portals.
- Cross-contract precedent search (Phase 3).
- Automated lessons learned (Phase 3).
- Devil's advocate claim review (Phase 3).
- Voice note ingestion (Phase 3).
- Subcontractor/supplier contract linking with flow-down checking (Phase 3).
- AI-assisted contract review at tender (Phase 3).
- Contract risk scoring dashboard (Phase 3).
- Photo/video evidence ingestion (Phase 3).
- Scheduling tool integration — P6 / MS Project (Phase 3).
- Full DMS graduation (Phase 4).
- Native mobile app (Phase 3+ if demand proven).
- In-app drawing markup (Phase 2 markup is limited to the drawing comparison tool in 6.17; full markup is Phase 3).

---

## 13. References

- Business SOW v0.6: `docs/business-sow-v0.6.docx` (authoritative business intent; this build SOW is the implementation view).
- Data model: `docs/architecture/data-model.md`.
- Integration boundaries: `docs/architecture/integrations.md` (derived from SOW 7.7).
- Engineering rules: `.claude/rules/*.md`.
- Open questions log: `docs/open-questions.md`.

---

**End of SOW. When in doubt, re-read section 2 (Non-Negotiables) and section 10 (Acceptance Gates).**
