# deadline-extract

**Owner:** Commercial Lead
**Prompt version:** 1.0.0
**Model:** Claude Sonnet (ai-layer.md §4 — routine extraction)

Extracts time-bounded obligations from contract text. Output feeds §5.5's Notice & Deadline Tracker.

## Verification gate (Non-Negotiable #2)

Every extracted obligation enters as `Unverified`. Only `Verified` obligations trigger external-user-facing alerts (email/SMS). The gate is enforced in application code and at the DB level — unverified rows cannot feed downstream alerting.
