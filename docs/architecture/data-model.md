# Data Model — Contract, Document, Email, Clause

**Status:** Draft proposal for review. No code yet.
**Scope:** The four core entities named in CLAUDE.md section 5. Deadline, Contact, Variation, Claim, RiskItem, Submittal, DiaryEntry, etc. are referenced where they touch these four but are out of scope for this document.
**Storage target:** Azure SQL (relational, per CLAUDE.md §3). Full-text/vector representations live in Azure AI Search; blob content lives in Azure Blob Storage. This document describes the relational shape.

---

## 1. Conventions Applied

Recapped from CLAUDE.md §3 so every field below makes sense without cross-referencing:

- **IDs:** ULID on every entity. Time-sortable, URL-safe. No auto-increment integers.
- **Time:** all timestamps stored in UTC (`timestamptz` / `datetimeoffset`). Timezone is a presentation concern.
- **Money:** integer minor units (cents) plus a currency code. No floats.
- **Hashes:** SHA-256, stored as the 64-char hex representation.
- **Contract scoping:** every contract-scoped row carries `contract_id`. Retrieval, search, and query planners join the access table on `contract_id`; no bare queries. This is Non-Negotiable #6 at the schema level.
- **Audit vs. entity timestamps:** entity tables carry `created_at` / `updated_at` for query convenience. The append-only `audit_log` (separate table, separate grants — see `.claude/rules/security.md` §8) is the source of truth for "who did what when." Entity `updated_at` must never be the only record of a change.
- **Soft delete:** avoided. Entities that go away move through a lifecycle state (e.g., `Superseded`, `Archived`). No `deleted_at` columns on core entities.
- **Originals are immutable:** raw `.eml` and uploaded files live in blob storage at a content-addressed path (`sha256/<hash>`). The DB row references the blob, never embeds it, and never rewrites the blob reference once set. This is Non-Negotiable #3.

---

## 2. Contract

The top-level entity. Everything else hangs off a contract.

### Core fields

| Field | Type | Notes |
|---|---|---|
| `id` | ULID | PK. Also appears in the project-designated email address. |
| `name` | string | Human-readable. Unique within client optional — see open question Q1. |
| `client_party_id` | FK → `party` | The counterparty. Separate `party` table, not a free-text string. |
| `responsible_pm_user_id` | FK → `user` | Internal Technica PM. |
| `contract_value_cents` | int64 | Baseline contract value in `currency` units. Nullable until known. |
| `currency` | ISO-4217 | Immutable once set. |
| `start_date` | date | In contract's governing jurisdiction timezone. Stored as a date, not a timestamp. |
| `end_date` | date | Nullable — indefinite-term contracts exist. |
| `governing_law` | string | Free-text short code (e.g., "Ontario, Canada"). Taxonomy TBD — see Q2. |
| `confidentiality_class` | enum | `Standard`, `Restricted`, `HighlyRestricted`. Drives default-deny defaults. |
| `language` | ISO-639 | Primary contract language. Per-document language override exists on `document`. |
| `lifecycle_state` | enum | See §2.1 below. |
| `vector_namespace` | string | Azure AI Search index namespace. Set at creation, never changes. Non-Negotiable #6. |
| `project_email_address` | string | `contract-<id>@contracts.technicamining.com`. Canonical address. |
| `project_email_alias` | string | Human-readable alias (e.g., `redlake-expansion@...`). Resolves to the same contract. |
| `email_auto_reply_enabled` | bool | Per §5.2.9. |
| `summary_id` | FK → `contract_summary` | Nullable. See §2.2. |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### 2.1 Lifecycle state

Per CLAUDE.md §6.22: `Draft` → `Onboarding` → `Active` → `Issue-in-Progress` → `Closeout` → `Archived`.

- The transition `Onboarding` → `Active` is gated by the human-verified contract summary (§5.4 / review-gates §1). Enforce as a CHECK / trigger, not app-layer code alone.
- The transition `Closeout` → `Archived` is gated by the closeout checklist (§6.21 / review-gates §1).
- Transitions are recorded in `audit_log` with before/after state and actor.
- Implemented as a typed finite state machine in application code (§6.22); the DB enforces the allowed set via a transition table.

### 2.2 Contract summary (companion entity)

