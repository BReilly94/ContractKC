# clause-extract

**Owner:** Commercial Lead
**Prompt version:** 1.0.0
**Model:** Claude Sonnet (ai-layer.md §4)

Extracts structured clauses from a contract document. Output feeds §5.6's clause cross-reference graph and every citation affordance that points at a clause.

## Verification

Extracted clauses start `verification_state = Unverified`. Clause cross-references in the graph are similarly gated — only `Verified` relationships are treated as trustworthy signals by downstream features.
