import type { BrandedId } from '@ckb/shared';
import type { ContractId, UserId } from './ids.js';
import type { DocumentId } from './document.js';

/**
 * Meeting Minutes Ingestion (§6.19). A MeetingMinutesExtraction is the
 * parsed + AI-extracted record attached to a Document of category
 * MeetingMinutes. Action items produced feed the Deadline Tracker
 * through the standard verification gate (Non-Negotiable #2) —
 * `sourceType='MeetingMinutes'`.
 */

export type MeetingMinutesExtractionId = BrandedId<'MeetingMinutesExtraction'>;

export interface ExtractedActionItem {
  readonly party: string;
  readonly commitment: string;
  readonly dueDate: string | null; // YYYY-MM-DD
  readonly durationDays: number | null;
  readonly triggerCondition: string | null;
  readonly sourceClauseCitation: string | null;
  readonly citation: string;
}

export interface MeetingMinutesExtraction {
  readonly id: MeetingMinutesExtractionId;
  readonly contractId: ContractId;
  readonly documentId: DocumentId;
  readonly meetingDate: string | null; // YYYY-MM-DD
  readonly actionItemCount: number;
  readonly aiCapabilityVersion: string;
  readonly createdByUserId: UserId;
  readonly createdAt: Date;
}
