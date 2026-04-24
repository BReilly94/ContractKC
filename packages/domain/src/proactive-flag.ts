import type { BrandedId } from '@ckb/shared';
import type { ContractId, UserId } from './ids.js';

/**
 * Proactive AI Flagging (§6.15, §7.10).
 *
 * A ProactiveFlag is raised unprompted when the flagging pipeline
 * detects that an ingestion event (email, document, diary, drawing)
 * may require a human decision — typical examples:
 *
 *  - An incoming email that may constitute a contractual notice.
 *  - A site instruction that directs work potentially outside scope.
 *  - A milestone imminent with no preparation activity logged.
 *  - A drawing revision that changes ventilation/structural layout.
 *
 * Two-tier routing (§7.10): a Sonnet first-pass classifier decides
 * whether an event is worth a deeper look, and only candidates that
 * pass run through an Opus deep-review. Every flag must cite at
 * least one clause/email/document from the retrieval set (NN #1)
 * — flags that fail citation verification are logged as AI quality
 * incidents and never shown to users.
 *
 * Cost control is enforced through a per-contract daily flag budget
 * (see FlagBudget). When the budget is exceeded, the pipeline alerts
 * the KnowledgeCentreAdministrator rather than silently throttling.
 */

export type ProactiveFlagId = BrandedId<'ProactiveFlag'>;

export type ProactiveFlagTriggerType =
  | 'Email'
  | 'Document'
  | 'SiteDiaryEntry'
  | 'DrawingRevision';

export type ProactiveFlagKind =
  | 'PossibleNotice'
  | 'SuspectedScopeChange'
  | 'DeadlineImminentNoPrep'
  | 'RevisionScopeImpact'
  | 'Other';

export type ProactiveFlagStatus =
  | 'New'
  | 'Actioned'
  | 'Dismissed'
  | 'Escalated';

export type FlagSensitivityProfile = 'Conservative' | 'Standard' | 'Aggressive';

export interface ProactiveFlag {
  readonly id: ProactiveFlagId;
  readonly contractId: ContractId;
  readonly triggerEventType: ProactiveFlagTriggerType;
  readonly triggerEventId: string;
  readonly flagKind: ProactiveFlagKind;
  readonly reasoning: string;
  readonly citedClauseIds: readonly string[];
  readonly citedChunkIds: readonly string[];
  readonly recommendedAction: string;
  readonly status: ProactiveFlagStatus;
  readonly actionedByUserId: UserId | null;
  readonly actionedAt: Date | null;
  readonly actionNote: string | null;
  readonly firstPassModel: string;
  readonly deepReviewModel: string | null;
  readonly sensitivityProfile: FlagSensitivityProfile;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export const LEGAL_PROACTIVE_FLAG_TRANSITIONS: ReadonlyArray<{
  readonly from: ProactiveFlagStatus;
  readonly to: ProactiveFlagStatus;
}> = [
  { from: 'New', to: 'Actioned' },
  { from: 'New', to: 'Dismissed' },
  { from: 'New', to: 'Escalated' },
  { from: 'Escalated', to: 'Actioned' },
  { from: 'Escalated', to: 'Dismissed' },
];

export function isLegalProactiveFlagTransition(
  from: ProactiveFlagStatus,
  to: ProactiveFlagStatus,
): boolean {
  return LEGAL_PROACTIVE_FLAG_TRANSITIONS.some((t) => t.from === from && t.to === to);
}
