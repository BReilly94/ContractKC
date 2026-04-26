import type { ReactNode } from 'react';

interface PanelShellProps {
  title: string;
  count?: number | null;
  action?: ReactNode;
  loading: boolean;
  error: string | null;
  empty: boolean;
  emptyMessage: string;
  children: ReactNode;
}

export function PanelShell({
  title,
  count,
  action,
  loading,
  error,
  empty,
  emptyMessage,
  children,
}: PanelShellProps) {
  return (
    <div>
      <div className="ckb-panel-header">
        <h3 className="ckb-panel-header__title">
          {title}
          {count != null && count > 0 && (
            <span className="ckb-panel-header__count">{count}</span>
          )}
        </h3>
        {action && <div>{action}</div>}
      </div>

      {error && (
        <div role="alert" className="ckb-error" style={{ marginBottom: 'var(--ckb-space-4)' }}>
          {error}
        </div>
      )}

      {loading && !error && <PanelSkeleton />}

      {!loading && !error && empty && (
        <div className="ckb-panel-empty">
          <p style={{ margin: 0 }}>{emptyMessage}</p>
        </div>
      )}

      {!loading && !error && !empty && children}
    </div>
  );
}

function PanelSkeleton() {
  const cols = [2, 1, 1, 1] as const;
  return (
    <div>
      <div
        style={{
          display: 'flex',
          gap: 'var(--ckb-space-4)',
          padding: 'var(--ckb-space-2) var(--ckb-space-3)',
          background: 'var(--ckb-surface)',
          borderRadius: 'var(--ckb-radius-sm)',
          marginBottom: 2,
        }}
      >
        {cols.map((flex, i) => (
          <span key={i} className="ckb-skeleton" style={{ height: 14, flex }} />
        ))}
      </div>
      {[1, 0.85, 0.7, 0.55].map((opacity, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            gap: 'var(--ckb-space-4)',
            padding: 'var(--ckb-space-3)',
            borderBottom: '1px solid var(--ckb-border)',
            opacity,
          }}
        >
          {cols.map((flex, j) => (
            <span key={j} className="ckb-skeleton" style={{ height: 16, flex }} />
          ))}
        </div>
      ))}
    </div>
  );
}
