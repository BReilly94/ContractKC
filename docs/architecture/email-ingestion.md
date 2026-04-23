# Email Ingestion — End-to-End Plan (Phase 1 §5.2)

**Status:** Draft plan for review. No code.
**Scope:** CLAUDE.md §5.2 plus the three Phase 1 edge cases (encrypted attachments, shared-link content, `.ics` invites).
**Companion docs:** `data-model.md` (Email / Document entities), `retrieval-index.md` (TBW).

---

## 1. Scope & Upstream Dependencies

**In scope for this plan:**
- DNS and MX setup for `contracts.technicamining.com`.
- Address provisioning per contract (canonical + human-readable alias).
- Inbound parse pipeline from provider webhook → immutable storage → parsed persistence → search index.
- Sender trust, duplicate detection, thread reconstruction.
- Malware scan, AI privileged-content pre-screen.
- Edge cases: password-protected attachments, shared-link content, calendar invites.
- Address lifecycle: activation, suspension, deactivation, bounce behavior.

**Out of scope here (but referenced):**
- Outbound mail from the project address — Phase 2 (§6.16).
- Attachment-derived clause extraction — runs downstream of ingestion, covered by the clause-extraction capability.
- Evidence bundle export — Phase 2 (§6.11).

**Hard dependencies that must resolve before build:**

| Dependency | Blocking | Owner | Open Q |
|---|---|---|---|
| SendGrid Inbound Parse vs. Azure-native decision | Infra choice | Brian (input: IT Security) | Q-005 |
| DNS ownership, TTLs, change window | Production cutover | Infra team | — |
| Malware scanner selection (Defender for Storage / external) | Worker integration | Brian (input: IT Security) | New Q |
| TLS cert issuance for `contracts.technicamining.com` | MX standup | Infra team | — |

Until Q-005 is answered, everything below assumes SendGrid Inbound Parse; a switch to Azure-native changes the webhook contract and the signing mechanism, not the rest of the pipeline.

---

## 2. DNS & Email Infrastructure

Owned by Technica's infra team; CKB owns the handshake with it.

### 2.1 Records on `contracts.technicamining.com`

| Record | Value | Purpose |
|---|---|---|
| MX | SendGrid Inbound Parse host, priority 10 | Route inbound mail. |
| SPF (TXT) | `v=spf1 include:sendgrid.net -all` | Authorize SendGrid to handle mail for this domain. Strict `-all` since this subdomain is ingestion-only. |
| DMARC (TXT) | `v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@technicamining.com; ruf=mailto:...; fo=1` | Phase 1 starts at `quarantine`. Move to `reject` once we've observed a clean reporting window. |
| DKIM | Inbound path doesn't require DKIM on our domain. For Phase 2 outbound, set up DKIM key infrastructure now. | |
| TLSRPT (TXT) | `v=TLSRPTv1; rua=mailto:tls-reports@technicamining.com` | Reporting for TLS negotiation failures. |
| MTA-STS | Policy file hosted over HTTPS, DNS TXT pointing to it | Enforces TLS on inbound. |

### 2.2 Subdomain discipline

Use **`contracts.technicamining.com`** exclusively for contract ingestion. Do not mix with any other mail function on this subdomain. Rationale: SPF, DMARC, and reputation management get ugly when one subdomain handles ingestion plus outbound plus forwarding.

### 2.3 Catch-all vs. explicit aliases

Provider-side mailbox configuration should accept **anything** at the subdomain and defer routing to our webhook — we do alias → contract lookup in application code, not in DNS. This means no DNS change is needed when a new contract is created.

### 2.4 Reserved addresses

Reserved and blocked from contract assignment:
- `postmaster@`, `abuse@`, `noreply@`, `admin@`, `root@`, `webmaster@`, `hostmaster@`
- `contract-*` namespace reserved for canonical addresses (no human alias can start with `contract-`).

---

## 3. Address Provisioning

No DNS work per contract. Entirely application-level.

### 3.1 Address shape

Each contract gets **two** addresses, both routed to the same ingestion target:

1. **Canonical address** — `contract-<ulid>@contracts.technicamining.com`. Generated at contract creation, never changes.
2. **Human alias** — user-chosen, lowercase alphanumeric + hyphens, minimum 4 chars, max 48. Uniqueness check at the alias-table level, not DNS.

