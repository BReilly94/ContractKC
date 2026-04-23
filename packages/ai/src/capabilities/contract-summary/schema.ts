import { z } from 'zod';

export const ContractSummaryInputSchema = z.object({
  contractName: z.string().min(1).max(256),
  clientName: z.string().min(1).max(256),
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

const KeyDate = z.object({
  label: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  citation: z.string(),
});

const NoticePeriod = z.object({
  topic: z.string(),
  days: z.number().int().nonnegative(),
  citation: z.string(),
});

export const ContractSummaryOutputSchema = z.object({
  parties: z.object({
    client: z.string().nullable(),
    contractor: z.string().nullable(),
  }),
  contractValue: z.object({
    amount: z.number().nullable(),
    currency: z.string().nullable(),
    citations: z.array(z.string()),
  }),
  term: z.object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    citations: z.array(z.string()),
  }),
  keyDates: z.array(KeyDate),
  paymentTerms: z.object({
    summary: z.string().nullable(),
    citations: z.array(z.string()),
  }),
  noticePeriods: z.array(NoticePeriod),
  liquidatedDamages: z.object({
    summary: z.string().nullable(),
    cap: z.string().nullable(),
    citations: z.array(z.string()),
  }),
  terminationTriggers: z.array(
    z.object({ trigger: z.string(), citation: z.string() }),
  ),
  governingLaw: z.object({
    value: z.string().nullable(),
    citation: z.string().nullable(),
  }),
  disputeResolution: z.object({
    summary: z.string().nullable(),
    citation: z.string().nullable(),
  }),
  insuranceAndBonding: z.object({
    summary: z.string().nullable(),
    citations: z.array(z.string()),
  }),
  flaggedClauses: z.array(
    z.object({ summary: z.string(), why: z.string(), citation: z.string() }),
  ),
});

export type ContractSummaryInputT = z.infer<typeof ContractSummaryInputSchema>;
export type ContractSummaryOutputT = z.infer<typeof ContractSummaryOutputSchema>;
