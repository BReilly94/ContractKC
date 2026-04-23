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

function ContractsList() {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const [contracts, setContracts] = useState<ApiContract[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api
      .listContracts({ token })
      .then((list) => setContracts(list))
      .catch((e: Error) => setError(e.message));
  }, [token]);

  return (
    <main>
      <div className="ckb-stack-row" style={{ justifyContent: 'space-between' }}>
        <h1>Contracts</h1>
        <Link href="/contracts/new">
          <Button>New contract</Button>
        </Link>
      </div>

      {error && (
        <div role="alert" className="ckb-error">
          {error}
        </div>
      )}

      {contracts === null && !error && <p>Loading…</p>}

      {contracts && contracts.length === 0 && (
        <div className="ckb-card ckb-empty-state">
          <h2>No contracts yet</h2>
          <p>
            Contracts you have access to will appear here. Start by creating one — you&apos;ll be
            walked through the essentials in three steps.
          </p>
          {user && (
            <p className="ckb-help">
              Signed in as <strong>{user.displayName}</strong>. Create requires a user flagged with{' '}
              <code>can_create_contracts</code>.
            </p>
          )}
        </div>
      )}

      {contracts && contracts.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {contracts.map((c) => (
            <li key={c.id} className="ckb-card">
              <Link
                href={`/contracts/${c.id}`}
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <div className="ckb-stack-row" style={{ justifyContent: 'space-between' }}>
                  <div>
                    <strong>{c.name}</strong>
                    <div className="ckb-help">
                      {c.governingLaw} · {c.currency}
                      {c.contractValueCents !== null
                        ? ` · ${(c.contractValueCents / 100).toLocaleString()}`
                        : ''}
                    </div>
                  </div>
                  <div>
                    <span className={`ckb-badge ${lifecycleBadgeClass(c.lifecycleState)}`}>
                      {c.lifecycleState}
                    </span>
                    {c.summaryVerificationState === 'Unverified' && (
                      <span className="ckb-badge ckb-badge--warning" style={{ marginLeft: 8 }}>
                        UNVERIFIED
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function lifecycleBadgeClass(state: string): string {
  if (state === 'Active') return 'ckb-badge--success';
  if (state === 'Archived' || state === 'Closeout') return '';
  return 'ckb-badge--warning';
}
