/**
 * Proactive Flagging — deep-review (Opus).
 *
 * Runs only on first-pass candidates (§7.10). Given the trigger event
 * plus retrieved contract context, produces a fully-cited flag:
 *   - flagKind classification
 *   - reasoning that cites clauses / chunks
 *   - recommended action
 *
 * Every factual statement in the reasoning must carry an inline
 * [cite:<chunkId>] citation — post-generation verification in
 * packages/ai/src/citations.ts enforces Non-Negotiable #1.
 */

export const PROACTIVE_FLAG_DEEP_REVIEW_PROMPT_VERSION = '1.0.0';
export const PROACTIVE_FLAG_DEEP_REVIEW_OWNER = 'Commercial Lead';

export interface ProactiveFlagDeepReviewInput {
  readonly contractContext: string;
  readonly triggerEventType: 'Email' | 'Document' | 'SiteDiaryEntry' | 'DrawingRevision';
  readonly triggerSummary: string;
  readonly triggerExcerpt: string;
  readonly flagKindHint: string | null;
  readonly chunks: ReadonlyArray<{
    readonly chunkId: string;
    readonly source: string;
    readonly text: string;
  }>;
}

export function proactiveFlagDeepReviewPrompt(input: ProactiveFlagDeepReviewInput): {
  system: string;
  user: string;
} {
  const system = `You are a senior contracts administrator reviewing an incoming event (email, document, diary entry, or drawing revision) against a contract to decide whether a proactive flag should be raised.

Flag kinds:
  - "PossibleNotice"          — the event may constitute a contractual notice or may require one.
  - "SuspectedScopeChange"    — direction to perform work that appears outside the contract scope.
  - "DeadlineImminentNoPrep"  — a milestone is approaching with no preparation activity logged.
  - "RevisionScopeImpact"     — a drawing/spec revision appears to change scope, cost, schedule, or safety-critical systems.
  - "Other"                   — legitimate concern that does not fit the above.

Answer rules:
  1. Every factual sentence in the reasoning MUST carry an inline citation [cite:<chunkId>]. Multi-cite: [cite:a,b].
  2. Only cite chunks from the retrieved set below. Do not invent clause numbers.
  3. If the event does NOT warrant a flag, reply with:
     {
       "raise": false,
       "flagKind": null,
       "reasoning": "Not flaggable.",
       "recommendedAction": "",
       "citedClauseIds": [],
       "citedChunkIds": []
     }
  4. Otherwise, reply with:
     {
       "raise": true,
       "flagKind": "<one of the flag kinds>",
       "reasoning": "2-4 sentences, each citing chunks inline.",
       "recommendedAction": "one-line directive for the PM",
       "citedClauseIds": [ "<clauseId>", ... ],   // subset of cited chunks that are Clause sources
       "citedChunkIds": [ "<chunkId>", ... ]      // all chunks referenced in reasoning
     }

Output JSON only — no code fences, no prose outside the object.`;

  const chunkPayload = input.chunks
    .map((c) => `[chunkId: ${c.chunkId}] (${c.source})\n${c.text}`)
    .join('\n\n---\n\n');

  const hint = input.flagKindHint ? `First-pass hint: ${input.flagKindHint}\n` : '';

  const user = `Contract: ${input.contractContext}
Trigger type: ${input.triggerEventType}
${hint}Summary: ${input.triggerSummary}

--- TRIGGER EXCERPT ---
${input.triggerExcerpt}
--- END ---

Retrieved contract context:
${chunkPayload}

Review and decide whether to raise a proactive flag.`;

  return { system, user };
}
