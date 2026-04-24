import type { BrandedId } from '@ckb/shared';
import type { ContractId, UserId } from './ids.js';

/**
 * Evidence Packaging (SOW §3.37). The single most visible Phase 2 ROI
 * feature — turns a claim-day folder-dive into a one-click bundle with
 * chain-of-custody and redaction log baked in.
 */

export type EvidenceBundleId = BrandedId<'EvidenceBundle'>;
export type EvidenceBundleArtifactId = BrandedId<'EvidenceBundleArtifact'>;

export type EvidenceBundleSourceType =
  | 'Claim'
  | 'Variation'
  | 'Dispute'
  | 'Query'
  | 'Standalone';

export type EvidenceBundleBuildState =
  | 'Pending'
  | 'Building'
  | 'Built'
  | 'Submitted'
  | 'Failed';

export type EvidenceArtifactType =
  | 'Document'
  | 'DocumentVersion'
  | 'Email'
  | 'EmailAttachment'
  | 'Clause'
  | 'SiteDiaryEntry'
  | 'RecordFlag'
  | 'Variation'
  | 'Claim';

export interface EvidenceBundle {
  readonly id: EvidenceBundleId;
  readonly contractId: ContractId;
  readonly sourceType: EvidenceBundleSourceType;
  readonly sourceId: string | null;
  readonly title: string;
  readonly version: number;
  readonly previousBundleId: EvidenceBundleId | null;
  readonly includeRedacted: boolean;
  readonly pdfPortfolioBlobPath: string | null;
  readonly zipPackageBlobPath: string | null;
  readonly manifestBlobPath: string | null;
  readonly redactionLogBlobPath: string | null;
  readonly byteSize: number | null;
  readonly fileCount: number | null;
  readonly manifestSha256: string | null;
  readonly buildState: EvidenceBundleBuildState;
  readonly builtAt: Date | null;
  readonly submittedExternallyAt: Date | null;
  readonly submittedExternallyByUserId: UserId | null;
  readonly lockedAt: Date | null;
  readonly createdByUserId: UserId;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface EvidenceBundleArtifact {
  readonly id: EvidenceBundleArtifactId;
  readonly bundleId: EvidenceBundleId;
  readonly artifactType: EvidenceArtifactType;
  readonly artifactId: string;
  readonly originalFilename: string | null;
  readonly sha256: string | null;
  readonly ingestedAt: Date | null;
  readonly ingestedByUserId: UserId | null;
  readonly versionChainJson: string | null;
  readonly includeInPdf: boolean;
  readonly displayOrder: number;
  readonly citationNote: string | null;
  readonly redactionSummaryJson: string | null;
  readonly createdAt: Date;
}

/**
 * Chain-of-custody manifest row as it appears in the standalone manifest
 * PDF attached to every bundle. Per SOW §3.37: source, original filename,
 * file hash, ingestion timestamp, ingesting user, subsequent version events.
 */
export interface ChainOfCustodyRow {
  readonly artifactType: EvidenceArtifactType;
  readonly artifactId: string;
  readonly originalFilename: string;
  readonly sha256: string;
  readonly source: string; // e.g., "manual upload", "email ingestion", "bid handoff", "diary entry"
  readonly ingestedAt: Date;
  readonly ingestedByUserId: UserId;
  readonly versionEvents: readonly {
    readonly at: Date;
    readonly event: string;
    readonly byUserId: UserId | null;
  }[];
}

/**
 * Redaction log row that accompanies any bundle containing redactions.
 * Records WHAT was redacted and WHY — never the redacted content itself.
 */
export interface RedactionLogRow {
  readonly redactionId: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly scope: string;
  readonly reasonCategory: string;
  readonly redactedAt: Date;
  readonly redactedByUserId: UserId;
  readonly reversedAt: Date | null;
}
