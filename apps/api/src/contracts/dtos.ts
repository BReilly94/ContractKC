import { supportedCurrencies } from '@ckb/shared';
import { z } from 'zod';

const ulid = z.string().length(26).regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);

const currencyEnum = z.enum(
  supportedCurrencies as unknown as [string, ...string[]],
);

const lifecycleEnum = z.enum([
  'Draft',
  'Onboarding',
  'Active',
  'IssueInProgress',
  'Closeout',
  'Archived',
]);

const contractRoleEnum = z.enum([
  'Owner',
  'Administrator',
  'Contributor',
  'Viewer',
  'RestrictedViewer',
]);

export const CreateContractBody = z.object({
  name: z.string().min(1).max(256),
  clientPartyId: ulid,
  responsiblePmUserId: ulid,
  contractValueCents: z.number().int().nonnegative().nullable().optional(),
  currency: currencyEnum,
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  governingLaw: z.string().min(1).max(40),
  confidentialityClass: z.enum(['Standard', 'Restricted', 'HighlyRestricted']).default('Standard'),
  language: z.string().min(2).max(10).default('en'),
  humanEmailAlias: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{2,46}[a-z0-9]$/)
    .optional(),
  additionalGrants: z
    .array(
      z.object({
        userId: ulid,
        role: contractRoleEnum,
      }),
    )
    .default([]),
});

export type CreateContractBody = z.infer<typeof CreateContractBody>;

export const LifecycleTransitionBody = z.object({
  targetState: lifecycleEnum,
});

export type LifecycleTransitionBody = z.infer<typeof LifecycleTransitionBody>;

export const GrantAccessBody = z.object({
  userId: ulid,
  role: contractRoleEnum,
});

export type GrantAccessBody = z.infer<typeof GrantAccessBody>;
