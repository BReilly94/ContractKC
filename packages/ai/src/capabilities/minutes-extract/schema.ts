import { z } from 'zod';

export const MinutesExtractInputSchema = z.object({
  contractContext: z.string().min(1).max(512),
  documentName: z.string().min(1).max(512),
  documentText: z.string().min(1).max(200_000),
  meetingDateHint: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
});

export const ActionItemSchema = z.object({
  party: z.enum(['Contractor', 'Client', 'Consultant', 'Other']),
  commitment: z.string().min(1).max(1024),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  durationDays: z.number().int().nonnegative().nullable(),
  triggerCondition: z.string().max(512).nullable(),
  sourceClauseCitation: z.string().max(512).nullable(),
  citation: z.string().min(1).max(256),
});

export const MinutesExtractOutputSchema = z.object({
  meetingDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  actionItems: z.array(ActionItemSchema),
});

export type MinutesExtractInputT = z.infer<typeof MinutesExtractInputSchema>;
export type MinutesExtractOutputT = z.infer<typeof MinutesExtractOutputSchema>;
export type ActionItemT = z.infer<typeof ActionItemSchema>;
