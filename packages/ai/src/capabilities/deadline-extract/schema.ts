import { z } from 'zod';

export const DeadlineExtractInputSchema = z.object({
  contractContext: z.string().min(1).max(512),
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

export const ObligationSchema = z.object({
  label: z.string().min(1).max(256),
  responsibleParty: z.enum(['Contractor', 'Client', 'Consultant', 'Other']),
  triggerCondition: z.string().max(512),
  durationDays: z.number().int().nonnegative().nullable(),
  absoluteDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  alertLeadDays: z.number().int().nonnegative(),
  consequence: z.string().max(512),
  citation: z.string().min(1),
});

export const DeadlineExtractOutputSchema = z.object({
  obligations: z.array(ObligationSchema),
});

export type ObligationT = z.infer<typeof ObligationSchema>;
export type DeadlineExtractInputT = z.infer<typeof DeadlineExtractInputSchema>;
export type DeadlineExtractOutputT = z.infer<typeof DeadlineExtractOutputSchema>;
