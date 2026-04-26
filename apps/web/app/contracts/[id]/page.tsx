'use client';

import { Button } from '@ckb/ui-kit';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BidDocumentsPanel } from '@/components/contract-tabs/BidDocumentsPanel';
import { ClaimsPanel } from '@/components/contract-tabs/ClaimsPanel';
import { ContactsPanel } from '@/components/contract-tabs/ContactsPanel';
import { DeadlinesPanel } from '@/components/contract-tabs/DeadlinesPanel';
import { DocumentsPanel } from '@/components/contract-tabs/DocumentsPanel';
import { EmailsPanel } from '@/components/contract-tabs/EmailsPanel';
import { QueryPanel } from '@/components/contract-tabs/QueryPanel';
import { ReviewQueuePanel } from '@/components/contract-tabs/ReviewQueuePanel';
import { RisksPanel } from '@/components/contract-tabs/RisksPanel';
import { SummaryPanel } from '@/components/contract-tabs/SummaryPanel';
import { Tabs } from '@/components/contract-tabs/Tabs';
import { TimelinePanel } from '@/components/contract-tabs/TimelinePanel';
import { VariationsPanel } from '@/components/contract-tabs/VariationsPanel';
import { AuthedShell } from '@/components/AuthedShell';
import { api, type ApiContract, type ApiParty, type ApiUser } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';

type TabId =
  | 'overview'
  | 'summary'
  | 'query'
  | 'documents'
  | 'bid-docs'
  | 'emails'
  | 'deadlines'
  | 'contacts'
  | 'review'
  | 'timeline'
  | 'variations'
  | 'risks'
  | 'claims';

const LIFECYCLE_LABELS: Record<ApiContract['lifecycleState'], string> = {
  Draft: 'Draft',
  Onboarding: 'Onboarding',
  Active: 'Active',
  IssueInProgress: 'Issue in Progress',
  Closeout: 'Closeout',
  Archived: 'Archived',
};

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
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateRange(start: string, end: string | null): string {
  return end ? `${formatDate(start)} – ${formatDate(end)}` : `From ${formatDate(start)}`;
}

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
  const [parties, setParties] = useState<ApiParty[]>([]);
  const [pmUsers, setPmUsers] = useState<ApiUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  useEffect(() => {
    if (!token || !params.id) return;
    Promise.all([
      api.getContract({ token }, params.id),
      api.listParties({ token }),
      api.listPmUsers({ token }),
    ])
      .then(([c, p, u]) => {
        setContract(c);
        setParties(p);
        setPmUsers(u);
      })
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

  if (error) {
    return (
      <main>
        <Link href="/contracts" className="ckb-detail-back" style={{ marginBottom: 16, display: 'inline-flex' }}>
          ← Contracts
        </Link>
        <div role="alert" className="ckb-error">
          {error}
        </div>
      </main>
    );
  }

  if (!contract) {
    return (
      <main>
        <DetailSkeleton />
      </main>
    );
  }

  const clientParty = parties.find((p) => p.id === contract.clientPartyId);
  const responsiblePm = pmUsers.find((u) => u.id === contract.responsiblePmUserId);

  return (
    <main>
      <div className="ckb-detail-nav">
        <Link href="/contracts" className="ckb-detail-back">
          ← Contracts
        </Link>
        <div className="ckb-detail-badges">
          <span className={`ckb-badge ${lifecycleBadgeClass(contract.lifecycleState)}`}>
            {LIFECYCLE_LABELS[contract.lifecycleState]}
          </span>
          {contract.summaryVerificationState === 'Unverified' && (
            <span className="ckb-badge ckb-badge--warning">SUMMARY UNVERIFIED</span>
          )}
          {contract.confidentialityClass !== 'Standard' && (
            <span className="ckb-badge">{contract.confidentialityClass}</span>
          )}
        </div>
      </div>

      <h1 className="ckb-detail-title">{contract.name}</h1>

      <div className="ckb-detail-facts">
        {clientParty && (
          <>
            <span>{clientParty.name}</span>
            <span className="ckb-detail-facts__sep">·</span>
          </>
        )}
        <span>{contract.governingLaw}</span>
        <span className="ckb-detail-facts__sep">·</span>
        <span>{formatDateRange(contract.startDate, contract.endDate)}</span>
        {contract.contractValueCents !== null && (
          <>
            <span className="ckb-detail-facts__sep">·</span>
            <span>{formatValue(contract.contractValueCents, contract.currency)}</span>
          </>
        )}
        <span className="ckb-detail-facts__sep">·</span>
        <span className="ckb-help">{contract.projectEmailAlias ?? contract.projectEmailAddress}</span>
      </div>

      <Tabs
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'summary', label: 'Summary' },
          { id: 'query', label: 'Query' },
          { id: 'documents', label: 'Documents' },
          { id: 'bid-docs', label: 'Bid docs' },
          { id: 'emails', label: 'Emails' },
          { id: 'deadlines', label: 'Deadlines' },
          { id: 'contacts', label: 'Contacts' },
          { id: 'review', label: 'Review queue' },
          { id: 'timeline', label: 'Timeline' },
          { id: 'variations', label: 'Variations' },
          { id: 'risks', label: 'Risks' },
          { id: 'claims', label: 'Claims' },
        ]}
        activeId={activeTab}
        onSelect={(id) => setActiveTab(id as TabId)}
      />

      {activeTab === 'overview' && (
        <OverviewPanel
          contract={contract}
          clientParty={clientParty ?? null}
          responsiblePm={responsiblePm ?? null}
          onActivate={activate}
          busy={busy}
        />
      )}
      {activeTab === 'summary' && <SummaryPanel contractId={contract.id} />}
      {activeTab === 'query' && <QueryPanel contractId={contract.id} />}
      {activeTab === 'documents' && <DocumentsPanel contractId={contract.id} />}
      {activeTab === 'bid-docs' && <BidDocumentsPanel contractId={contract.id} />}
      {activeTab === 'emails' && <EmailsPanel contractId={contract.id} />}
      {activeTab === 'deadlines' && <DeadlinesPanel contractId={contract.id} />}
      {activeTab === 'contacts' && <ContactsPanel contractId={contract.id} />}
      {activeTab === 'review' && <ReviewQueuePanel contractId={contract.id} />}
      {activeTab === 'timeline' && <TimelinePanel contractId={contract.id} />}
      {activeTab === 'variations' && <VariationsPanel contractId={contract.id} />}
      {activeTab === 'risks' && <RisksPanel contractId={contract.id} />}
      {activeTab === 'claims' && <ClaimsPanel contractId={contract.id} />}
    </main>
  );
}

