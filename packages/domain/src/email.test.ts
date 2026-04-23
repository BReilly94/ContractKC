import { asBrandedId } from '@ckb/shared';
import { describe, expect, it } from 'vitest';
import {
  canonicalAddress,
  canonicalLocalPart,
  EMAIL_DOMAIN,
  validateHumanAlias,
} from './email.js';

const CONTRACT = asBrandedId<'Contract'>('01HXCONTRACT000000000000AA');

describe('canonical addressing', () => {
  it('local part is contract-<lowercase-ulid>', () => {
    expect(canonicalLocalPart(CONTRACT)).toBe('contract-01hxcontract000000000000aa');
  });

  it('canonical address binds to the fixed domain', () => {
    expect(canonicalAddress(CONTRACT)).toBe(
      `contract-01hxcontract000000000000aa@${EMAIL_DOMAIN}`,
    );
  });
});

describe('validateHumanAlias', () => {
  it('accepts normal slugs', () => {
    expect(validateHumanAlias('redlake-expansion')).toEqual({ valid: true });
    expect(validateHumanAlias('project-x-phase2')).toEqual({ valid: true });
  });

  it('rejects reserved prefixes', () => {
    expect(validateHumanAlias('contract-anything')).toEqual({
      valid: false,
      reason: 'CanonicalPrefix',
    });
  });

  it('rejects reserved local parts', () => {
    expect(validateHumanAlias('postmaster')).toEqual({ valid: false, reason: 'Reserved' });
    expect(validateHumanAlias('abuse')).toEqual({ valid: false, reason: 'Reserved' });
  });

  it('rejects invalid formats', () => {
    expect(validateHumanAlias('abc')).toEqual({ valid: false, reason: 'InvalidFormat' });
    expect(validateHumanAlias('-leading-hyphen')).toEqual({
      valid: false,
      reason: 'InvalidFormat',
    });
    expect(validateHumanAlias('trailing-hyphen-')).toEqual({
      valid: false,
      reason: 'InvalidFormat',
    });
    expect(validateHumanAlias('CAPITALS')).toEqual({ valid: false, reason: 'InvalidFormat' });
    expect(validateHumanAlias('spaces not allowed')).toEqual({
      valid: false,
      reason: 'InvalidFormat',
    });
  });
});
