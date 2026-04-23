import type { ApiQaResponse } from '@/lib/api-client';

const LABELS: Record<ApiQaResponse['confidence'], string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
  insufficient_context: 'Insufficient context',
};

/**
 * Confidence indicator for AI responses (ui.md §4).
 * Icon + text — never colour alone.
 */
export function ConfidenceBadge({ level }: { level: ApiQaResponse['confidence'] }) {
  const icon = level === 'high' ? '●' : level === 'medium' ? '◐' : '○';
  return (
    <span className={`ckb-confidence ckb-confidence--${level}`}>
      <span aria-hidden="true">{icon}</span>
      <span>{LABELS[level]}</span>
    </span>
  );
}
