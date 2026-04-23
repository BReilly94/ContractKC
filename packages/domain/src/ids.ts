import type { BrandedId } from '@ckb/shared';

export type UserId = BrandedId<'User'>;
export type ContractId = BrandedId<'Contract'>;
export type ContractSummaryId = BrandedId<'ContractSummary'>;
export type PartyId = BrandedId<'Party'>;
export type ContractAccessId = BrandedId<'ContractAccess'>;
export type ContractAccessRevocationId = BrandedId<'ContractAccessRevocation'>;
export type EmailAliasId = BrandedId<'EmailAlias'>;
export type AuditLogEntryId = BrandedId<'AuditLogEntry'>;
export type EmailThreadId = BrandedId<'EmailThread'>;
export type SenderTrustEntryId = BrandedId<'SenderTrustEntry'>;
export type EmailReviewQueueItemId = BrandedId<'EmailReviewQueueItem'>;
export type SharedLinkCaptureId = BrandedId<'SharedLinkCapture'>;
export type CalendarEventId = BrandedId<'CalendarEvent'>;
export type InboundEmailEventId = BrandedId<'InboundEmailEvent'>;
