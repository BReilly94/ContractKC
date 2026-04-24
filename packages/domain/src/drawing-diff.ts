import type { BrandedId } from '@ckb/shared';
import type { ContractId, UserId } from './ids.js';
import type { DocumentId, DocumentVersionId } from './document.js';

/**
 * Drawing Comparison (§6.17). Produced when a new revision of a Drawing
 * is ingested — diffs the OCR'd text layers and classifies the scope
 * impact. The capability outputs cited regions that describe the change;
 * they are persisted as `change_regions` JSON and rendered on the
 * timeline + raised as a record_flag (Observation) with severity
 * derived from `scope_impact`.
 */

export type DrawingDiffId = BrandedId<'DrawingDiff'>;

export type DrawingDiffScopeImpact = 'None' | 'Minor' | 'Major' | 'Suspected';

export interface DrawingChangeRegion {
  readonly description: string;
  readonly priorExcerpt: string;
  readonly newExcerpt: string;
  readonly citation: string;
}

export interface DrawingDiff {
  readonly id: DrawingDiffId;
  readonly contractId: ContractId;
  readonly documentId: DocumentId;
  readonly priorVersionId: DocumentVersionId;
  readonly newVersionId: DocumentVersionId;
  readonly diffSummary: string;
  readonly changeRegions: readonly DrawingChangeRegion[];
  readonly scopeImpact: DrawingDiffScopeImpact;
  readonly aiCapabilityVersion: string;
  readonly createdByUserId: UserId;
  readonly createdAt: Date;
}

/**
 * Map the capability's scope_impact onto a `record_flag.severity`. The
 * Observation flag raised from a diff carries this severity so a
 * site-supervisor triaging flags on the dashboard can prioritize.
 */
export function severityForScopeImpact(
  impact: DrawingDiffScopeImpact,
): 'Low' | 'Medium' | 'High' | 'Critical' | null {
  switch (impact) {
    case 'None':
      return null;
    case 'Minor':
      return 'Low';
    case 'Suspected':
      return 'Medium';
    case 'Major':
      return 'High';
  }
}
