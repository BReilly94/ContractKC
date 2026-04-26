export interface EmptyStateProps {
  title: string;
  description: string;
  icon?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <div className="ckb-empty-state-block">
      {icon && (
        <div className="ckb-empty-state-block__icon" aria-hidden="true">
          {icon}
        </div>
      )}
      <h3 className="ckb-empty-state-block__title">{title}</h3>
      <p className="ckb-empty-state-block__description">{description}</p>
      {action && (
        <button type="button" className="ckb-btn ckb-btn--primary" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}
