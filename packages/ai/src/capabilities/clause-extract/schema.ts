import { z } from 'zod';

export const ClauseExtractInputSchema = z.object({
  documentName: z.string().min(1).max(512),
  documentText: z.string().min(1),
});

export const CLAUSE_TYPES = [
  'NoticeProvision',
  'Payment',
  'Variation',
  'Termination',
  'LiquidatedDamages',
  'DisputeResolution',
  'Indemnity',
  'Insurance',
  'GoverningLaw',
  'Other',
] as const;

export const ExtractedClauseSchema = z.object({
  clauseNumber: z.string().max(64).nullable(),
  heading: z.string().max(256).nullable(),
  text: z.string().min(1),
  clauseType: z.enum(CLAUSE_TYPES),
  confidence: z.enum(['high', 'medium', 'low']),
});

export const ClauseExtractOutputSchema = z.object({
  clauses: z.array(ExtractedClauseSchema),
});

export type ExtractedClauseT = z.infer<typeof ExtractedClauseSchema>;
export type ClauseExtractInputT = z.infer<typeof ClauseExtractInputSchema>;
export type ClauseExtractOutputT = z.infer<typeof ClauseExtractOutputSchema>;
