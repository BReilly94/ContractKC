# Open Questions Log

Claude Code logs ambiguities and unresolved decisions here. Each entry must have a named human owner and a by-when date.

---

## Template

```
### Q-NNN: Short question title
- **Raised by:** [Claude Code / human name]
- **Raised date:** YYYY-MM-DD
- **Context:** Where in the build this came up. Link to SOW section or file.
- **Question:** One clear question.
- **Options:** (if Claude Code can propose options)
  - Option A: ...
  - Option B: ...
- **Owner:** [name]
- **Needed by:** YYYY-MM-DD
- **Status:** Open / Resolved
- **Resolution:** (filled in on close)
```

---

## Discovery-Phase Questions (carried over from SOW section 11)

### Q-001: Technica's ERP product and integration surface

- **Raised by:** SOW section 11
- **Raised date:** 2026-04-21
- **Context:** Section 6.14 — ERP read-only linkage for Claim Readiness Score quantum component.
- **Question:** Which ERP does Technica run, and what integration surface is available (REST API, ODBC, scheduled file export)?
- **Owner:** [IT — name TBD]
- **Needed by:** End of Phase 1 discovery
- **Status:** Open

### Q-002: Bluebeam rendering constraints

- **Raised by:** SOW section 11
- **Raised date:** 2026-04-21
- **Context:** Section 5.1 — Bluebeam PDFs with markups preserved are a Phase 1 supported format.
- **Question:** Does PDF.js preserve Bluebeam-specific annotation types, or is a dedicated renderer required?
- **Owner:** [Tech lead]
- **Needed by:** Sprint 1 of Phase 1
- **Status:** Open
- **Phase 1 note:** Document detail page currently downloads originals for native preview; inline viewer deferred.

### Q-003: Mobile DWG viewer

- **Raised by:** SOW section 11
- **Raised date:** 2026-04-21
- **Context:** Section 5.1, 8.2 — DWG viewing on mobile for site supervisors.
- **Question:** Licensed DWG viewer vs. server-side conversion to PDF/raster. Budget and license implications?
- **Owner:** [Tech lead + Procurement]
- **Needed by:** Sprint 2 of Phase 1
- **Status:** Open

### Q-004: Multi-language contract volume

- **Raised by:** SOW section 11
- **Raised date:** 2026-04-21
- **Context:** Section 7.7 — French / Spanish contract handling.
- **Question:** What percentage of in-scope contracts are in French or Spanish? Affects whether multi-language ships in Phase 1 or is deferred.
- **Owner:** [Business Manager / Operations]
- **Needed by:** End of Phase 1 discovery
- **Status:** Open
- **Phase 1 note:** All prompts and mock regressions are English-only; `contract.language` column exists for per-contract routing when the multilingual embedding + prompt variants land.

### Q-005: Inbound email parser — SendGrid vs. Azure-native

- **Raised by:** SOW section 11
- **Raised date:** 2026-04-21
- **Context:** Section 5.2 — managed inbound email parsing.
- **Question:** Is SendGrid Inbound Parse acceptable to IT security, or must we ship on Azure-native inbound parsing in Phase 1?
- **Owner:** [IT Security]
- **Needed by:** Sprint 1 of Phase 1
- **Status:** Open
- **Phase 1 note:** Webhook HMAC-SHA256 verification is in place; `InboundEmailProvider` is abstracted via the ingestion app so an Azure-native replacement is a module swap.

### Q-006: Evidentiary signing of exports

- **Raised by:** SOW section 11
- **Raised date:** 2026-04-21
- **Context:** Section 5.13 — Data Portability.
- **Question:** Are contract data exports required to be cryptographically signed / timestamped for evidentiary use? Affects chain-of-custody manifest design.
- **Owner:** [Legal Counsel]
- **Needed by:** Pre-Phase-1 go-live
- **Status:** Open
- **Phase 1 note:** Manifest already records SHA-256 of every file. Adding a detached signature and/or RFC 3161 timestamp is a manifest-field addition.

### Q-007: Pilot contract selection

- **Raised by:** SOW section 11
- **Raised date:** 2026-04-21
- **Context:** SOW 12.31 — pilot contract for Phase 1.
- **Question:** Which contract(s)? Criteria: active but past initial chaos, engaged PM, stable client relationship, not the biggest or most sensitive.
- **Owner:** [VP Operations]
- **Needed by:** Phase 1 midpoint
- **Status:** Open

---

## Email Ingestion Questions (from email-ingestion.md)

### Q-EI-1: Encrypted attachments — paired documents or versions?

- **Raised by:** email-ingestion.md §13
- **Raised date:** 2026-04-21
- **Context:** §5.2 edge case.
- **Question:** When an authorised user decrypts a password-protected attachment, is the decrypted result a new Document paired to the encrypted original, or a new version of the original?
- **Owner:** [Legal Counsel]
- **Needed by:** Before encrypted-attachment flow ships
- **Status:** Open
- **Phase 1 note:** Detection + review queue path built; decryption flow itself is a Phase 1 follow-on. Proposal: paired documents.

### Q-EI-2: Malware scanner choice for Azure

