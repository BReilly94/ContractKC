import { z } from 'zod';

export const EmailPrescreenInputSchema = z.object({
  subject: z.string().max(2048),
  bodyExcerpt: z.string().max(8192),
  fromAddress: z.string().max(320),
});

export const EmailPrescreenOutputSchema = z.object({
  privileged: z.boolean(),
  category: z.enum(['Privileged', 'HR', 'CommercialSensitive', 'None']),
  confidence: z.enum(['high', 'medium', 'low']),
  reasoning: z.string().max(400),
});

export type EmailPrescreenInputT = z.infer<typeof EmailPrescreenInputSchema>;
export type EmailPrescreenOutputT = z.infer<typeof EmailPrescreenOutputSchema>;
