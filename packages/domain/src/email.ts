import type { ContractId, EmailAliasId } from './ids.js';

export type EmailAliasType = 'Canonical' | 'Human';

export interface EmailAlias {
  readonly id: EmailAliasId;
  readonly contractId: ContractId;
  readonly localPart: string;
  readonly canonicalAddress: string;
  readonly humanAlias: string | null;
  readonly aliasType: EmailAliasType;
  readonly active: boolean;
  readonly provisionedExternally: boolean;
  readonly createdAt: Date;
  readonly deactivatedAt: Date | null;
}

export const EMAIL_DOMAIN = 'contracts.technicamining.com';

export const RESERVED_LOCAL_PARTS: readonly string[] = [
  'postmaster',
  'abuse',
  'noreply',
  'admin',
  'root',
  'webmaster',
  'hostmaster',
];

const HUMAN_ALIAS_REGEX = /^[a-z0-9][a-z0-9-]{2,46}[a-z0-9]$/;

export function canonicalLocalPart(contractId: ContractId): string {
  return `contract-${contractId.toLowerCase()}`;
}

export function canonicalAddress(contractId: ContractId): string {
  return `${canonicalLocalPart(contractId)}@${EMAIL_DOMAIN}`;
}

export type HumanAliasValidation =
  | { valid: true }
  | { valid: false; reason: 'InvalidFormat' | 'Reserved' | 'CanonicalPrefix' };

export function validateHumanAlias(localPart: string): HumanAliasValidation {
  const lower = localPart.toLowerCase();
  if (lower.startsWith('contract-')) return { valid: false, reason: 'CanonicalPrefix' };
  if (RESERVED_LOCAL_PARTS.includes(lower)) return { valid: false, reason: 'Reserved' };
  if (!HUMAN_ALIAS_REGEX.test(lower)) return { valid: false, reason: 'InvalidFormat' };
  return { valid: true };
}
