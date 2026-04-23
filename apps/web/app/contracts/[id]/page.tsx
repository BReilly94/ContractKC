'use client';

import { Button } from '@ckb/ui-kit';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ContactsPanel } from '@/components/contract-tabs/ContactsPanel';
import { DeadlinesPanel } from '@/components/contract-tabs/DeadlinesPanel';
import { DocumentsPanel } from '@/components/contract-tabs/DocumentsPanel';
import { EmailsPanel } from '@/components/contract-tabs/EmailsPanel';
import { QueryPanel } from '@/components/contract-tabs/QueryPanel';
import { ReviewQueuePanel } from '@/components/contract-tabs/ReviewQueuePanel';
import { SummaryPanel } from '@/components/contract-tabs/SummaryPanel';
import { Tabs } from '@/components/contract-tabs/Tabs';
import { AuthedShell } from '@/components/AuthedShell';
import { api, type ApiContract } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';

type TabId =
  | 'overview'
  | 'summary'
  | 'query'
  | 'documents'
  | 'emails'
  | 'deadlines'
  | 'contacts'
  | 'review';

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
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  useEffect(() => {
    if (!token || !params.id) return;
    api
      .getContract({ token }, params.id)
      .then(setContract)
      .catch((e: Error) => setError(e.message));
  }, [token, params.id]);

  async function activate(): Promise<void> {
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

  if (error)
    return (
      <main>
        <div role="alert" className="ckb-error">
          {error}
        </div>
      </main>
    );
  if (!contract)
    return (
      <main>
        <p>Loading…</p>
      </main>
    );

  return (
    <main>
      <div className="ckb-stack-row" style={{ justifyContent: 'space-between' }}>
        <h1>{contract.name}</h1>
        <Link href="/contracts">
          <Button variant="ghost">← Back to contracts</Button>
        </Link>
      </div>

      <div className="ckb-stack-row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <span className="ckb-badge">{contract.lifecycleState}</span>
        {contract.summaryVerificationState === 'Unverified' && (
          <span className="ckb-badge ckb-badge--warning">SUMMARY UNVERIFIED</span>
        )}
        <span className="ckb-badge">{contract.confidentialityClass}</span>
        <span className="ckb-badge">{contract.language}</span>
        <span className="ckb-help">
          Project email: <code>{contract.projectEmailAddress}</code>
          {contract.projectEmailAlias && (
            <>
              {' '}
              · alias <code>{contract.projectEmailAlias}</code>
            </>
          )}
        </span>
      </div>

      <Tabs
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'summary', label: 'Summary' },
          { id: 'query', label: 'Query' },
          { id: 'documents', label: 'Documents' },
          { id: 'emails', label: 'Emails' },
          { id: 'deadlines', label: 'Deadlines' },
          { id: 'contacts', label: 'Contacts' },
          { id: 'review', label: 'Review queue' },
        ]}
        activeId={activeTab}
        onSelect={(id) => setActiveTab(id as TabId)}
      />

      {activeTab === 'overview' && <OverviewPanel contract={contract} onActivate={activate} busy={busy} />}
      {activeTab === 'summary' && <SummaryPanel contractId={contract.id} />}
      {activeTab === 'query' && <QueryPanel contractId={contract.id} />}
      {activeTab === 'documents' && <DocumentsPanel contractId={contract.id} />}
      {activeTab === 'emails' && <EmailsPanel contractId={contract.id} />}
      {activeTab === 'deadlines' && <DeadlinesPanel contractId={contract.id} />}
      {activeTab === 'contacts' && <ContactsPanel contractId={contract.id} />}
      {activeTab === 'review' && <ReviewQueuePanel contractId={contract.id} />}
    </main>
  );
}

function OverviewPanel({
  contract,
  onActivate,
  busy,
}: {
  contract: ApiContract;
  onActivate: () => void;
  busy: boolean;
}) {
  return (
    <div>
      <div className="ckb-card">
        <h3>Metadata</h3>
        <dl>
          <dt>Client party</dt>
          <dd>
            <code>{contract.clientPartyId}</code>
          </dd>
          <dt>Responsible PM</dt>
          <dd>
            <code>{contract.responsiblePmUserId}</code>
          </dd>
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
          <dt>Vector namespace</dt>
          <dd>
            <code>{contract.vectorNamespace}</code>
          </dd>
        </dl>
      </div>

      {contract.lifecycleState === 'Onboarding' && (
        <div className="ckb-card">
          <h3>Activate contract</h3>
          {contract.summaryVerificationState === 'Verified' ? (
            <>
              <p>Summary is verified. The Onboarding → Active transition is open.</p>
              <Button onClick={onActivate} disabled={busy}>
                {busy ? 'Activating…' : 'Activate contract'}
              </Button>
            </>
          ) : (
            <p>
              The contract summary is Unverified. Go to the <strong>Summary</strong> tab to
              generate and verify it (Non-Negotiable #2).
            </p>
          )}
        </div>
      )}
    </div>
  );
}
