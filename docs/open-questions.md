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

### Q-005: Inbound email parser — SendGrid vs. Azure-native

- **Raised by:** SOW section 11
- **Raised date:** 2026-04-21
- **Context:** Section 5.2 — managed inbound email parsing.
- **Question:** Is SendGrid Inbound Parse acceptable to IT security, or must we ship on Azure-native inbound parsing in Phase 1?
- **Owner:** [IT Security]
- **Needed by:** Sprint 1 of Phase 1
- **Status:** Open

### Q-006: Evidentiary signing of exports

- **Raised by:** SOW section 11
- **Raised date:** 2026-04-21
- **Context:** Section 5.13 — Data Portability.
- **Question:** Are contract data exports required to be cryptographically signed / timestamped for evidentiary use? Affects chain-of-custody manifest design.
- **Owner:** [Legal Counsel]
- **Needed by:** Pre-Phase-1 go-live
- **Status:** Open

### Q-007: Pilot contract selection

- **Raised by:** SOW section 11
- **Raised date:** 2026-04-21
- **Context:** SOW 12.31 — pilot contract for Phase 1.
- **Question:** Which contract(s)? Criteria: active but past initial chaos, engaged PM, stable client relationship, not the biggest or most sensitive.
- **Owner:** [VP Operations]
- **Needed by:** Phase 1 midpoint
- **Status:** Open
