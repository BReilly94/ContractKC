# Contract Knowledge Base — Claude Code Build Package

This folder contains the developer-facing build specification for the Contract Knowledge Base (CKB), covering Phase 1 (MVP) and Phase 2 (Adoption & Lifecycle Depth).

## File Map

```
CLAUDE.md                          ← Main SOW. Claude Code reads this every session.
.claude/
  rules/
    ai-layer.md                    ← AI capability structure, citation rules, routing
    security.md                    ← Authz, encryption, secrets, audit log
    testing.md                     ← Coverage targets, regression harness, CI gates
    ui.md                          ← Design system, accessibility, AI output affordances
    review-gates.md                ← What requires human sign-off
docs/
  open-questions.md                ← Discovery-phase questions with named owners
```

## How to Use

1. **Drop this into the repo root.** `CLAUDE.md` at the root is loaded by Claude Code at session start. The `.claude/rules/` files are loaded lazily when Claude Code works in related areas.

2. **Commit the business SOW alongside.** Drop `Contract_Knowledge_Base_SOW_v0_6.docx` into `docs/business-sow-v0.6.docx` so Claude Code can reference the authoritative business intent when the build SOW is ambiguous.

3. **Keep the build SOW and business SOW in sync.** If business requirements change, update the business SOW first (as a new version), then reflect the build implications in `CLAUDE.md`.

4. **Open questions go in `docs/open-questions.md`.** Claude Code will add to it when it hits an ambiguity; humans resolve and close items.

5. **Rules files (`.claude/rules/*.md`) are engineering law.** Changes to these require human review (see `review-gates.md` item 6).

## What's Included in This Package

- Phase 1 and Phase 2 scope from business SOW v0.6, translated into units of work with acceptance gates.
- Tech stack decisions (Azure, NestJS, Next.js, Claude via API).
- 10 Non-Negotiables enforced as build rules.
- 🔒 Human gates mapped from business intent to code gates.
- Testing, security, AI-layer, UI, and review-gate rules.
- Discovery-phase open questions with named owners.

## What's Not Included (Intentionally)

- Detailed data model — belongs in `docs/architecture/data-model.md` during design.
- API contracts — belongs in OpenAPI specs in the repo during build.
- Phase 3 and Phase 4 — out of scope for this build cycle.
- Prompt templates themselves — those are code, generated during build.
- Infrastructure code — belongs under `infra/` during build.

## Anchor Reminders for Every Session

- Section 2 of `CLAUDE.md` — the 10 Non-Negotiables.
- Section 10 of `CLAUDE.md` — Acceptance Gates.
- `.claude/rules/review-gates.md` — what requires human sign-off.
