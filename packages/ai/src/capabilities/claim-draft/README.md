# claim-draft capability

**Owner:** Commercial/Claims Lead
**Model routing:** Claude Opus (per SOW §7.3, `packages/ai/src/routing.ts`)
**Scope:** SOW §3.17 Claim Drafting Workspace + §6.3.5 Drafting

Generates a first draft of a contractual claim from a trigger-event summary
plus a retrieved evidence corpus (documents, emails, diary entries, clauses).

**Guarantees:**

- Every factual assertion carries an inline `[chunk_id]` citation that
  post-generation verification maps to a retrieved chunk id. Missing or
  mismatched citations block the response.
- Refuses on insufficient context — does not fabricate elements like notice,
  quantum, or causation. Returns a structured `refusalReason`.
- Confidence signal: `high` / `medium` / `low` / `insufficient_context`.

**Gate:** template changes require 🔒 human review per `.claude/rules/review-gates.md`
and regression harness pass. Claims never go out without the Commercial/Claims
Lead (owner) editing and signing off the final draft.

## Known limitations

- ASSUMPTION: embeddings are hash-based in dev (Q-EMBED-1); real semantic
  retrieval quality is a load-bearing dependency once Azure OpenAI wiring
  lands. Spot audits per `.claude/rules/ai-layer.md` §5 are the backstop.
