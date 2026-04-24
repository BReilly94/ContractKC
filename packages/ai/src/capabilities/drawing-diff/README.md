# drawing-diff

**Owner:** Commercial Lead
**Prompt version:** 1.0.0
**Model:** Claude Sonnet (ai-layer.md §4 — classification / routine extraction)

Compares two revisions of a Drawing-category document. Takes the OCR'd text
layers of the prior and new revisions and produces:

- A 2-4 sentence `diffSummary`.
- An array of structured `changeRegions` anchoring each material change.
- A `scopeImpact` classification: `None` | `Minor` | `Suspected` | `Major`.

Citations use a closed grammar:
- `prior:<documentName>` for excerpts from the prior revision.
- `new:<documentName>` for excerpts from the new revision.

## Downstream wiring

- A `drawing_diff` row is persisted (migration 0022).
- An Observation flag is raised through `record_flag` with severity derived
  from `scopeImpact` via `severityForScopeImpact()` in
  `packages/domain/src/drawing-diff.ts`.
- A surface-level record appears on the timeline (§6.2).
- The diff itself can be a trigger for Proactive Flagging (Slice GG) —
  see `proactive-flag` capability.

## Non-Negotiables

- #1 (Citations) — every `changeRegions` entry carries a `prior:` or `new:`
  citation. The worker verifies the citation prefix before persisting.
- #3 (Originals immutable) — the capability reads OCR text layers (derived
  representations); original drawing blobs are untouched.
