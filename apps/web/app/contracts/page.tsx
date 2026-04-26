'use client';

import { Button } from '@ckb/ui-kit';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AuthedShell } from '@/components/AuthedShell';
import { api, type ApiContract } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';

export default function ContractsPage() {
  return (
    <AuthedShell>
      <ContractsList />
    </AuthedShell>
  );
}

const LIFECYCLE_LABELS: Record<ApiContract['lifecycleState'], string> = {
  Draft: 'Draft',
  Onboarding: 'Onboarding',
  Active: 'Active',
  IssueInProgress: 'Issue in Progress',
  Closeout: 'Closeout',
  Archived: 'Archived',
};

const STAT_ORDER: ApiContract['lifecycleState'][] = [
  'Active',
  'IssueInProgress',
  'Onboarding',
  'Closeout',
  'Draft',
  'Archived',
];

function lifecycleBadgeClass(state: ApiContract['lifecycleState']): string {
  if (state === 'Active') return 'ckb-badge--success';
  if (state === 'IssueInProgress') return 'ckb-badge--danger';
  if (state === 'Archived' || state === 'Closeout') return '';
  return 'ckb-badge--warning';
}

function formatValue(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(cents / 100);
  } catch {
    return `${currency} ${(cents / 100).toLocaleString()}`;
  }
}

function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-CA', {
    month: 'short',
    year: 'numeric',
  });
}

function formatDateRange(start: string, end: string | null): string {
  return end
    ? `${formatDate(start)} – ${formatDate(end)}`
    : `From ${formatDate(start)}`;
}

function ContractsList() {
  const token = useAuthStore((s) => s.token);
  const [contracts, setContracts] = useState<ApiContract[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api
      .listContracts({ token })
      .then(setContracts)
      .catch((e: Error) => setError(e.message));
  }, [token]);

  const statCounts = contracts
    ? STAT_ORDER.reduce<Partial<Record<ApiContract['lifecycleState'], number>>>(
        (acc, state) => {
          const n = contracts.filter((c) => c.lifecycleState === state).length;
          if (n > 0) acc[state] = n;
          return acc;
        },
        {},
      )
    : null;

  return (
    <main>
      <div className="ckb-contracts-header">
        <div>
          <h1 className="ckb-contracts-header__title">Contracts</h1>
          <p className="ckb-contracts-header__sub">
            Your active commercial portfolio and contract record
          </p>
        </div>
        <Link href="/contracts/new">
          <Button>New contract</Button>
        </Link>
      </div>

      {error && (
        <div role="alert" className="ckb-error" style={{ marginBottom: 'var(--ckb-space-4)' }}>
          {error}
        </div>
      )}

      {contracts === null && !error && <ContractsSkeleton />}

      {statCounts && Object.keys(statCounts).length > 0 && (
        <div className="ckb-stats-strip">
          {STAT_ORDER.filter((s) => statCounts[s]).map((state) => (
            <div key={state} className="ckb-stat">
              <div className="ckb-stat__count">{statCounts[state]}</div>
              <div className="ckb-stat__label">{LIFECYCLE_LABELS[state]}</div>
            </div>
          ))}
        </div>
      )}

      {contracts && contracts.length === 0 && (
        <div className="ckb-card ckb-empty-state">
          <h2>No contracts yet</h2>
          <p>
            Contracts you have access to will appear here. Start by creating one — you&apos;ll be
            walked through the essentials in three steps.
          </p>
        </div>
      )}

      {contracts && contracts.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {contracts.map((c) => (
            <li key={c.id} className="ckb-contract-card">
              <Link href={`/contracts/${c.id}`}>
                <div className="ckb-contract-card__header">
                  <div className="ckb-contract-card__badges">
                    <span className={`ckb-badge ${lifecycleBadgeClass(c.lifecycleState)}`}>
                      {LIFECYCLE_LABELS[c.lifecycleState]}
                    </span>
                    {c.summaryVerificationState === 'Unverified' && (
                      <span className="ckb-badge ckb-badge--warning">UNVERIFIED</span>
                    )}
                  </div>
                  <span className="ckb-contract-card__arrow" aria-hidden="true">
                    →
                  </span>
                </div>

                <h2 className="ckb-contract-card__name">{c.name}</h2>

                <p className="ckb-contract-card__meta">
                  {c.governingLaw}
                  <span className="ckb-contract-card__sep">·</span>
                  {c.currency}
                  {c.contractValueCents !== null && (
                    <>
                      <span className="ckb-contract-card__sep">·</span>
                      {formatValue(c.contractValueCents, c.currency)}
                    </>
                  )}
                </p>

                <div className="ckb-contract-card__footer">
                  <span className="ckb-help">
                    {c.projectEmailAlias ?? c.projectEmailAddress}
                  </span>
                  <span className="ckb-help">{formatDateRange(c.startDate, c.endDate)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function ContractsSkeleton() {
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {[1, 2, 3].map((i) => (
        <li key={i} className="ckb-skeleton-card">
          <div style={{ marginBottom: 'var(--ckb-space-2)' }}>
            <span className="ckb-skeleton" style={{ width: 68, height: 20 }} />
          </div>
          <span
            className="ckb-skeleton"
            style={{ width: '50%', height: 22, marginBottom: 'var(--ckb-space-2)' }}
          />
          <span
            className="ckb-skeleton"
            style={{ width: '32%', height: 15, marginBottom: 'var(--ckb-space-3)' }}
          />
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              paddingTop: 'var(--ckb-space-3)',
              borderTop: '1px solid var(--ckb-border)',
            }}
          >
            <span className="ckb-skeleton" style={{ width: '38%', height: 13 }} />
            <span className="ckb-skeleton" style={{ width: '22%', height: 13 }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
