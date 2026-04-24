import { z } from 'zod';

// First-pass — cheap Sonnet classifier.

export const ProactiveFlagFirstPassInputSchema = z.object({
  contractContext: z.string().min(1).max(512),
  triggerEventType: z.enum(['Email', 'Document', 'SiteDiaryEntry', 'DrawingRevision']),
  triggerSummary: z.string().min(1).max(2048),
  triggerExcerpt: z.string().min(1).max(32_000),
  sensitivity: z.enum(['Conservative', 'Standard', 'Aggressive']),
});

export const ProactiveFlagFirstPassOutputSchema = z.object({
  candidate: z.boolean(),
  flagKindHint: z
    .enum([
      'PossibleNotice',
      'SuspectedScopeChange',
      'DeadlineImminentNoPrep',
      'RevisionScopeImpact',
      'Other',
    ])
    .nullable(),
  reasoning: z.string().max(512),
});

export type ProactiveFlagFirstPassInputT = z.infer<typeof ProactiveFlagFirstPassInputSchema>;
export type ProactiveFlagFirstPassOutputT = z.infer<typeof ProactiveFlagFirstPassOutputSchema>;

// Deep-review — Opus, full citations.

export const ProactiveFlagDeepReviewInputSchema = z.object({
  contractContext: z.string().min(1).max(512),
  triggerEventType: z.enum(['Email', 'Document', 'SiteDiaryEntry', 'DrawingRevision']),
  triggerSummary: z.string().min(1).max(2048),
  triggerExcerpt: z.string().min(1).max(32_000),
  flagKindHint: z.string().max(64).nullable(),
  chunks: z
    .array(
      z.object({
        chunkId: z.string().min(1),
        source: z.string().min(1),
        text: z.string().min(1),
      }),
    )
    .min(1),
});

export const ProactiveFlagDeepReviewOutputSchema = z.object({
  raise: z.boolean(),
  flagKind: z
    .enum([
      'PossibleNotice',
      'SuspectedScopeChange',
      'DeadlineImminentNoPrep',
      'RevisionScopeImpact',
      'Other',
    ])
    .nullable(),
  reasoning: z.string().min(1).max(4096),
  recommendedAction: z.string().max(1024),
  citedClauseIds: z.array(z.string()),
  citedChunkIds: z.array(z.string()),
});

export type ProactiveFlagDeepReviewInputT = z.infer<typeof ProactiveFlagDeepReviewInputSchema>;
export type ProactiveFlagDeepReviewOutputT = z.infer<typeof ProactiveFlagDeepReviewOutputSchema>;
