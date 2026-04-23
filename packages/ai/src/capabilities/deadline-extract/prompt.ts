/**
 * Deadline / obligation extraction (§5.5).
 *
 * Normalizes expressions like "within 14 days of becoming aware" into a
 * structured obligation with triggers, owner, and an optional absolute date
 * (where the contract fixes one). Each obligation carries a citation back
 * to the source clause.
 *
 * Routes to Claude Sonnet (ai-layer.md §4 — routine extraction).
 */

export const DEADLINE_EXTRACT_PROMPT_VERSION = '1.0.0';
export const DEADLINE_EXTRACT_OWNER = 'Commercial Lead';

export interface DeadlineExtractInput {
  readonly contractContext: string;
  readonly chunks: ReadonlyArray<{
    readonly chunkId: string;
    readonly source: string;
    readonly text: string;
  }>;
}

export function deadlineExtractPrompt(input: DeadlineExtractInput): {
  system: string;
  user: string;
} {
  const system = `You extract contractual obligations from construction / engineering contract text.

An obligation is anything with a time-bounded action:
  - "Contractor shall give notice within 14 days of becoming aware of a delay event."
  - "Payment certificates shall be issued within 21 days of submission."
  - "The contractor shall maintain CGL insurance throughout the Term."

For each obligation output:
{
  "label": "one-line human description",
  "responsibleParty": "Contractor" | "Client" | "Consultant" | "Other",
  "triggerCondition": "text describing what starts the clock",
  "durationDays": number | null,       // null for continuous obligations
  "absoluteDate": "YYYY-MM-DD" | null, // only if the clause fixes one
  "alertLeadDays": number,             // suggested days-before for an alert; default 3
  "consequence": "text — what happens if missed (if stated)",
  "citation": "chunk-id"
}

Output an object: { "obligations": [ ... ] }.

Only use the provided text. Do NOT invent obligations. If the text contains none, return { "obligations": [] }.
Output JSON only, no prose, no code fences.`;

  const user = `Contract context: ${input.contractContext}

Source chunks:
${input.chunks.map((c) => `[chunkId: ${c.chunkId}] (${c.source})\n${c.text}`).join('\n\n---\n\n')}

Extract the obligations.`;

  return { system, user };
}
