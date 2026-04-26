'use client';

import { Button } from '@ckb/ui-kit';
import { useEffect, useState } from 'react';
import { api, type ApiClaim } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';

const RESOLVABLE_STATES = [
  'ResolvedWon',
  'ResolvedSettled',
  'ResolvedLost',
  'ResolvedWithdrawn',
] as const;

const STATE_BADGE: Record<string, string> = {
  Draft: '',
  InternalReview: '',
  Submitted: 'ckb-badge--info',
  ClientResponseReceived: 'ckb-badge--info',
  UnderNegotiation: 'ckb-badge--warning',
  ResolvedWon: 'ckb-badge--success',
  ResolvedSettled: 'ckb-badge--success',
  ResolvedLost: 'ckb-badge--warning',
  ResolvedWithdrawn: '',
};

function formatMoney(cents: number | null): string {
  if (cents === null) return '—';
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function isResolved(state: string): boolean {
  return (RESOLVABLE_STATES as readonly string[]).includes(state);
}

export function ClaimsPanel({ contractId }: { contractId: string }) {
  const token = useAuthStore((s) => s.token);
  const [claims, setClaims] = useState<ApiClaim[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function reload(): Promise<void> {
    if (!token) return;
    try {
      const result = await api.listClaims({ token }, contractId);
      setClaims(result.items);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void reload();
  }, [token, contractId]);

  const active = claims?.filter((c) => !isResolved(c.lifecycleState)) ?? [];
  const resolved = claims?.filter((c) => isResolved(c.lifecycleState)) ?? [];

  return (
    <div>
      <div className="ckb-stack-row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>Claim Register</h3>
        <Button onClick={() => setShowCreate(true)}>New claim</Button>
      </div>

      {error && (
        <div role="alert" className="ckb-error">
          {error}
        </div>
      )}
      {claims === null && <p>Loading…</p>}
      {claims !== null && claims.length === 0 && (
        <div className="ckb-empty-state">
          <p>
            No claims recorded. Create a claim when an entitlement arises — attach
            supporting evidence and use the Readiness Score to track its strength
            before submission.
          </p>
        </div>
      )}

      {active.length > 0 && (
        <>
          <h4>Active ({active.length})</h4>
          <ClaimTable
            claims={active}
            expandedId={expandedId}
            onExpand={(id) => setExpandedId(expandedId === id ? null : id)}
            contractId={contractId}
            onTransitioned={() => void reload()}
          />
        </>
      )}

      {resolved.length > 0 && (
        <>
          <h4 style={{ marginTop: 16 }}>Resolved ({resolved.length})</h4>
          <ClaimTable
            claims={resolved}
            expandedId={expandedId}
            onExpand={(id) => setExpandedId(expandedId === id ? null : id)}
            contractId={contractId}
            onTransitioned={() => void reload()}
          />
        </>
      )}

      {showCreate && (
        <CreateClaimDialog
          contractId={contractId}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            void reload();
          }}
        />
      )}
    </div>
  );
}

function ClaimTable({
  claims,
  expandedId,
  onExpand,
  contractId,
  onTransitioned,
}: {
  claims: ApiClaim[];
  expandedId: string | null;
  onExpand: (id: string) => void;
  contractId: string;
  onTransitioned: () => void;
}) {
  return (
    <table className="ckb-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Title</th>
          <th>Status</th>
          <th>Amount claimed</th>
          <th>Time (days)</th>
          <th>Submitted</th>
        </tr>
      </thead>
      <tbody>
        {claims.map((c) => (
          <>
            <tr
              key={c.id}
              style={{ cursor: 'pointer' }}
              onClick={() => onExpand(c.id)}
              aria-expanded={expandedId === c.id}
            >
              <td>{c.claimNumber ?? '—'}</td>
              <td>{c.title}</td>
              <td>
                <span className={`ckb-badge ${STATE_BADGE[c.lifecycleState] ?? ''}`}>
                  {c.lifecycleState}
                </span>
              </td>
              <td>{formatMoney(c.amountClaimedCents)}</td>
              <td>{c.timeImpactDays ?? '—'}</td>
              <td>
                {c.submittedAt ? new Date(c.submittedAt).toLocaleDateString() : '—'}
              </td>
            </tr>
            {expandedId === c.id && (
              <tr key={`${c.id}-detail`}>
                <td colSpan={6}>
                  <ClaimDetail
                    claim={c}
                    contractId={contractId}
                    onTransitioned={onTransitioned}
                  />
                </td>
              </tr>
            )}
          </>
        ))}
      </tbody>
    </table>
  );
}

