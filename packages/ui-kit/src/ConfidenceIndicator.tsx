export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'insufficient_context';

const LABELS: Record<ConfidenceLevel, string> = {
  high:                 'High confidence',
  medium:               'Medium confidence',
  low:                  'Low confidence',
  insufficient_context: 'Insufficient context',
};

export interface ConfidenceIndicatorProps {
  level: ConfidenceLevel;
}

export function ConfidenceIndicator({ level }: ConfidenceIndicatorProps) {
  return (
    <span className={`ckb-confidence-indicator ckb-confidence-indicator--${level}`}>
      <span className="ckb-confidence-indicator__dot" aria-hidden="true" />
      <span>{LABELS[level]}</span>
    </span>
  );
}