Both addresses resolve via a lookup table (see §5.1). The canonical form is always valid even if the alias is renamed or disabled.

### 3.2 Alias rules

- One **active** alias per contract at a time. Historical aliases remain in the lookup table with `deactivated_at`, so old correspondence remains attributable even after rename.
- Alias cannot collide with any reserved address (§2.4) or with any existing alias in any state.
- Changing the alias logs the change to the audit trail and does not invalidate the canonical.

### 3.3 Bid-handoff pre-population (Phase 2 hook)

Spec the alias-generation interface now so Phase 2 bid-handoff can propose an alias based on bid name. No build in Phase 1.

---

## 4. Inbound Parse Pipeline — High-Level Flow

```
       ┌────────────────┐
       │ Inbound email  │
       └───────┬────────┘
               │ MTA → provider (SendGrid)
               ▼
       ┌────────────────────────┐
       │ Provider Inbound Parse │
       └───────┬────────────────┘
               │ HTTPS POST (signed)
               ▼
       ┌────────────────────────────┐
       │ CKB webhook (thin)         │
       │  - verify signature        │
       │  - stash raw to blob (tmp) │
       │  - enqueue ingestion job   │
       │  - 200 fast                │
       └───────┬────────────────────┘
               │ Service Bus queue
               ▼
       ┌───────────────────────────────────────┐
       │ Ingestion worker (BullMQ)             │
       │  1. resolve recipient → contract       │
       │  2. hash raw .eml, store immutably     │
       │  3. parse headers / bodies / attchs    │
       │  4. fan-out: attachment scan jobs      │
       │  5. thread reconstruct                 │
       │  6. duplicate detect                   │
       │  7. sender trust check                 │
       │  8. AI privileged pre-screen           │
       │  9. detect shared-link / .ics         │
       │ 10. persist email + documents          │
       │ 11. route: index OR review queue       │
       │ 12. audit log + metrics                │
       └───────────────────────────────────────┘
```

The webhook does almost nothing synchronously. It must return 200 within ~5 seconds or SendGrid retries (and retries stack). All real work is in the worker, where we control retry, ordering, and idempotency.

### 4.1 Idempotency

The worker keys idempotency on `sha256(raw_eml_bytes)` + `recipient_contract_id`. A job that sees an already-ingested `(hash, contract)` pair becomes a no-op with a debug log. This makes provider retries safe and makes replay safe (§10.3).

---

## 5. Database Schema — Additions to `data-model.md`

`data-model.md` §4 covers the `email` entity and §3 covers `document`. The following tables are new and specific to ingestion.

### 5.1 `email_alias`

Maps addresses to contracts. Central to address routing.

| Field | Type | Notes |
|---|---|---|
| `local_part` | string PK | The part before `@`. Indexed, case-insensitive. |
| `contract_id` | FK → `contract` | |
| `alias_type` | enum | `Canonical` or `Human`. |
| `created_at` | timestamptz | |
| `deactivated_at` | timestamptz | Nullable. When set, incoming mail bounces per the contract's `bounce_message`. |
| `deactivation_reason` | enum | `ContractArchived`, `AliasRenamed`, `ManualDisable`. |

### 5.2 `email_thread`

Referenced in `data-model.md` §4.1; full shape here.

