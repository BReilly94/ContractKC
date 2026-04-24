import type { BrandedId } from '@ckb/shared';
import type { ContractId, UserId } from './ids.js';

/**
 * Configurable Notification Digest (SOW §3.9 Phase 2, §6.23).
 *
 * Each user can configure digest delivery per-contract or globally
 * (contract_id = NULL means "applies to every contract this user can
 * see, unless overridden by a more specific row").
 */

export type DigestPreferenceId = BrandedId<'DigestPreference'>;

export type DigestFrequency = 'Daily' | 'Weekly' | 'Off';
export type DigestChannel = 'InApp' | 'Email';

export type DigestCategory =
  | 'upcoming_deadlines'
  | 'pending_reviews'
  | 'new_flags'
  | 'claim_status_changes'
  | 'contract_events';

export const ALL_DIGEST_CATEGORIES: readonly DigestCategory[] = [
  'upcoming_deadlines',
  'pending_reviews',
  'new_flags',
  'claim_status_changes',
  'contract_events',
];

export interface DigestPreference {
  readonly id: DigestPreferenceId;
  readonly userId: UserId;
  readonly contractId: ContractId | null;
  readonly frequency: DigestFrequency;
  readonly channels: readonly DigestChannel[];
  readonly categories: readonly DigestCategory[];
  readonly lastDispatchedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Resolve the effective preference for a (user, contract) pair from the
 * user's set of preferences. A row with a specific contract_id wins over
 * a contract-scope-wide (NULL) row.
 *
 * Returns `null` when no row applies — caller defaults to the system-default
 * (Weekly, InApp, all categories).
 */
export function resolveEffectivePreference(
  preferences: readonly DigestPreference[],
  contractId: ContractId | string,
): DigestPreference | null {
  const specific = preferences.find((p) => p.contractId === contractId);
  if (specific) return specific;
  const wide = preferences.find((p) => p.contractId === null);
  return wide ?? null;
}

/**
 * Decide whether the given preference is due for dispatch at `now`.
 * Daily: more than 20h since last dispatch (headroom for clock drift).
 * Weekly: more than 6 days since last dispatch.
 * Off: never.
 * Never dispatched: always due.
 */
export function isDigestDue(pref: DigestPreference, now: Date = new Date()): boolean {
  if (pref.frequency === 'Off') return false;
  if (pref.lastDispatchedAt === null) return true;
  const elapsedMs = now.getTime() - pref.lastDispatchedAt.getTime();
  if (pref.frequency === 'Daily') return elapsedMs >= 20 * 60 * 60 * 1000;
  if (pref.frequency === 'Weekly') return elapsedMs >= 6 * 24 * 60 * 60 * 1000;
  return false;
}
