# @ckb/ai

Every LLM interaction the platform makes goes through this package. No direct `@anthropic-ai/sdk` imports outside of `src/client/anthropic.ts` — enforced at review time.

## Structure

```
src/
  client/               # LLMClient interface + Anthropic impl + Mock impl
  capabilities/         # One folder per capability (see .claude/rules/ai-layer.md §1)
  regression/           # queries.jsonl, runner, baseline, CLI
  citations.ts          # Citation grammar + verifier (Non-Negotiable #1)
  confidence.ts         # Confidence signalling (high / medium / low / insufficient_context)
  routing.ts            # Capability → model tier
```

## Non-Negotiable #1

`verifyCitations` is the hard gate. The API boundary calls it after every AI response. Responses that fail are blocked — users see "Response withheld — citation check failed" and the incident is logged.

## Zero-data-retention

`AnthropicLLMClient` throws at construction if the config flag isn't set. The flag maps to org-level retention configuration in the Anthropic console; the header-level per-request toggle doesn't exist, so we enforce via config + explicit guard.

## Capabilities

Each capability under `src/capabilities/<name>/` is a self-contained unit:

| File | Purpose |
|---|---|
| `prompt.ts` | Versioned prompt template (owner, version, function returning the prompt string) |
| `schema.ts` | Zod schemas for input and output |
| `evaluate.ts` | Local evaluator run at `pnpm test` time, against the capability's own regression queries |
| `index.ts` | `runCapability(input, llmClient, ...)` — the public function |
| `README.md` | Owner, routing decision, known limitations |

A capability is NOT done until `evaluate.ts` runs clean against its queries at or above baseline.

## Running the regression harness

```
pnpm --filter @ckb/ai regression
```

Phase 0 runs against the empty `queries.jsonl` and exits 0.