Held in its own table because verification state is a first-class concern (Non-Negotiable #2).

| Field | Notes |
|---|---|
| `id` | ULID |
| `contract_id` | FK. One active summary per contract; historical summaries retained for audit. |
| `content_json` | Structured: parties, value, term, key dates, payment terms, notice periods, LDs and caps, termination triggers, governing law, dispute resolution, insurance/bonding, flagged clauses. See §5.4. |
| `verification_state` | enum: `Unverified`, `Verified`, `Superseded`. |
| `verified_by_user_id` | FK → `user`. Nullable until verified. |
| `verified_at` | timestamptz. Nullable until verified. |
| `generated_by_capability_version` | string. Ties back to the AI capability version that produced it (packages/ai regression traceability). |
| `generated_at` | timestamptz |

A summary in `Unverified` state is visible but **cannot** feed downstream alerts or be treated as trusted by any feature (deadline tracker, proactive flagging, claim readiness score). This is Non-Negotiable #2 — enforce with a DB-level guard: `WHERE verification_state = 'Verified'` is the only path out to downstream tables.

### 2.3 Contract access (separate table, called out for emphasis)

Authorization lives in a dedicated `contract_access` table (`contract_id`, `user_id`, `contract_role`, `granted_by`, `granted_at`) plus a `contract_access_revocation` table for explicit individual revocations (§6.24). Check order per `.claude/rules/security.md` §3: revocation → explicit grant → role/group → default deny. Role does not imply access.

Not part of the "Contract" entity itself, but every query touching Contract-scoped data joins these tables. Called out here so the model isn't read as "roles grant access" — they don't.

---

## 3. Document

Any file associated with a contract: master agreement, schedule, drawing, spec, email attachment, permit, etc. The raw file is immutable; everything else can be re-derived from it.

### Core fields

| Field | Type | Notes |
|---|---|---|
| `id` | ULID | PK |
| `contract_id` | FK → `contract` | Scoping. |
| `category` | enum | `MasterAgreement`, `Schedule`, `Appendix`, `Amendment`, `Drawing`, `Specification`, `NegotiationRecord`, `Correspondence`, `Permit`, `Insurance`, `Bond`, `Other`. Per §5.1. |
| `mime_type` | string | |
| `original_filename` | string | As received. Preserved, never rewritten. |
| `size_bytes` | int64 | |
| `sha256` | char(64) | Hash of the original bytes. Content-addresses the blob. |
| `blob_path` | string | `sha256/<hash>` in Azure Blob. Set once, never rewritten. |
| `source` | enum | `ManualUpload`, `EmailIngestion`, `BidHandoff`. |
| `source_email_id` | FK → `email` | Nullable. Set only when `source = EmailIngestion`. |
| `uploaded_by_user_id` | FK → `user` | Nullable for email-ingested docs (sender is on the email). |
| `uploaded_at` | timestamptz | |
| `language` | ISO-639 | Detected at ingestion. Overrides contract language for this doc. |
| `malware_scan_status` | enum | `Pending`, `Clean`, `Quarantined`. Quarantined docs do not ingest further. |
| `ocr_status` | enum | `NotRequired`, `Pending`, `Complete`, `Failed`. |
| `ocr_text_blob_path` | string | Nullable. Separate blob — never overwrites the original. |
| `encryption_state` | enum | `None`, `EncryptedPending`, `Decrypted`. Per §5.2 Phase 1 edge case for password-protected attachments. |
| `redaction_state` | enum | `None`, `Redacted`. Redactions are overlays; originals preserved (Non-Negotiable #3, §6.25). |
| `current_version_id` | FK → `document_version` | Points to the latest version in the chain. |
| `is_superseded` | bool | Convenience denormalization for list views; source of truth is `document_version`. |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### 3.1 Versioning

Revisable categories — `Drawing`, `Specification`, `Amendment` — need version chains (§5.1.6). Non-revisable categories (a signed master agreement, an `.eml`) don't.

A separate `document_version` table carries: `id`, `document_id` (FK), `version_label` (e.g., "Rev C"), `sha256`, `blob_path`, `superseded_at`, `superseded_by_version_id`, `uploaded_by_user_id`, `uploaded_at`.

The `document.current_version_id` pointer makes "show me the latest" cheap; the chain is intact for audit and for superseded-badge display in the viewer (ui.md §10).

### 3.2 Metadata and tags

Tags are a separate many-to-many `document_tag` table (`document_id`, `tag_id`) against a central `tag` taxonomy. No per-contract free-form tags — §5.1.7.

### 3.3 Clause extraction link

One document produces many clauses (see §5). The linkage is `clause.source_document_id`.

---

## 4. Email

An ingested email message. Distinct from Document: emails are rich relational structures (headers, threading, parties) that deserve their own table. Attachments are Documents linked to the Email.

### Core fields

| Field | Type | Notes |
|---|---|---|
| `id` | ULID | PK |
| `contract_id` | FK → `contract` | Determined from the project-designated recipient address. |
| `rfc_message_id` | string | RFC 5322 `Message-ID`. Indexed. Unique within `contract_id` — cross-contract duplicates are legitimate (see Q3). |
| `in_reply_to` | string | RFC 5322 `In-Reply-To`. Nullable. |
| `references` | string[] | RFC 5322 `References`. Array, ordered. |
| `thread_id` | FK → `email_thread` | Reconstructed thread. See §4.1. |
| `from_address` | string | |
| `from_name` | string | |
| `to_addresses` | string[] | |
| `cc_addresses` | string[] | |
| `bcc_addresses` | string[] | Only visible to Technica side — external BCCs we can't see. |
| `subject` | string | |
| `sent_at` | timestamptz | From `Date` header. |
| `received_at` | timestamptz | When the inbound parser received it. |
| `body_text` | text | Parsed plain text. Derived — regeneratable from raw `.eml`. |
| `body_html_blob_path` | string | Nullable. Parsed HTML stored as a blob, not in the row. |
| `raw_eml_sha256` | char(64) | Hash of the immutable `.eml`. Non-Negotiable #3. |
| `raw_eml_blob_path` | string | `sha256/<hash>` content-addressed. Never rewritten. |
| `sender_trust_state` | enum | `Approved`, `ReviewQueue`, `Unapproved`. Drives whether the email auto-indexes or routes to §8.12 review. |
| `duplicate_of_email_id` | FK → `email` | Nullable. Set when message-ID + content hash matches an existing record (§5.2.7). |
| `privileged_flag` | bool | AI pre-screen result (§5.2.8). Privileged emails route to restricted-access tier. |
| `contains_shared_link` | bool | Detected per §5.2 Phase 1 edge case (WeTransfer, OneDrive, etc.). |
| `shared_link_status` | enum | Nullable. `NotApplicable`, `AutoPulled`, `ManualCapturePending`, `ManualCaptureComplete`. |
| `ics_event_id` | FK → `calendar_event` | Nullable. If the email carried a `.ics` — §5.2 Phase 1 edge case. |
| `created_at` | timestamptz | |

### 4.1 Thread reconstruction

Threads use a separate `email_thread` table so we don't recompute on every view. Reconstruction rules from §5.2.5:

1. On ingestion, walk `In-Reply-To` → `References` backwards to find an existing email in the same contract.
2. If found, join that email's thread.
3. If not, create a new thread rooted at this email.
4. Cross-contract threading is explicitly not supported (Non-Negotiable #6). A reply that comes in on a different contract's address starts a new thread on that contract, even if the headers chain back.

### 4.2 Attachments

Attachments are Documents. The linkage is the Document's `source_email_id`. An email with five attachments produces five `document` rows plus the `email` row. This keeps hashing, scanning, and OCR uniform across upload sources.

### 4.3 Outbound email (Phase 2, §6.16)

Out of scope for the present data-model ask, but noted: outbound messages share this table with an additional `direction` enum (`Inbound`, `Outbound`) and an `outbound_template_id` FK. The automatic BCC to the project address (Non-Negotiable #10) is a send-time concern, not a schema concern.

### 4.4 Body content and retrieval

`body_text` lives in the row for small bodies (cheap retrieval context). If the parsed body exceeds a threshold (TBD — suggest 256 KB), it offloads to a blob and the column holds an excerpt. This keeps row sizes predictable. The raw `.eml` is always the source of truth; the parsed body is derived.

---

## 5. Clause

A structured excerpt of a contract document with position metadata sufficient for citation. Clauses are the primary citation target for the AI layer — every AI response resolves to one or more clauses (or documents/emails) with page and character anchors.

### Core fields

| Field | Type | Notes |
|---|---|---|
| `id` | ULID | PK |
| `contract_id` | FK → `contract` | Denormalized from the source document for query convenience. Non-Negotiable #6. |
| `source_document_id` | FK → `document` | The document the clause was extracted from. |
| `source_document_version_id` | FK → `document_version` | Clauses are pinned to a document version so that citations remain valid across revisions. |
| `clause_number` | string | As labeled in the contract (e.g., "14.2(b)"). Nullable — some documents have unnumbered paragraphs. |
| `heading` | string | Nullable. E.g., "Notice of Claim". |
| `page_start` | int | 1-indexed. |
| `page_end` | int | |
| `char_offset_start` | int | Offset into the document's normalized text layer. For viewer deep-linking. |
| `char_offset_end` | int | |
| `text` | text | The clause text itself. |
| `clause_type` | enum | Taxonomy TBD — see Q4. Candidates: `NoticeProvision`, `Payment`, `Variation`, `Termination`, `LiquidatedDamages`, `DisputeResolution`, `Indemnity`, `Insurance`, `GoverningLaw`, `Other`. |
| `extracted_by_capability_version` | string | Ties to `packages/ai/capabilities/clause-extraction` version — regression traceability. |
| `extraction_confidence` | enum | `High`, `Medium`, `Low`. Surfaced on citation affordances (ui.md §4). |
| `verification_state` | enum | `Unverified`, `Verified`. Parallel to `contract_summary` verification — Non-Negotiable #2. |
| `verified_by_user_id` | FK → `user` | Nullable. |
| `verified_at` | timestamptz | Nullable. |
| `supersedes_clause_id` | FK → `clause` | Nullable. For amendments that modify prior clauses (§5.6). |
| `is_superseded` | bool | Denormalized for query speed; source of truth is the `supersedes_clause_id` chain. |
| `created_at` | timestamptz | |

### 5.1 Clause cross-reference graph (§5.6)

Clauses relate to each other in multiple ways: one clause references another ("subject to Clause 12"), one amendment modifies another, one email cites a clause in an argument. Model this as a single many-to-many table with a typed edge:

| Field | Notes |
|---|---|
| `from_clause_id` | FK |
| `to_clause_id` | FK (nullable if target is not a clause — see below) |
| `to_email_id` | FK (nullable) |
| `to_document_id` | FK (nullable) |
| `relationship` | enum: `References`, `Amends`, `Supersedes`, `CitedIn`, `Interprets`, `Contradicts` |
| `created_by` | `AI` / `Human` |
| `created_by_user_id` | FK, nullable |
| `capability_version` | string, nullable |
| `confidence` | enum, nullable |
| `verification_state` | enum: `Unverified`, `Verified` |

Exactly one of `to_clause_id` / `to_email_id` / `to_document_id` is non-null. A CHECK constraint enforces this.

This is a general-purpose relationship graph and also serves the clause-to-email and clause-to-document traversals that §5.6 and the citation affordances need.

### 5.2 Retrieval representation

The clause is the citation unit, but it is not the retrieval unit. Retrieval chunks are produced by `packages/ai/retrieval/` and may span multiple clauses, split long clauses, or include surrounding context. A chunk carries back-references to the clauses it overlaps so the citation verifier (ai-layer §5) can resolve a cited chunk to a clause.

The retrieval chunk table lives in Azure AI Search, not Azure SQL. Schema for that index is a separate concern (see open question Q5).

---

## 6. Relationship Diagram

```
                     ┌───────────────────────┐
                     │       Contract        │
                     │  id, name, client,    │
                     │  lifecycle_state,     │
                     │  vector_namespace     │
                     └──────────┬────────────┘
                                │ 1..*
         ┌──────────────────────┼────────────────────────┐
         │                      │                        │
         ▼                      ▼                        ▼
  ┌────────────┐          ┌──────────┐             ┌──────────┐
  │  Document  │◄─────────┤  Email   │             │ Clause   │
  │  category, │ attach   │ rfc_msg, │             │  num,    │
  │  sha256,   │  ment    │ thread,  │             │  text,   │
  │  version   │          │ raw_eml  │             │  page    │
  └─────┬──────┘          └────┬─────┘             └─────┬────┘
        │                      │                        │
        │ source for           │ cited in               │ extracted from
        └─────────┐            │                        │
                  ▼            ▼                        ▼
              ┌────────────────────────────────────────────┐
              │        clause_relationship (graph)         │
              │  References / Amends / Supersedes / ...   │
              └────────────────────────────────────────────┘
```

Cardinalities:
- `Contract 1 — * Document`
- `Contract 1 — * Email`
- `Contract 1 — * Clause`
- `Email * — * Document` via `document.source_email_id` (each attachment is one Document; many-to-one on the schema, but an email has many Documents)
- `Document 1 — * Clause`
- `Document 1 — * DocumentVersion`
- `Clause * — * Clause / Email / Document` via `clause_relationship`

---

## 7. How Non-Negotiables Land in the Schema

Cross-check that the shape proposed above actually enforces the rules:

| Non-Negotiable | Where it lives in the schema |
|---|---|
| #1 Citations mandatory | Clause is the citation unit; `clause_relationship` supports citation-verification traversal; citation enforcement is prompt-side + post-generation (not a DB concern). |
| #2 Human verification gates | `contract_summary.verification_state`, `clause.verification_state`, `deadline.verification_state` (out of scope here but parallel). Downstream queries filter on `Verified`. |
| #3 Originals immutable | `document.sha256` / `blob_path` and `email.raw_eml_sha256` / `raw_eml_blob_path` are set once; no UPDATE path in application code. Parsed/derived fields are separate columns. |
| #4 Append-only audit | `audit_log` is a separate table with UPDATE/DELETE grants revoked (security.md §8). Not modeled here but referenced. |
| #5 Default deny access | `contract_access` table; every contract-scoped query joins it. Role tables do not grant contract access. |
| #6 Contract-scoped retrieval | `contract_id` on every contract-scoped row; `contract.vector_namespace` isolates the vector index; no cross-contract FKs except in Phase 3 surfaces. |
| #7 No browser storage | N/A to relational schema. |
| #8 No secrets in code | N/A to relational schema. |
| #9 Diary lock | Out of scope here (DiaryEntry entity) — but same pattern: lock window computed from `created_at`, enforced server-side. |
| #10 Auto-BCC | Send-time concern, not schema. |

---

## 8. Open Questions

To be logged in `docs/open-questions.md` and raised with the human owner before any migrations are written.

- **Q1.** Should `contract.name` be unique within a client? Useful for humans; a hassle if two genuinely distinct contracts share a name.
- **Q2.** Governing-law taxonomy — free-text short code vs. a reference table. Affects search facets and downstream clause interpretation.
- **Q3.** `rfc_message_id` uniqueness — unique per contract (proposed) or globally? Globally-unique assumption breaks when the same email is legitimately forwarded into two contracts' addresses.
- **Q4.** Clause-type taxonomy — do we start with the candidate list in §5 and expand, or wait for clause-extraction capability discovery to propose its own?
- **Q5.** Retrieval-chunk schema in Azure AI Search — out of scope for this doc but needed before §5.3 is implementable. Propose a follow-up doc: `retrieval-index.md`.
- **Q6.** Parsed-email-body inline threshold — 256 KB is a guess. Want to see a distribution from pilot data before committing.
- **Q7.** Do we need a separate `CorrespondenceLetter` category for formal letters that aren't emails but aren't schedules either? Currently falls under `Correspondence` but conflates with email bodies.
- **Q8.** Amendment representation — is an Amendment a Document whose Clauses carry `supersedes_clause_id` back to the master agreement, or is there a first-class `amendment` entity that owns the change set? Proposed: the former, for simplicity. Revisit if §6.2 (change log) gets complex.

---

## 9. What's Next

Before any code:

1. Human review of this proposal (review-gates §2, item 7 — database schema).
2. Resolve Q1–Q8 or explicitly defer each with a note.
3. Companion doc: `retrieval-index.md` covering the Azure AI Search index schema and the chunk ↔ clause linkage.
4. Companion doc: lifecycle state machines for Contract, Claim, Variation, RFI, Submittal, Obligation (§6.22) — needed before the `lifecycle_state` columns above are migrated.
5. Only then: migrations, Zod schemas in `packages/domain/`, and NestJS entity classes.
