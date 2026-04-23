'use client';

import type { ReactNode } from 'react';

export interface TabDef {
  readonly id: string;
  readonly label: string;
  readonly badge?: ReactNode;
}

export function Tabs({
  tabs,
  activeId,
  onSelect,
}: {
  tabs: readonly TabDef[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="ckb-tabs" role="tablist" aria-label="Contract sections">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={t.id === activeId}
          className="ckb-tab"
          onClick={() => onSelect(t.id)}
        >
          {t.label}
          {t.badge}
        </button>
      ))}
    </div>
  );
}
