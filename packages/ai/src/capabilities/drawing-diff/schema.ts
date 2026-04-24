import { z } from 'zod';

export const DrawingDiffInputSchema = z.object({
  contractContext: z.string().min(1).max(512),
  documentName: z.string().min(1).max(512),
  priorVersionLabel: z.string().min(1).max(128),
  newVersionLabel: z.string().min(1).max(128),
  priorText: z.string().min(1).max(200_000),
  newText: z.string().min(1).max(200_000),
});

export const DrawingChangeRegionSchema = z.object({
  description: z.string().min(1).max(512),
  priorExcerpt: z.string().max(2048),
  newExcerpt: z.string().max(2048),
  citation: z.string().min(1).max(256),
});

export const DrawingDiffOutputSchema = z.object({
  scopeImpact: z.enum(['None', 'Minor', 'Suspected', 'Major']),
  diffSummary: z.string().min(1).max(4096),
  changeRegions: z.array(DrawingChangeRegionSchema),
});

export type DrawingDiffInputT = z.infer<typeof DrawingDiffInputSchema>;
export type DrawingDiffOutputT = z.infer<typeof DrawingDiffOutputSchema>;
export type DrawingChangeRegionT = z.infer<typeof DrawingChangeRegionSchema>;
