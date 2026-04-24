# proactive-flag

**Owner:** Commercial Lead
**Prompt versions:** first-pass 1.0.0, deep-review 1.0.0
**Models:**
- First-pass classifier — Claude Sonnet (ai-layer.md §4 — classification)
- Deep-review — Claude Opus (ai-layer.md §4 — complex synthesis)

Two-tier AI capability backing §6.15 Proactive AI Flagging and satisfying
§7.10's cost-control directive: the expensive Opus call runs only on events
that the cheap Sonnet classifier flags as worth a deeper look.

## Two-tier routing

1. **first-pass (Sonnet)** — runs on every ingestion event. Short context,
   small output. Decides `candidate: true | false` and emits an optional
   `flagKindHint`.
2. **deep-review (Opus)** — runs only on first-pass candidates. Retrieves
   contract context for the trigger, produces a fully-cited reasoning
   paragraph, a flag kind, and a recommended action.

## Non-Negotiables

- **#1 (Citations)** — every deep-review reasoning string must pass the
  citation verifier (`packages/ai/src/citations.ts`). A flag that fails
  verification is NOT persisted or surfaced — the worker logs an AI
  quality incident instead.
- **#5 / #6 (Default-deny / Contract-scoped retrieval)** — the retrieval
  chunks handed to deep-review are always scoped to the trigger event's
  contract. The capability itself is agnostic; the worker is responsible
  for enforcing scope.

## Cost controls (§7.10)

- Per-contract `daily_flag_budget` (column on `contract`).
- When the budget is exceeded the pipeline fires a budget-alert
  notification to the KnowledgeCentreAdministrator and records a
  `flag_budget.alert` audit action. **Never silent throttle.**
- Admins raise the budget via the normal contract edit path.
