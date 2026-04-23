import type { ContractId, UserId } from './ids.js';
import type { EmailId } from './email.js';
import type { BrandedId } from '@ckb/shared';

export type DocumentId = BrandedId<'Document'>;
export type DocumentVersionId = BrandedId<'DocumentVersion'>;
export type TagId = BrandedId<'Tag'>;

export type DocumentCategory =
  | 'MasterAgreement'
  | 'Schedule'
  | 'Appendix'
  | 'Amendment'
  | 'Drawing'
  | 'Specification'
  | 'NegotiationRecord'
  | 'Correspondence'
  | 'Permit'
  | 'Insurance'
  | 'Bond'
  | 'Other';

export const DOCUMENT_CATEGORIES: readonly DocumentCategory[] = [
  'MasterAgreement',
  'Schedule',
  'Appendix',
  'Amendment',
  'Drawing',
  'Specification',
  'NegotiationRecord',
  'Correspondence',
  'Permit',
  'Insurance',
  'Bond',
  'Other',
];

export type DocumentSource = 'ManualUpload' | 'EmailIngestion' | 'BidHandoff';
export type MalwareScanStatus = 'Pending' | 'Clean' | 'Quarantined';
export type OcrStatus = 'NotRequired' | 'Pending' | 'Complete' | 'Failed';
export type EncryptionState = 'None' | 'EncryptedPending' | 'Decrypted';
export type RedactionState = 'None' | 'Redacted';

export interface Document {
  readonly id: DocumentId;
  readonly contractId: ContractId;
  readonly category: DocumentCategory;
  readonly mimeType: string;
  readonly originalFilename: string;
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly blobPath: string;
  readonly source: DocumentSource;
  readonly sourceEmailId: EmailId | null;
  readonly uploadedByUserId: UserId | null;
  readonly uploadedAt: Date;
  readonly language: string;
  readonly malwareScanStatus: MalwareScanStatus;
  readonly malwareScanSignatures: readonly string[] | null;
  readonly ocrStatus: OcrStatus;
  readonly ocrTextBlobPath: string | null;
  readonly encryptionState: EncryptionState;
  readonly redactionState: RedactionState;
  readonly currentVersionId: DocumentVersionId | null;
  readonly isSuperseded: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface DocumentVersion {
  readonly id: DocumentVersionId;
  readonly documentId: DocumentId;
  readonly versionLabel: string;
  readonly sha256: string;
  readonly blobPath: string;
  readonly sizeBytes: number;
  readonly uploadedByUserId: UserId | null;
  readonly uploadedAt: Date;
  readonly supersededAt: Date | null;
  readonly supersededByVersionId: DocumentVersionId | null;
}

export interface Tag {
  readonly id: TagId;
  readonly slug: string;
  readonly label: string;
  readonly category: 'Subject' | 'Status' | 'Confidentiality' | 'Workstream' | 'Other';
  readonly createdAt: Date;
}

/**
 * Documents that can carry a version chain (§5.1.6). Other categories are
 * single-blob; an "amended" master agreement is a new Amendment document
 * whose clauses supersede the master's.
 */
export const REVISABLE_CATEGORIES: readonly DocumentCategory[] = ['Drawing', 'Specification', 'Amendment'];

export function isRevisable(category: DocumentCategory): boolean {
  return REVISABLE_CATEGORIES.includes(category);
}

/** Retrievability gate — §5.2.4, security.md §6. */
export function isRetrievable(d: Pick<Document, 'malwareScanStatus'>): boolean {
  return d.malwareScanStatus === 'Clean';
}
