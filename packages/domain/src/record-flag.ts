import type { BrandedId } from '@ckb/shared';
import type { ContractId, UserId } from './ids.js';

/**
 * Record flags (SOW §3.14b). Not a register of their own — structured
 * classifications layered over Diary entries, Documents, Emails, and
 * Clauses. Carry contractual reporting timelines that feed the Deadline
 * Tracker through the standard verification gate.
 */

export type RecordFlagId = BrandedId<'RecordFlag'>;

export type RecordFlagTargetType = 'SiteDiaryEntry' | 'Document' | 'Email' | 'Clause';

export type RecordFlagType =
  | 'Incident'
  | 'NCR'
  | 'InspectionRecord'
  | 'HoldPointRelease'
  | 'CorrectiveAction'
  | 'Observation';

export type RecordFlagSeverity = 'Low' | 'Medium' | 'High' | 'Critical';

export interface RecordFlag {
  readonly id: RecordFlagId;
  readonly contractId: ContractId;
  readonly targetType: RecordFlagTargetType;
  readonly targetId: string;
  readonly flagType: RecordFlagType;
  readonly severity: RecordFlagSeverity | null;
  readonly holdPointName: string | null;
  readonly holdPointReleased: boolean | null;
  readonly notificationDueAt: Date | null;
  readonly deadlineId: string | null;
  readonly note: string | null;
  readonly createdByUserId: UserId;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