function ClaimDetail({
  claim,
  contractId,
  onTransitioned,
}: {
  claim: ApiClaim;
  contractId: string;
  onTransitioned: () => void;
}) {
  const token = useAuthStore((s) => s.token);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function transition(target: string): Promise<void> {
    if (!token) return;
    setBusy(true);
    setErr(null);
    try {
      await api.transitionClaim({ token }, contractId, claim.id, target);
      onTransitioned();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const nextStates = NEXT_STATES[claim.lifecycleState] ?? [];

  return (
    <div className="ckb-card" style={{ margin: '4px 0' }}>
      {claim.triggerEventSummary && (
        <p>
          <strong>Trigger:</strong> {claim.triggerEventSummary}
        </p>
      )}
      {claim.narrative && (
        <p>
          <strong>Narrative:</strong> {claim.narrative.slice(0, 400)}
          {claim.narrative.length > 400 ? '…' : ''}
        </p>
      )}
      {claim.amountAwardedCents !== null && (
        <p>
          <strong>Awarded:</strong> {formatMoney(claim.amountAwardedCents)}
        </p>
      )}
      {claim.resolutionNote && (
        <p>
          <strong>Resolution:</strong> {claim.resolutionNote}
        </p>
      )}
      {err && (
        <div role="alert" className="ckb-error">
          {err}
        </div>
      )}
      {nextStates.length > 0 && (
        <div className="ckb-stack-row" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          {nextStates.map((s) => (
            <Button
              key={s}
              variant="ghost"
              onClick={() => void transition(s)}
              disabled={busy}
            >
              → {s}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

const NEXT_STATES: Record<string, string[]> = {
  Draft: ['InternalReview'],
  InternalReview: ['Submitted', 'Draft'],
  Submitted: ['ClientResponseReceived'],
  ClientResponseReceived: ['UnderNegotiation', 'ResolvedWon', 'ResolvedSettled', 'ResolvedLost'],
  UnderNegotiation: ['ResolvedWon', 'ResolvedSettled', 'ResolvedLost', 'ResolvedWithdrawn'],
};

function CreateClaimDialog({
  contractId,
  onClose,
  onCreated,
}: {
  contractId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const token = useAuthStore((s) => s.token);
  const [title, setTitle] = useState('');
  const [trigger, setTrigger] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(): Promise<void> {
    if (!token || !title.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await api.createClaim({ token }, contractId, {
        title: title.trim(),
        triggerEventSummary: trigger.trim() || null,
        primaryClauseId: null,
      });
      onCreated();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ckb-card" style={{ marginTop: 16 }}>
      <h4>New claim</h4>
      <p className="ckb-help">
        Creates a Draft claim. Add narrative and evidence before advancing to Internal Review.
      </p>
      <div>
        <label>
          Title <span aria-hidden>*</span>
          <input
            type="text"
            className="ckb-input"
            value={title}
            onChange={(e) => setTitle(e.currentTarget.value)}
            maxLength={512}
            required
          />
        </label>
      </div>
      <div style={{ marginTop: 8 }}>
        <label>
          Trigger event summary
          <textarea
            className="ckb-input"
            rows={2}
            value={trigger}
            onChange={(e) => setTrigger(e.currentTarget.value)}
            maxLength={2000}
          />
        </label>
      </div>
      {err && (
        <div role="alert" className="ckb-error">{err}</div>
      )}
      <div className="ckb-stack-row" style={{ marginTop: 12 }}>
        <Button onClick={submit} disabled={!title.trim() || busy}>
          {busy ? 'Saving…' : 'Create claim'}
        </Button>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  );
}
