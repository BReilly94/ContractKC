'use client';

import { useState, type ReactNode } from 'react';

export interface AppShellProps {
  sidebar: ReactNode;
  mobileBrand?: ReactNode;
  children: ReactNode;
}

export function AppShell({ sidebar, mobileBrand, children }: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  function close() {
    setMobileOpen(false);
  }

  return (
    <div className="ckb-shell">
      {mobileOpen && (
        <div
          className="ckb-sidebar-overlay"
          role="presentation"
          onClick={close}
        />
      )}

      <aside
        className={`ckb-sidebar${mobileOpen ? ' ckb-sidebar--mobile-open' : ''}`}
        aria-label="Main navigation"
      >
        {sidebar}
      </aside>

      <div className="ckb-shell__main">
        <div className="ckb-mobile-topbar" role="banner">
          <button
            type="button"
            className="ckb-mobile-topbar__toggle"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={mobileOpen}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              aria-hidden="true"
            >
              <path d="M3 5h14M3 10h14M3 15h14" strokeLinecap="round" />
            </svg>
          </button>
          {mobileBrand && (
            <div className="ckb-mobile-topbar__brand">{mobileBrand}</div>
          )}
        </div>

        <div className="ckb-shell__content">{children}</div>
      </div>
    </div>
  );
}
