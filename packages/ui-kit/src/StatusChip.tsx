const CHIP_CLASS: Record<string, string> = {
  Active:          'ckb-status-chip--active',
  Onboarding:      'ckb-status-chip--onboarding',
  IssueInProgress: 'ckb-status-chip--issue',
  Closeout:        'ckb-status-chip--closeout',
  Draft:           'ckb-status-chip--draft',
  Archived:        'ckb-status-chip--archived',
  Suspended:       'ckb-status-chip--suspended',
};

const CHIP_LABEL: Record<string, string> = {
  Active:          'Active',
  Onboarding:      'Onboarding',
  IssueInProgress: 'Issue in Progress',
  Closeout:        'Closeout',
  Draft:           'Draft',
  Archived:        'Archived',
  Suspended:       'Suspended',
};

export interface StatusChipProps {
  status: string;
  label?: string;
  size?: 'sm' | 'md';
}

export function StatusChip({ status, label, size = 'md' }: StatusChipProps) {
  const modClass = CHIP_CLASS[status] ?? '';
  const sizeClass = size === 'sm' ? ' ckb-status-chip--sm' : '';
  const displayLabel = label ?? CHIP_LABEL[status] ?? status;
  return (
    <span className={`ckb-status-chip${modClass ? ` ${modClass}` : ''}${sizeClass}`}>
      {displayLabel}
    </span>
  );
}
