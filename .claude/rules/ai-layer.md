# AI Layer — Engineering Rules

Rules for anything in `packages/ai/`. Read before editing prompts, adding capabilities, or touching the `LLMClient`.

## 1. Capability Structure

Every AI capability is a folder under `packages/ai/capabilities/<name>/`:

```
deadlines/
├── prompt.ts       # Versioned prompt template
├── schema.ts       # Zod schemas for input and output
├── evaluate.ts     # Regression test set + evaluator
├── index.ts        # Public function — single entry point
└── README.md       # Owner, purpose, routing decision, known limitations
```

A capability is **not done** until `evaluate.ts` exists and passes the regression harness.

## 2. Prompt Templates

- Templates are TypeScript functions returning strings, not markdown files or YAML.
- Every template has a **`version`** constant and a **`owner`** constant at the top.
- Changes to a template bump the version.
- Never inline a prompt outside `packages/ai/`. Business code calls the capability function, not the LLM.

## 3. The LLMClient Abstraction

All LLM calls go through `LLMClient` in `packages/ai/client/`. No direct Anthropic SDK calls anywhere else.

This exists so:
- Models can be swapped per capability without rewriting business logic.
- Zero-data-retention configuration is centralized.
- Token accounting is centralized.
- Regression tests can mock at one boundary.

## 4. Tiered Model Routing

Routing table lives in `packages/ai/routing.ts`. Current routing:

| Capability | Default model |
|---|---|
| Retrieval | (no LLM — hybrid search only) |
| Clause & Obligation Extraction | Claude Sonnet |
| Deadline Detection | Claude Sonnet |
| Synthesis & Q&A | Claude Sonnet |
| Proactive Flag Generation | Claude Sonnet |
| Drafting (claims, RFIs, notices) | Claude Opus |
| Contract Summary Generation | Claude Opus |
| Devil's Advocate Review (Phase 3) | Claude Opus |

Changing a route requires the regression harness to pass on both tiers and a note in the PR explaining the change.

## 5. Citation Discipline (Non-Negotiable #1)

Every LLM response the system shows to a user must carry citations tied to retrieved chunks. Enforcement lives in two places:

1. **Prompt-side:** every prompt template instructs the model to cite sources inline and refuse on insufficient context.
2. **Post-generation:** a citation verifier compares cited chunk IDs to the retrieval result set and scans the response for un-cited factual claims. Responses that fail verification are blocked — not quietly logged.

Failing citation verification is a user-facing event: the UI shows "Response withheld — citation check failed" and logs an AI quality incident.

## 6. Confidence Signaling

Every response carries one of: `high`, `medium`, `low`, `insufficient_context`. The level is determined by:
- Retrieval result count and score distribution.
- Model-reported confidence from the prompt.
- Citation coverage ratio.

`insufficient_context` responses are not synthesized — the model declines and returns a structured reason.

## 7. Regression Harness

`packages/ai/regression/` contains:
- `queries.jsonl` — representative queries with known-good answers and required citation targets.
- `runner.ts` — evaluator that runs each query through the current capability and scores it.
- `baseline.json` — current pass threshold.

Runs in CI on every PR touching `packages/ai/`. PRs below baseline are blocked.

The harness is representative, not exhaustive. Human spot audits (per SOW 6.5) run in parallel and feed new regression cases.

## 8. Zero Data Retention

The Anthropic API is configured for zero data retention. Confirm the configuration at `LLMClient` initialization and fail closed if the flag is not set.

## 9. Logging

Every LLM call logs: capability, prompt template version, model used, token counts in/out, latency, response status, citation verification result, retrieval context hash, user, contract.

Do not log prompt contents or response bodies to the general log stream. Store those in the audit trail, which has tighter access controls.

## 10. Proactive Flagging Cost Control

Flagging runs on every ingestion event. Cost controls:
1. First-pass classification at Sonnet with a short context (heuristic filter: is this worth a deeper look?).
2. Only candidates from the first pass get a deeper Opus review.
3. Per-contract daily flag budget with alerts, not silent throttling.

## 11. Multi-Language Support

When a contract's language is French or Spanish (detected at ingestion):
- Embeddings use a multilingual model that has been regression-tested for that language.
- Retrieval is language-aware (do not cross-retrieve French clauses into an English query unless the user asks).
- Synthesis produces output in the user's preferred language; citations preserve source-language quotes where necessary.

Before any multi-language capability ships, a language-specific regression set must exist.
