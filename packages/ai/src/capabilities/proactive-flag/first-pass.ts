/**
 * Proactive Flagging — first-pass classifier (§6.15, §7.10).
 *
 * The first pass is a cheap Sonnet classifier that decides whether a
 * trigger event is worth a deeper Opus review. It runs on every
 * ingestion event (email, document, diary, drawing revision) — so the
 * prompt is deliberately tight and the output is small.
 *
 * Only candidates flagged here enter the deep-review pipeline. This is
 * the cost-control mechanism prescribed by §7.10.
 */

export const PROACTIVE_FLAG_FIRST_PASS_PROMPT_VERSION = '1.0.0';
export const PROACTIVE_FLAG_FIRST_PASS_OWNER = 'Commercial Lead';

export type FlagSensitivity = 'Conservative' | 'Standard' | 'Aggressive';

export interface ProactiveFlagFirstPassInput {
  readonly contractContext: string;
  readonly triggerEventType: 'Email' | 'Document' | 'SiteDiaryEntry' | 'DrawingRevision';
  readonly triggerSummary: string;
  readonly triggerExcerpt: string;
  readonly sensitivity: FlagSensitivity;
}

export function proactiveFlagFirstPassPrompt(input: ProactiveFlagFirstPassInput): {
  system: string;
  user: string;
} {
  const threshold = {
    Conservative: 'Only surface items where the commercial risk is clearly material.',
    Standard: 'Surface items that a reasonable PM would want to look at.',
    Aggressive: 'Surface anything that might conceivably matter — err on the side of review.',
  }[input.sensitivity];

  const system = `You are a triage classifier for a contracts knowledge base.

Given a short summary of a new ingestion event (email, document, diary entry, or drawing revision), decide whether it is worth a deeper, more expensive AI review.

Sensitivity: ${input.sensitivity}. ${threshold}

Output a single JSON object:
{
  "candidate": true | false,
  "flagKindHint": "PossibleNotice" | "SuspectedScopeChange" | "DeadlineImminentNoPrep" | "RevisionScopeImpact" | "Other" | null,
  "reasoning": "one line"
}

candidate=true means the event should run through deep review. Do not produce a full flag at this stage. Output JSON only — no code fences.`;

  const user = `Contract: ${input.contractContext}
Trigger type: ${input.triggerEventType}
Summary: ${input.triggerSummary}

Excerpt:
${input.triggerExcerpt}

Classify.`;

  return { system, user };
}
