import type { BrandedId } from '@ckb/shared';
import type { ContractId, UserId } from './ids.js';

export type DeadlineId = BrandedId<'Deadline'>;

export type DeadlineResponsibleParty = 'Contractor' | 'Client' | 'Consultant' | 'Other';
export type DeadlineLifecycleState =
  | 'Extracted'
  | 'Verified'
  | 'Active'
  | 'Triggered'
  | 'Complete'
  | 'Missed'
  | 'Cancelled';

export type DeadlineSourceType = 'Clause' | 'Email' | 'Document' | 'CalendarEvent' | 'Manual' | 'MeetingMinutes';

export interface Deadline {
  readonly id: DeadlineId;
  readonly contractId: ContractId;
  readonly label: string;
  readonly responsibleParty: DeadlineResponsibleParty;
  readonly triggerCondition: string | null;
  readonly durationDays: number | null;
  readonly absoluteDate: string | null; // YYYY-MM-DD
  readonly alertLeadDays: number;
  readonly consequence: string | null;
  readonly verificationState: 'Unverified' | 'Verified';
  readonly lifecycleState: DeadlineLifecycleState;
  readonly sourceType: DeadlineSourceType;
  readonly sourceId: string | null;
  readonly sourceCitation: string | null;
  readonly extractedByCapabilityVersion: string | null;
  readonly createdByUserId: UserId;
  readonly verifiedByUserId: UserId | null;
  readonly verifiedAt: Date | null;
  readonly completedAt: Date | null;
  readonly completedByUserId: UserId | null;
  readonly dueAt: Date | null;
  readonly triggeredAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export const LEGAL_DEADLINE_TRANSITIONS: ReadonlyArray<{
  from: DeadlineLifecycleState;
  to: DeadlineLifecycleState;
}> = [
  { from: 'Extracted', to: 'Verified' },
  { from: 'Extracted', to: 'Cancelled' },
  { from: 'Verified', to: 'Active' },
  { from: 'Verified', to: 'Cancelled' },
  { from: 'Active', to: 'Triggered' },
  { from: 'Active', to: 'Complete' },
  { from: 'Active', to: 'Missed' },
  { from: 'Active', to: 'Cancelled' },
  { from: 'Triggered', to: 'Complete' },
  { from: 'Triggered', to: 'Missed' },
];

export function isLegalDeadlineTransition(
  from: DeadlineLifecycleState,
  to: DeadlineLifecycleState,
): boolean {
  return LEGAL_DEADLINE_TRANSITIONS.some((t) => t.from === from && t.to === to);
}

/**
 * Compute a concrete due date from a deadline's fields. Returns null when
 * the deadline is trigger-based and no trigger event has fired yet.
 */
export function computeDueAt(params: {
  absoluteDate: string | null;
  durationDays: number | null;
  triggeredAt: Date | null;
}): Date | null {
  if (params.absoluteDate) {
    return new Date(`${params.absoluteDate}T00:00:00Z`);
  }
  if (params.durationDays !== null && params.triggeredAt) {
    const d = new Date(params.triggeredAt);
    d.setUTCDate(d.getUTCDate() + params.durationDays);
    return d;
  }
  return null;
}