function OverviewPanel({
  contract,
  clientParty,
  responsiblePm,
  onActivate,
  busy,
}: {
  contract: ApiContract;
  clientParty: ApiParty | null;
  responsiblePm: ApiUser | null;
  onActivate: () => void;
  busy: boolean;
}) {
  return (
    <div>
      <div className="ckb-card">
        <h3 style={{ margin: '0 0 var(--ckb-space-2)' }}>Contract details</h3>
        <dl className="ckb-meta-grid">
          <dt>Client</dt>
          <dd>{clientParty?.name ?? <span className="ckb-help">ID {contract.clientPartyId.slice(0, 8)}…</span>}</dd>

          <dt>Responsible PM</dt>
          <dd>
            {responsiblePm?.displayName ?? (
              <span className="ckb-help">ID {contract.responsiblePmUserId.slice(0, 8)}…</span>
            )}
          </dd>

          <dt>Value</dt>
          <dd>
            {contract.contractValueCents === null
              ? '—'
              : formatValue(contract.contractValueCents, contract.currency)}
          </dd>

          <dt>Term</dt>
          <dd>{formatDateRange(contract.startDate, contract.endDate)}</dd>

          <dt>Governing law</dt>
          <dd>{contract.governingLaw}</dd>

          <dt>Confidentiality</dt>
          <dd>{contract.confidentialityClass}</dd>

          <dt>Language</dt>
          <dd>{contract.language}</dd>

          <dt>Project email</dt>
          <dd>
            {contract.projectEmailAlias ? (
              <>
                <span>{contract.projectEmailAlias}</span>
                <span className="ckb-help" style={{ marginLeft: 8 }}>
                  ({contract.projectEmailAddress})
                </span>
              </>
            ) : (
              contract.projectEmailAddress
            )}
          </dd>
        </dl>
      </div>

      {contract.lifecycleState === 'Onboarding' && (
        <div className="ckb-card">
          <h3 style={{ margin: '0 0 var(--ckb-space-2)' }}>Activate contract</h3>
          {contract.summaryVerificationState === 'Verified' ? (
            <>
              <p style={{ margin: '0 0 var(--ckb-space-4)', color: 'var(--ckb-text-muted)' }}>
                Summary is verified. The contract can move from Onboarding to Active.
              </p>
              <Button onClick={onActivate} disabled={busy}>
                {busy ? 'Activating…' : 'Activate contract'}
              </Button>
            </>
          ) : (
            <p style={{ margin: 0, color: 'var(--ckb-text-muted)' }}>
              The contract summary must be verified before activation. Open the{' '}
              <strong>Summary</strong> tab to generate and verify it.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <>
      <span className="ckb-skeleton" style={{ width: 100, height: 14, marginBottom: 'var(--ckb-space-4)' }} />
      <span className="ckb-skeleton" style={{ width: '55%', height: 32, marginBottom: 'var(--ckb-space-2)' }} />
      <span className="ckb-skeleton" style={{ width: '70%', height: 18, marginBottom: 'var(--ckb-space-6)' }} />
      <div style={{ display: 'flex', gap: 'var(--ckb-space-3)', marginBottom: 'var(--ckb-space-4)' }}>
        {[80, 60, 90, 70, 50, 80, 70, 60, 90].map((w, i) => (
          <span key={i} className="ckb-skeleton" style={{ width: w, height: 38, borderRadius: 'var(--ckb-radius-sm)' }} />
        ))}
      </div>
      <div className="ckb-skeleton-card">
        {[['30%', 16], ['50%', 16], ['25%', 16], ['40%', 16], ['35%', 16]].map(([w, h], i) => (
          <span
            key={i}
            className="ckb-skeleton"
            style={{ width: w as string, height: h as number, marginBottom: 'var(--ckb-space-2)', display: 'block' }}
          />
        ))}
      </div>
    </>
  );
}