- **Raised by:** email-ingestion.md §13
- **Raised date:** 2026-04-21
- **Context:** §5.2 / security.md §6.
- **Question:** Defender for Storage on-ingest, or a dedicated scanner on a queue worker?
- **Owner:** [IT Security]
- **Needed by:** Azure cutover
- **Status:** Open
- **Phase 1 note:** ClamAV runs locally via INSTREAM. Azure impl throws `NotSupportedInLocalError` — swap is a single file.

### Q-EI-3: Phase 1 auto-reply

- **Raised by:** email-ingestion.md §13
- **Raised date:** 2026-04-21
- **Context:** §5.2.9.
- **Question:** Given no outbound stack until Phase 2, is a minimal send-via-SendGrid acceptable for confirmation auto-reply, or defer entirely?
- **Owner:** [Commercial Lead]
- **Needed by:** Pre-Phase-1 go-live
- **Status:** Open
- **Phase 1 decision:** Deferred. No outbound mail in Phase 1 scope.

### Q-EI-4: Shared-link auto-pull scope

- **Raised by:** email-ingestion.md §13
- **Raised date:** 2026-04-21
- **Context:** §5.2 edge case.
- **Question:** What Microsoft Graph consent is acceptable in Technica's tenant for OneDrive/SharePoint auto-pull?
- **Owner:** [IT Security]
- **Needed by:** Before auto-pull ships
- **Status:** Open
- **Phase 1 decision:** All shared-link detections route to the review queue with `ManualCapturePending`. Auto-pull adds behind the same `shared_link_capture.state` machine.

### Q-EI-5: Bounce behaviour on alias rename

- **Raised by:** email-ingestion.md §13
- **Raised date:** 2026-04-21
- **Context:** §5.2 lifecycle.
- **Question:** After rename, does the old alias bounce or forward?
- **Owner:** [Operations]
- **Needed by:** Pre-Phase-1 go-live
- **Status:** Open
- **Phase 1 decision:** Bounce (cleaner audit trail). `email_alias.deactivation_reason='AliasRenamed'` column already in schema.

### Q-EI-6: Review queue assignment model

- **Raised by:** email-ingestion.md §13
- **Raised date:** 2026-04-21
- **Context:** §5.2.
- **Question:** Push-assigned (default assignee per contract) or pull (claim from queue)?
- **Owner:** [Operations + Product]
- **Needed by:** Pre-Phase-1 go-live
- **Status:** Open
- **Phase 1 decision:** Pull. `assigned_to_user_id` column exists on `email_review_queue_item` for a future push model.

---

## Phase 1 build-time questions (Claude Code discovered)

### Q-P1-1: Embedding provider for retrieval

- **Raised by:** Slice G
- **Raised date:** 2026-04-22
- **Context:** `packages/search/embeddings.ts`.
- **Question:** Local hash-based embeddings are non-semantic and only exercise the plumbing. What do we use in dev before Azure OpenAI is wired? Options:
  - Azure OpenAI `text-embedding-3-large` with dim=3072.
  - Local `@xenova/transformers` + MiniLM-L6-v2 (dim=384) — cheap but heavy install.
  - Continue with hash embeddings until Azure cutover, accepting that semantic search regression queries won't work.
- **Owner:** [Brian]
- **Needed by:** Before semantic regression suite is relied on
- **Status:** Open
- **Phase 1 decision:** Hash-based placeholder, flagged in code as `// ASSUMPTION:`.

### Q-P1-2: Clause char-offset alignment

- **Raised by:** Slice K
- **Raised date:** 2026-04-22
- **Context:** Clauses are extracted by the LLM without precise char offsets against the document text layer. Deep-linking in the viewer relies on heading/first-line text search.
- **Question:** Do we build a layout-alignment pass that maps LLM-extracted clauses back to original offsets, or accept text-search deep-linking as good enough for Phase 1?
- **Owner:** [Tech lead]
- **Needed by:** Phase 2 if alignment becomes a viewer complaint
- **Status:** Open
- **Phase 1 decision:** Accept text-search fallback.

### Q-P1-3: Scanned PDF rasterization in OCR

- **Raised by:** Slice E
- **Raised date:** 2026-04-22
- **Context:** `packages/ocr/local-impl.ts` — PDFs without a text layer currently return `provider: 'tesseract'` with zero pages; we do not rasterize.
- **Question:** Pick a rasterizer: `pdf2pic`, `pdftoppm` via `popplerutils`, or Azure Document Intelligence from the start.
- **Owner:** [Tech lead]
- **Needed by:** Before any scanned-PDF contract hits the pilot
- **Status:** Open
- **Phase 1 decision:** Document-only path; rasterization gated on real scanned-PDF fixtures appearing.

### Q-P1-4: Auditor export UI

- **Raised by:** Slice P review
- **Raised date:** 2026-04-22
- **Context:** §5.11 Auditor role can export the audit log with hash chain. The table is append-only with hashes intact — no endpoint currently exposes a CSV export.
- **Question:** Priority of building the Auditor export endpoint in Phase 1 vs. Phase 2.
- **Owner:** [Audit + Product]
- **Needed by:** Pre-production audit walkthrough
- **Status:** Open
- **Phase 1 decision:** Deferred to early Phase 2 — the data is available; a consumer UX is thin.
