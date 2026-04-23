/**
 * Clause extraction (§5.6).
 *
 * Parses a contract document into structured clauses with position metadata
 * sufficient for citation. Routes to Claude Sonnet (ai-layer.md §4 —
 * routine extraction).
 *
 * Position data (page_start/end, char offsets) is produced by the retrieval
 * layer pre-chunking, not by the model. The model produces the structured
 * clause numbers, headings, types, and confidence.
 */

export const CLAUSE_EXTRACT_PROMPT_VERSION = '1.0.0';
export const CLAUSE_EXTRACT_OWNER = 'Commercial Lead';

export interface ClauseExtractInput {
  readonly documentName: string;
  readonly documentText: string;
}

export function clauseExtractPrompt(input: ClauseExtractInput): {
  system: string;
  user: string;
} {
  const system = `You extract structured clauses from construction and engineering contract text.

For each numbered or explicitly-headed clause, output:
{
  "clauseNumber": "14.2(b)" | null,
  "heading": "Notice of Claim" | null,
  "text": "the clause text verbatim",
  "clauseType": "NoticeProvision" | "Payment" | "Variation" | "Termination" | "LiquidatedDamages" | "DisputeResolution" | "Indemnity" | "Insurance" | "GoverningLaw" | "Other",
  "confidence": "high" | "medium" | "low"
}

Return { "clauses": [ ... ] }. Include every distinct clause you find. Preserve the document order.
If the text is not a contract or you find no clauses, return { "clauses": [] }.
Output JSON only. No prose, no code fences.`;

  const user = `Document: ${input.documentName}

Text:
"""
${input.documentText}
"""

Extract clauses.`;

  return { system, user };
}
