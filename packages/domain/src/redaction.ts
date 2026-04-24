import type { BrandedId } from '@ckb/shared';
import type { ContractId, UserId } from './ids.js';

/**
 * Redaction controls (SOW §9.4).
 *
 * Originals are never altered (NN #3). Redactions are a display-layer
 * overlay stored as separate records; the source Document/Email/.eml
 * remains bit-identical under the content-addressed SHA-256 hash.
 */

export type RedactionId = BrandedId<'Redaction'>;

export type RedactionTargetType =
  | 'Document'
  | 'DocumentVersion'
  | 'Email'
  | 'EmailAttachment'
  | 'Clause';

export type RedactionScope = 'Passage' | 'Page' | 'Document';

export type RedactionReasonCategory =
  | 'Privileged'
  | 'CommerciallySensitive'
  | 'PersonalInformation'
  | 'ThirdPartyConfidential'
  | 'LegalHold'
  | 'Other';

export interface Redaction {
  readonly id: RedactionId;
  readonly contractId: ContractId;
  readonly targetType: RedactionTargetType;
  readonly targetId: string;
  readonly targetPage: number | null;
  readonly spanStart: number | null;
  readonly spanEnd: number | null;
  readonly scope: RedactionScope;
  readonly reasonCategory: RedactionReasonCategory;
  readonly reasonNote: string | null;
  readonly redactedByUserId: UserId;
  readonly redactedAt: Date;
  readonly reversedAt: Date | null;
  readonly reversedByUserId: UserId | null;
  readonly reversalReason: string | null;
}

/**
 * Apply redactions to a text passage for display. Covered ranges are
 * replaced with a visible marker (NN #3 + §9.4: the marker itself signals
 * that content is withheld, without leaking what it was).
 */
export function applyRedactionsToText(
  text: string,
  redactions: readonly Pick<Redaction, 'spanStart' | 'spanEnd' | 'scope' | 'reversedAt'>[],
  marker = '███',
): string {
  const active = redactions
    .filter((r) => r.reversedAt === null)
    .filter((r) => r.scope === 'Passage' && r.spanStart !== null && r.spanEnd !== null)
    .map((r) => ({ start: r.spanStart as number, end: r.spanEnd as number }))
    .sort((a, b) => a.start - b.start);

  if (active.length === 0) return text;

  // Whole-document or whole-page redactions short-circuit in the caller;
  // here we only handle Passage-scoped overlays.
  let out = '';
  let cursor = 0;
  for (const { start, end } of active) {
    if (start >= text.length) break;
    const clampedStart = Math.max(cursor, start);
    const clampedEnd = Math.min(text.length, end);
    if (clampedEnd <= clampedStart) continue;
    out += text.slice(cursor, clampedStart);
    out += marker;
    cursor = clampedEnd;
  }
  out += text.slice(cursor);
  return out;
}

/**
 * For AI retrieval: decide whether a text chunk should be excluded from
 * the context entirely (whole-document/page scope) or redacted in place.
 * The caller must signal to the model that redacted content exists.
 */
export function chunkIsFullyRedacted(
  redactions: readonly Pick<Redaction, 'scope' | 'reversedAt'>[],
): boolean {
  return redactions.some((r) => r.reversedAt === null && r.scope === 'Document');
}
