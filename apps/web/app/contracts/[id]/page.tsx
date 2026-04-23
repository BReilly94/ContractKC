'use client';

import { Button } from '@ckb/ui-kit';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AuthedShell } from '@/components/AuthedShell';
import { api, type ApiContract } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';

export default function ContractDetailPage() {
  return (
    <AuthedShell>
      <Detail />
    </AuthedShell>
  );
}

function Detail() {
  const params = useParams<{ id: string }>();
  const token = useAuthStore((s) => s.token);
  const [contract, setContract] = useState<ApiContract | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token || !params.id) return;
    api
      .getContract({ token }, params.id)
      .then(setContract)
      .catch((e: Error) => setError(e.message));
  }, [token, params.id]);

  async function activate() {
    if (!token || !contract) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api.transitionLifecycle({ token }, contract.id, 'Active');
      setContract(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Transition failed');
    } finally {
      setBusy(false);
    }
  }

  if (error) return <main><div role="alert" className="ckb-error">{error}</div></main>;
  if (!contract) return <main><p>Loading…</p></main>;

  return (
    <main>
      <div className="ckb-stack-row" style={{ justifyContent: 'space-between' }}>
        <h1>{contract.name}</h1>
        <Link href="/contracts">
          <Button variant="ghost">← Back to contracts</Button>
        </Link>
      </div>

      <div className="ckb-card">
        <div className="ckb-stack-row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <span className="ckb-badge">{contract.lifecycleState}</span>
          {contract.summaryVerificationState === 'Unverified' && (
            <span className="ckb-badge ckb-badge--warning">SUMMARY UNVERIFIED</span>
          )}
          <span className="ckb-badge">{contract.confidentialityClass}</span>
          <span className="ckb-badge">{contract.language}</span>
        </div>
      </div>

      <div className="ckb-card">
        <h2>Metadata</h2>
        <dl>
          <dt>Client party</dt>
          <dd>{contract.clientPartyId}</dd>
          <dt>Responsible PM</dt>
          <dd>{contract.responsiblePmUserId}</dd>
          <dt>Value</dt>
          <dd>
            {contract.contractValueCents === null
              ? '—'
              : new Intl.NumberFormat('en-CA', {
                  style: 'currency',
                  currency: contract.currency,
                }).format(contract.contractValueCents / 100)}
          </dd>
          <dt>Term</dt>
          <dd>
            {contract.startDate} → {contract.endDate ?? 'open-ended'}
          </dd>
          <dt>Governing law</dt>
          <dd>{contract.governingLaw}</dd>
          <dt>Project email</dt>
          <dd>
            <code>{contract.projectEmailAddress}</code>
            {contract.projectEmailAlias && (
              <>
                {' '}
                · alias <code>{contract.projectEmailAlias}</code>
              </>
            )}
          </dd>
          <dt>Vector namespace</dt>
          <dd>
            <code>{contract.vectorNamespace}</code>
          </dd>
        </dl>
      </div>

      <div className="ckb-card">
        <h2>Summary status</h2>
        {contract.summaryVerificationState === 'Unverified' && (
          <>
            <p>
              The contract summary is <strong>Unverified</strong>. Summary generation and
              human verification land in SOW §5.4 and are not built yet. Until the summary is
              verified, this contract cannot transition from <strong>Onboarding</strong> to{' '}
              <strong>Active</strong> — Non-Negotiable #2.
            </p>
            <p className="ckb-help">
              In a future slice, summary generation fills <code>content_json</code> and a Contract
              Owner approves it to mark <code>verification_state = Verified</code>.
            </p>
          </>
        )}
        {contract.summaryVerificationState === 'Verified' && (
          <p>
            Summary is <strong>Verified</strong>. The{' '}
            <code>Onboarding → Active</code> transition gate is open.
          </p>
        )}
      </div>

      {contract.lifecycleState === 'Onboarding' &&
        contract.summaryVerificationState === 'Verified' && (
          <Button onClick={activate} disabled={busy}>
            {busy ? 'Activating…' : 'Activate contract'}
          </Button>
        )}
    </main>
  );
}
