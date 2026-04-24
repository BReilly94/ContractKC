import type { BrandedId } from '@ckb/shared';
import type { ContractId, UserId } from './ids.js';

/**
 * Daily Site Diary (SOW §3.14) + Offline Diary Behaviour (§8.10b).
 *
 * Non-Negotiable #9: contemporaneous lock. Entries are not editable after
 * end-of-next-business-day. The lock window is keyed to `occurredAt` (the
 * moment the author created the entry) — not `syncedAt` — so a connectivity
 * delay does not extend or shorten the evidentiary window.
 */

export type SiteDiaryEntryId = BrandedId<'SiteDiaryEntry'>;

export type DiarySyncState = 'Synced' | 'ConflictUnresolved' | 'ConflictReconciled';

export interface SiteDiaryEntry {
  readonly id: SiteDiaryEntryId;
  readonly contractId: ContractId;
  readonly authorUserId: UserId;
  readonly occurredAt: Date;
  readonly syncedAt: Date | null;
  readonly clientDraftId: string | null;
  readonly weather: string | null;
  readonly crewSummary: string | null;
  readonly equipmentSummary: string | null;
  readonly subcontractorSummary: string | null;
  readonly visitors: string | null;
  readonly incidentsSummary: string | null;
  readonly delaysSummary: string | null;
  readonly verbalInstructions: string | null;
  readonly freeNarrative: string | null;
  readonly tags: string | null;
  readonly syncState: DiarySyncState;
  readonly conflictOfEntryId: SiteDiaryEntryId | null;
  readonly conflictReconciledAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * End-of-next-business-day lock (NN #9).
 *
 * Definition: if an entry is created on day D, it locks at 23:59:59 UTC on
 * day D+1, skipping weekends. Saturday creation → locks Monday 23:59:59 UTC.
 * Sunday creation → locks Monday 23:59:59 UTC.
 *
 * This is a deliberate simplification; full holiday-calendar support is a
 * future enhancement. Documented here so the rule is unambiguous in code.
 */
export function computeDiaryLockAt(occurredAt: Date): Date {
  const d = new Date(occurredAt);
  d.setUTCHours(23, 59, 59, 999);
  // Walk forward one business day.
  let added = 0;
  while (added < 1) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      added += 1;
    }
  }
  // d now points to end of next business day.
  return d;
}

export function isDiaryEntryLocked(occurredAt: Date, now: Date = new Date()): boolean {
  return now.getTime() >= computeDiaryLockAt(occurredAt).getTime();
}
