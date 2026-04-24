import { z } from 'zod';

export const ClaimDraftAssertion = z.object({
  text: z.string().min(1),
  citedChunkId: z.string().min(1),
  confidence: z.enum(['high', 'medium', 'low', 'insufficient_context']),
});
export type ClaimDraftAssertion = z.infer<typeof ClaimDraftAssertion>;

export const ClaimDraftResult = z.object({
  narrative: z.string(),
  assertions: z.array(ClaimDraftAssertion),
  timeImpactDays: z.number().int().nullable(),
  amountClaimedCents: z.number().int().nullable(),
  overallConfidence: z.enum(['high', 'medium', 'low', 'insufficient_context']),
  refusalReason: z.string().nullable(),
});
export type ClaimDraftResult = z.infer<typeof ClaimDraftResult>;
