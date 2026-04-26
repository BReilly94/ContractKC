export type VerificationState = 'Unverified' | 'Verified' | 'Pending';

export interface VerificationBadgeProps {
  state: VerificationState;
  inline?: boolean;
}

const ICON: Record<VerificationState, string> = {
  Unverified: '!',
  Verified:   '✓',
  Pending:    '⋯',
};

export function VerificationBadge({ state, inline = false }: VerificationBadgeProps) {
  const stateClass = state.toLowerCase();
  const inlineClass = inline ? ' ckb-verification-badge--inline' : '';
  return (
    <span
      className={`ckb-verification-badge ckb-verification-badge--${stateClass}${inlineClass}`}
      role="status"
      aria-label={`Verification status: ${state}`}
    >
      <span aria-hidden="true">{ICON[state]}</span>
      <span>{state}</span>
    </span>
  );
}