| Field | Type | Notes |
|---|---|---|
| `id` | ULID PK | |
| `contract_id` | FK | Threads never span contracts (Non-Negotiable #6). |
| `root_email_id` | FK → `email` | First email in the thread on this contract. |
| `subject_normalized` | string | Subject stripped of `Re:` / `Fwd:` / ticket tags. Used as a secondary matching signal when headers are missing. |
| `last_activity_at` | timestamptz | |
| `created_at` | timestamptz | |

### 5.3 `sender_trust_entry`

Per-contract sender approval list. A separate `global_sender_trust_entry` holds tenant-wide allow/deny that applies across all contracts (e.g., a blocked spammer domain).

| Field | Type | Notes |
|---|---|---|
| `id` | ULID PK | |
| `contract_id` | FK, nullable | Null for global entries. |
| `match_type` | enum | `ExactAddress`, `Domain`. |
| `match_value` | string | Case-insensitive. |
| `trust_state` | enum | `Approved`, `Denied`. |
| `added_by_user_id` | FK | |
| `added_at` | timestamptz | |
| `reason` | string, nullable | |

Match priority: contract-scoped exact → contract-scoped domain → global exact → global domain → default (review queue).

### 5.4 `email_review_queue_item`

One row per email that couldn't auto-index.

| Field | Type | Notes |
|---|---|---|
| `id` | ULID PK | |
| `email_id` | FK | |
| `reason` | enum | `UnapprovedSender`, `PasswordProtectedAttachment`, `SharedLinkPending`, `PrivilegedContent`, `MalwareSuspect`, `ManualReview`. |
| `reason_detail` | string | Free-text. |
| `state` | enum | `Pending`, `Approved`, `Rejected`, `Actioned`. |
| `assigned_to_user_id` | FK, nullable | |
| `resolved_at` | timestamptz, nullable | |
| `resolved_by_user_id` | FK, nullable | |
| `resolution_notes` | string, nullable | |
| `created_at` | timestamptz | |

Resolution writes to `audit_log`. Rejecting an email does **not** delete the raw `.eml` — originals are immutable (Non-Negotiable #3); rejection only means the email is excluded from indexing and user-facing views.

### 5.5 `shared_link_capture`

One row per shared-link reference detected in an email body.

| Field | Type | Notes |
|---|---|---|
| `id` | ULID PK | |
| `email_id` | FK | |
| `provider` | enum | `OneDrive`, `SharePoint`, `WeTransfer`, `Dropbox`, `GoogleDrive`, `Other`. |
| `url` | string | Stored as-received. |
| `capture_state` | enum | `NotApplicable`, `AutoPullPending`, `AutoPullComplete`, `AutoPullFailed`, `ManualCapturePending`, `ManualCaptureComplete`. |
| `resulting_document_id` | FK → `document`, nullable | Set when capture completes. |
| `failure_reason` | string, nullable | |
| `created_at` | timestamptz | |
| `captured_at` | timestamptz, nullable | |

### 5.6 `calendar_event`

Parsed from `.ics` attachments.

| Field | Type | Notes |
|---|---|---|
| `id` | ULID PK | |
| `email_id` | FK | |
| `contract_id` | FK | |
| `ics_uid` | string | Unique per contract. |
| `summary` | string | |
| `description` | text | |
| `starts_at` | timestamptz | |
| `ends_at` | timestamptz | |
| `organizer_email` | string | |
| `location` | string | |
| `sequence` | int | ICS sequence number — later sequence wins on update. |
| `promoted_to_deadline_id` | FK → `deadline`, nullable | Set when Contract Owner promotes via the verification gate. |
| `created_at` | timestamptz | |

### 5.7 `inbound_email_event`

Raw webhook log, separate from the `email` table. Used for replay and debugging; kept for 90 days.

| Field | Type | Notes |
|---|---|---|
| `id` | ULID PK | |
| `received_at` | timestamptz | |
| `provider` | enum | `SendGrid`, future `AzureNative`. |
| `raw_payload_blob_path` | string | The provider's raw POST body, content-addressed. |
| `signature_valid` | bool | |
| `resulting_email_id` | FK, nullable | Set when ingestion succeeds. |
| `worker_status` | enum | `Queued`, `Processing`, `Succeeded`, `Failed`, `DeadLettered`. |
| `last_error` | string, nullable | |
| `attempt_count` | int | |
| `correlation_id` | string | Propagated into every downstream log. |

This table is operational, not user-facing. Retention is short by design.

---

## 6. API Endpoints

NestJS controllers; grouped by concern. All endpoints return `x-correlation-id` and log under it.

### 6.1 Webhook (provider-facing)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/webhooks/inbound-email/sendgrid` | Shared secret + signature verification | SendGrid Inbound Parse callback. Stashes raw payload, enqueues job, returns 200 fast. |

Hardening:
- Signature verification against a Key Vault-held secret (Non-Negotiable #8).
- Rate limiting per source IP at the gateway.
- Request-size cap at the ingress (match SendGrid's 30 MB payload limit).
- Fail-closed on signature mismatch, log as a security event.

### 6.2 Address management (contract admin)

| Method | Path | Purpose |
|---|---|---|
| POST | `/contracts/:id/email-addresses` | Provision a human alias. Validates uniqueness and reserved list. |
| GET | `/contracts/:id/email-addresses` | List canonical + current alias + historical. |
| PATCH | `/contracts/:id/email-addresses/:localPart` | Rename alias (deactivates old, activates new). |
| DELETE | `/contracts/:id/email-addresses/:localPart` | Deactivate alias (canonical cannot be deleted, only deactivated with contract). |

### 6.3 Email retrieval

| Method | Path | Purpose |
|---|---|---|
| GET | `/contracts/:id/emails` | List emails, paginated, filterable by thread/date/sender/state. |
| GET | `/emails/:id` | Detail view with parsed body and attachment list. |
| GET | `/emails/:id/raw-eml` | Download the immutable `.eml`. Access logged. |
| GET | `/email-threads/:id` | Full thread view. |

Authorization: every route joins `contract_access` per `.claude/rules/security.md` §2. Individual revocation (§6.24) applies.

### 6.4 Review queue

| Method | Path | Purpose |
|---|---|---|
| GET | `/contracts/:id/review-queue` | List queue items. Filter by reason. |
| POST | `/review-queue/:id/approve` | Approve → email moves to indexed state. |
| POST | `/review-queue/:id/reject` | Reject → email excluded from indexing. Original retained. |
| POST | `/review-queue/:id/unlock-attachment` | Accepts password for encrypted attachments; triggers re-processing. |
| POST | `/review-queue/:id/attach-shared-link-content` | Accepts a file uploaded manually by a user as the resolved content of a shared-link reference. |

### 6.5 Sender trust management

| Method | Path | Purpose |
|---|---|---|
| GET | `/contracts/:id/sender-trust` | List entries. |
| POST | `/contracts/:id/sender-trust` | Add entry (approved/denied, address/domain). |
| DELETE | `/contracts/:id/sender-trust/:entryId` | Remove. |
| *(admin-only)* POST | `/admin/global-sender-trust` | Global entries (KC Admin). |

### 6.6 Calendar event promotion

| Method | Path | Purpose |
|---|---|---|
| POST | `/calendar-events/:id/promote` | Contract Owner promotes an `.ics` event to a verified Deadline. |

---

## 7. Worker Pipeline — Per-Stage Detail

All stages are idempotent. All stages emit metrics and audit records keyed on the correlation ID assigned at webhook receipt.

### 7.1 Resolve recipient → contract

- Parse recipient addresses from the envelope (`To`, `Cc`, `Bcc` if present, and SendGrid's `to` envelope hint).
- Match each against `email_alias` by `local_part`.
- Expected: exactly one match. Multiple matches (email addressed to two contracts) → clone the email into each contract's ingestion path. Each clone gets its own `email` row; the immutable blob is shared (content-addressed).
- Zero matches → bounce with the default unknown-address message and log an `inbound_email_event` with `Failed` status.

### 7.2 Immutable raw storage

- Compute `sha256` over the exact provider-delivered bytes.
- Write to blob at `sha256/<hash>/raw.eml` with `If-None-Match: *` semantics (don't overwrite). Already-present is success.
- Record `raw_eml_sha256` and `raw_eml_blob_path` on the `email` row.
- This is the Non-Negotiable #3 anchor. From here on, every downstream artifact is derivable.

### 7.3 Parse

- Use a vetted MIME parser (e.g., `mailparser`). No custom parsing.
- Extract: headers (all, not a subset), text body, HTML body, attachments.
- Store HTML body as a blob if over threshold (proposed 256 KB); text body inline.
- Do **not** follow URLs in the parser (XXE/SSRF surface).

### 7.4 Attachment extraction

For each attachment:
1. Stream to blob under `sha256/<hash>/...`.
2. Create a `document` row with `source = EmailIngestion`, `source_email_id`, category `Correspondence` (or `Other` if unclassifiable until categorization runs).
3. Enqueue malware scan job. Document is `malware_scan_status = Pending` until scan completes; it is not retrievable until `Clean`.
4. If attachment is an `.ics`, also enqueue calendar parse.
5. If attachment is password-protected (detected by parser — encrypted PDF, encrypted ZIP, encrypted DOCX), set `encryption_state = EncryptedPending` and raise a `PasswordProtectedAttachment` review-queue item.

### 7.5 Thread reconstruction

Per CLAUDE.md §5.2.5:

1. Look up `In-Reply-To` message-ID among existing emails in the **same contract**. Hit → join that thread.
2. If no hit, walk `References` in reverse (newest → oldest). First hit → join that thread.
3. If still no hit, try normalized-subject + within-N-days match as a weak signal (off by default; enable per contract if header stripping by a mail gateway is a known issue).
4. If no match, create a new thread rooted at this email.

Cross-contract threading is explicitly not allowed — a reply arriving at a different contract's address starts a new thread on that contract even if headers chain back.

### 7.6 Duplicate detection

- Key: `(contract_id, rfc_message_id)` → exact duplicate.
- Secondary: `(contract_id, raw_eml_sha256)` → catches resends where headers were regenerated.
- Duplicates set `duplicate_of_email_id` on the new row and are not indexed. The raw `.eml` is still stored (idempotent content-addressed write is cheap).

### 7.7 Sender trust evaluation

- Run the priority stack from §5.3.
- `Approved` → continue to index path.
- `Denied` → mark email `sender_trust_state = Unapproved`, do not index, raise review-queue item `UnapprovedSender`. Original still stored.
- No match → `ReviewQueue` state, same treatment.

### 7.8 AI privileged / sensitive pre-screen

- Capability: `packages/ai/capabilities/email-prescreen/`. Routes to Claude Sonnet per `.claude/rules/ai-layer.md` §4.
- Input: subject + first N chars of body text (bounded context for cost — `.claude/rules/ai-layer.md` §10).
- Output: `{ privileged: bool, confidence, reasoning, cited_signals }`.
- Privileged → `privileged_flag = true` on email, route to restricted-access tier, add review-queue item `PrivilegedContent`.
- Low-confidence results with ambiguous signals also go to review rather than auto-accept.

### 7.9 Shared-link detection

- Regex + URL-parse pass over body text and HTML.
- Detected providers (§5.5) create `shared_link_capture` rows with `capture_state = AutoPullPending` (if provider supports Technica-tenant auth) or `ManualCapturePending` (WeTransfer public, unknown domains).
- Auto-pull worker fetches via appropriate SDK (Microsoft Graph for OneDrive / SharePoint). Results land as `document` rows linked to the originating email.
- Manual-capture items route to review queue.

### 7.10 `.ics` parsing

- ICS parser produces `calendar_event` rows.
- Event remains unverified until a Contract Owner promotes it via `/calendar-events/:id/promote` (§6.6). Promotion creates a Deadline via the standard verification gate — Non-Negotiable #2.

### 7.11 Persist + index

- Final commit of the `email` row transitions `sender_trust_state` to `Approved` and triggers search indexing.
- Index write is to the contract's isolated Azure AI Search namespace (Non-Negotiable #6).
- Chunking for retrieval: header block, body paragraphs, attachment-text overflow. Chunk → clause/email linkage follows `data-model.md` §5.2 (retrieval-index doc forthcoming).

### 7.12 Auto-reply (optional)

- Per-contract setting `email_auto_reply_enabled`.
- On successful ingestion of an email from an approved sender, send a confirmation reply through the Phase 2 outbound stack — or, in Phase 1 before outbound exists, skip (auto-reply is optional; default off in Phase 1).
- Never auto-reply to auto-replies (parse `Auto-Submitted` header, List-ID, mailer-daemon patterns).
- Never auto-reply to rejected or review-queued messages.

---

## 8. Edge Cases — Handling Detail

### 8.1 Password-protected attachments

1. Parser flags encryption (PDF `/Encrypt`, ZIP password, DOCX encrypted).
2. Store encrypted original under `sha256/<hash>/raw.<ext>` — never unlock in place.
3. Raise review-queue item `PasswordProtectedAttachment`.
4. Authorized user provides the password via `POST /review-queue/:id/unlock-attachment`.
5. Worker decrypts into a *new* blob at a new hash; stored alongside the encrypted original. Both are preserved as `document_version` entries or as paired documents (proposal: paired documents, because the decrypted version has different content semantics — see open question Q-EI-1).
6. Audit: the unlock event is logged with user, timestamp, encrypted hash, decrypted hash.

### 8.2 Shared-link content

- OneDrive / SharePoint via Microsoft Graph using the CKB service principal, which must have delegated access to Technica's tenant. Lives only in this context — no cross-tenant auth.
- WeTransfer / Dropbox public links: fetch if the URL resolves without auth; otherwise manual capture.
- Google Drive: only if link is public; manual capture otherwise.
- Provenance: the captured document always carries a link back to the originating email and the original URL.
- If the link expires between detection and capture, record `capture_state = AutoPullFailed` with the reason — the originating email and captured URL remain.

### 8.3 Calendar invites

- Standard `.ics` parse. Non-standard fields ignored with a warning.
- Recurring events: store the RRULE; expand lazily at display/promotion time, do not pre-materialize.
- Cancellations (`METHOD:CANCEL`) mark the prior event as cancelled but do not delete — audit trail.

### 8.4 Oversized mail

- SendGrid enforces a 30 MB payload cap. Anything larger bounces before it reaches us.
- For mail within the cap but with very large attachments: stream-to-blob from the webhook, never load fully into memory. Watch RSS on the worker.

### 8.5 Non-UTF8 encodings

- Headers: per RFC 2047, decoded via the parser.
- Body: charset per `Content-Type`; fall back to `chardet`-style detection. Never silently drop characters.

### 8.6 Loop protection

- Parse `Auto-Submitted`, `X-Auto-Response-Suppress`, `Precedence: bulk/auto_reply/list` headers.
- Our own outbound auto-replies carry `Auto-Submitted: auto-replied`. If we see it on inbound, no further auto-reply is sent.

### 8.7 Mis-addressed mail

- Unknown local part (no alias match): bounce with a configurable message pointing to a help contact. Log as `inbound_email_event` with `Failed` status and a specific code for ops.
- Active alias whose contract is archived: bounce with the contract-configured archived-bounce message (§9.3).

---

## 9. Address Lifecycle

### 9.1 Activation

Happens on contract creation. Canonical and initial alias are created in `email_alias` as `alias_type = Canonical / Human`, `deactivated_at = NULL`.

### 9.2 Suspension

Contract moves to `Issue-in-Progress` or `Closeout`: alias remains active, ingestion continues. No suspension in Phase 1.

### 9.3 Deactivation

Contract moves to `Archived`:
- All aliases' `deactivated_at` is set.
- A `bounce_message` string on the contract controls the bounce body.
- Inbound mail to any of the contract's deactivated aliases is rejected at the worker (we accept delivery, then write an `inbound_email_event` with `Failed` and bounce back through the provider — SendGrid supports this via its SMTP relay; Azure-native equivalent TBD).
- The bounce includes contract archival date, a contact route, and a statement that further correspondence should be directed elsewhere.

### 9.4 Alias rename

Rename = deactivate old alias, activate new alias. Both remain in `email_alias` so historical `To:` headers resolve correctly. Old alias's `deactivation_reason = AliasRenamed`. Inbound mail to the old alias after rename: either bounce or forward to the new alias — default to bounce, configurable per contract (propose: bounce, forces senders to update, cleaner audit trail).

---

## 10. Observability & Ops

### 10.1 Metrics

Per-minute and per-contract rollups:
- Inbound rate (emails received / bounced / rejected).
- Webhook latency p50 / p95 / p99.
- End-to-end latency (webhook receipt → searchable). Target from SOW §9: < 2 min.
- Ingestion failure rate by stage.
- Review queue depth.
- Duplicate rate.
- Malware hits.
- AI pre-screen cost (tokens × routing — `.claude/rules/ai-layer.md` §3).

### 10.2 Alerts

- Webhook signature failures spike → security incident.
- Webhook 5xx rate > 1% over 5 min → worker issue.
- End-to-end latency p95 > 2 min over 10 min → ops page.
- Review queue > N items per contract (configurable per contract, default 50).
- Malware hit → Sec team paged.

### 10.3 Replay

The raw webhook payload in `inbound_email_event` is authoritative for replay. Worker re-run against a payload is idempotent (§4.1). Use case: new parser version, retroactive fix of a misclassified sender.

### 10.4 Runbooks

`docs/runbooks/` entries required before production:
- `email-ingestion-failure.md` — stage-by-stage diagnosis.
- `malware-scan-hit.md` — what to do when an attachment is flagged.
- `review-queue-backlog.md` — triage at depth.
- `sender-trust-mistake.md` — reversing an over-aggressive deny.

---

## 11. Non-Negotiables Checklist

| # | How this plan honors it |
|---|---|
| #1 Citations mandatory | Emails become citation targets via retrieval chunks pointing at `email_id`. |
| #2 Human verification gates | `.ics` → deadline requires Contract Owner promotion. Review queue items require human approval. |
| #3 Originals immutable | `raw_eml_sha256` + content-addressed blob path; derived artifacts are separate. No UPDATE path. |
| #4 Append-only audit | Every ingestion decision, unlock, review action, alias change writes to `audit_log`. |
| #5 Default deny on access | Every email/attachment retrieval route joins `contract_access`. |
| #6 Contract-scoped retrieval | Index per-contract namespace; threading never crosses contracts. |
| #7 No browser storage | N/A backend. |
| #8 No secrets in code | SendGrid signature secret, Graph API credentials, DKIM keys all in Key Vault. |
| #9 Diary lock | N/A here. |
| #10 Auto-BCC | N/A inbound; relevant for Phase 2 outbound. |

---

## 12. Build Order (Suggested)

Two-track plan — infra runs in parallel to app build.

**Infra track (owned by infra team, sequenced by their change windows):**
1. Subdomain + MX + SPF + DMARC `p=none` + DMARC reporting destinations.
2. MTA-STS + TLSRPT.
3. Provider account (SendGrid Inbound Parse) or Azure-native equivalent once Q-005 resolves.
4. Tighten DMARC to `quarantine` after one clean reporting week.

**App track:**
1. Schema + migrations for Email, Document, `email_alias`, `inbound_email_event`.
2. Thin webhook + blob stash + queue enqueue. Smoke-test against a test address.
3. Ingestion worker — minimum pipeline: resolve → hash → store → parse → persist. No attachments yet.
4. Attachment extraction + malware scan integration.
5. Thread reconstruction.
6. Duplicate detection.
7. Sender trust + review queue.
8. AI privileged pre-screen (requires `packages/ai` scaffolding).
9. `.ics` handling + calendar event promotion.
10. Shared-link detection + auto-pull (Graph) + manual-capture path.
11. Password-protected attachment flow.
12. Alias rename / deactivation / bounce behaviors.
13. Observability: metrics, alerts, runbooks.
14. Load test to SOW §9 targets, then promote.

Gating: nothing goes to production until steps 1–12 on the app track are green *and* the infra track is at DMARC `quarantine` stable.

---

## 13. Open Questions Specific to This Plan

- **Q-EI-1.** Encrypted + decrypted attachments — paired documents or versions of the same document? Proposal: paired, because the content hashes differ and evidentiary integrity wants both side-by-side. Confirm with Legal (informs evidence-bundle packaging).
- **Q-EI-2.** Malware scanner choice — Defender for Storage on-ingest, or a dedicated scanner (e.g., Sophos, ClamAV on a queue worker)? Affects cost and latency. Input from IT Security.
- **Q-EI-3.** Auto-reply in Phase 1 — given no outbound stack until Phase 2, is a minimal transactional send-via-SendGrid acceptable, or do we simply defer auto-reply entirely to Phase 2? Proposal: defer.
- **Q-EI-4.** Shared-link auto-pull — what scope of Microsoft Graph consent is acceptable in Technica's tenant? Input from IT Security.
- **Q-EI-5.** Bounce behavior on old-alias-after-rename — bounce vs. forward. Proposal: bounce. Confirm with Ops.
- **Q-EI-6.** Review queue assignment — does a queue item have a default assignee (Contract Administrator?) or is it pull-based? Affects notification design.
