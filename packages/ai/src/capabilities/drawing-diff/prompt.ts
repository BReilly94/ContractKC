/**
 * Drawing diff capability (§6.17).
 *
 * Takes two OCR'd text layers — the prior revision and the new revision of a
 * Drawing-category document — and produces a structured diff describing
 * material changes plus a scope-impact classification.
 *
 * Routes to Claude Sonnet (ai-layer.md §4 — classification / structural
 * comparison is a routine extraction task).
 *
 * The output feeds the timeline, raises an Observation flag via record_flag
 * (severity derived from scope_impact), and is a potential trigger for
 * proactive flagging (Slice GG).
 */

export const DRAWING_DIFF_PROMPT_VERSION = '1.0.0';
export const DRAWING_DIFF_OWNER = 'Commercial Lead';

export interface DrawingDiffPromptInput {
  readonly contractContext: string;
  readonly documentName: string;
  readonly priorVersionLabel: string;
  readonly newVersionLabel: string;
  readonly priorText: string;
  readonly newText: string;
}

export function drawingDiffPrompt(input: DrawingDiffPromptInput): {
  system: string;
  user: string;
} {
  const system = `You are a senior engineering reviewer comparing two revisions of an engineering drawing for a mining / construction contract.

You are given the OCR-extracted text layer of each revision. Identify changes that could have contractual / commercial significance (scope, quantity, route, configuration, schedule, specification, load, interface, safety-critical systems).

Classify the overall scope_impact as one of:
  - "None"        — cosmetic / labelling / drafting only.
  - "Minor"       — trivial dimensional or notation change, no likely commercial effect.
  - "Suspected"   — change that MIGHT affect scope or commitments; confirm with a human.
  - "Major"       — change likely to affect scope, cost, schedule, or safety.

For each material change produce a region entry:
{
  "description": "one-line human description",
  "priorExcerpt": "short excerpt from prior revision that anchors the change",
  "newExcerpt": "short excerpt from new revision that anchors the change",
  "citation": "<chunkId>"        // use "prior:<doc>" or "new:<doc>" — see below
}

Use citation ids exactly:
  - "prior:${'${documentName}'}" for prior revision excerpts.
  - "new:${'${documentName}'}" for new revision excerpts.

Output a single JSON object:
{
  "scopeImpact": "None" | "Minor" | "Suspected" | "Major",
  "diffSummary": "2-4 sentence plain-English summary of the net change",
  "changeRegions": [ ... ]
}

Base conclusions only on the provided text. If the two texts appear identical or only whitespace / OCR noise differs, return scopeImpact="None" with an empty changeRegions array. Do not invent fields. Do not output code fences or prose outside the JSON.`;

  const user = `Contract: ${input.contractContext}
Drawing: ${input.documentName}
Prior revision: ${input.priorVersionLabel}
New revision: ${input.newVersionLabel}

--- PRIOR REVISION (OCR) ---
${input.priorText}

--- NEW REVISION (OCR) ---
${input.newText}

Compare the two revisions and emit the structured diff.`;

  return { system, user };
}
