# Security — Engineering Rules

## 1. Identity & Auth

- Azure AD / Entra ID via OIDC. Tokens validated on every request.
- MFA required.
- AD FS federation is a documented fallback only — see `docs/runbooks/adfs-fallback.md`.
- Session tokens are short-lived; refresh via Azure AD.

## 2. Authorization — Per-Contract Access

**Default deny.** A user has no access to a contract unless an explicit row exists in the access table.

Authorization check happens at two layers:
1. Request layer — block at the API before any query runs.
2. Query layer — every query against contract-scoped data joins the access table. Defense in depth against missed checks at the request layer.

Never rely on UI filtering. The backend must never return a contract the user cannot access, even in a list view.

## 3. Individual Access Revocation (SOW 9.6)

Revocations override role-based and group-based grants. Check order on access:
1. Is there an explicit revocation? → Deny.
2. Is there an explicit grant? → Allow.
3. Does the role/group policy grant? → Allow.
4. Default → Deny.

Revocations apply to: document view, search, AI query, notifications, bundled evidence access, cross-contract retrieval (Phase 3).

## 4. Encryption

- TLS 1.2+ everywhere. No plaintext HTTP, even inside the VNet.
- AES-256 at rest via Azure-managed keys initially; plan for customer-managed keys in Phase 2 review.
- File hashes (SHA-256) stored alongside content for integrity verification.

## 5. Secrets

- All credentials in Azure Key Vault.
- No secrets in code, config files, `.env`, or this repo.
- No secrets in `CLAUDE.md` or anywhere in `.claude/`.
- If Claude Code is about to write a secret inline, stop and alert.
- Local dev uses Azure Developer CLI (`azd`) to inject secrets, never checked-in files.

## 6. Malware Scanning

All uploaded files and email attachments are scanned before ingestion. Scanner runs on a dedicated queue worker. Files that fail scanning are quarantined, not ingested. The originating event (upload or email) is logged with the scan result.

## 7. Data Residency

All storage in Azure Canada Central (primary) and Canada East (backup). Infrastructure code enforces region constraints. A deployment targeting any other region fails at plan time, not apply time.

## 8. Audit Log (Non-Negotiable #4)

- Append-only at the database layer. `UPDATE` and `DELETE` grants revoked on the audit table for all application-tier users.
- Hash-chained for tamper evidence: each row includes a hash over (row contents + previous row hash).
- Exportable in CSV with the hash chain intact — so an external auditor can verify the chain.
- Retention: 7 years minimum. Legal hold overrides deletion.

## 9. Sensitive Content Handling

- Privileged legal correspondence, HR matters, and commercially sensitive pricing routed to a restricted-access tier.
- AI retrieval context honors redactions — redacted passages are excluded from the context sent to the model.
- The model is instructed to signal that redacted content exists rather than attempt to bypass.

## 10. Evidentiary Integrity

- Original `.eml` files and uploaded documents stored immutably with SHA-256 hash.
- Any derived representation (parsed email body, OCR text, extracted clauses) can be regenerated from the original — originals are the source of truth.
- Chain-of-custody manifest (SOW 3.37 v0.6) generated for every exported evidence bundle.

## 11. Penetration Testing

Third-party penetration test required before Phase 1 go-live and annually. Remediation of high/critical findings blocks the next release.

## 12. Dependency Security

- Dependency audit in CI on every PR.
- High/critical CVEs block merge.
- Monthly scheduled audit runs against the `main` branch with results tracked.

## 13. Output Handling

- PII and sensitive data is never logged to the general log stream.
- Error messages shown to users contain no internal state (stack traces, query text, file paths).
- Exports respect redactions by default; non-redacted exports require elevated permission and separate audit records.
