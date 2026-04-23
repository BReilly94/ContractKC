# qa-synth

**Owner:** Commercial Lead
**Prompt version:** 1.0.0
**Model:** Claude Sonnet (ai-layer.md §4 — routine Q&A)

The primary Q&A capability (§5.3). Produces cited answers over retrieved context from the contract's isolated index.

## Non-Negotiable #1 — post-generation citation verification

`runQaSynth` calls the citation verifier after generation. Responses that fail (unknown chunk ids cited, or factual sentences without citations) are BLOCKED. The caller receives `blocked=true` with the block reason; the UI shows "Response withheld — citation check failed" and an AI quality incident is logged.

## Confidence

The caller combines the verifier's result with retrieval stats via `computeConfidence` to attach a level to the response.
