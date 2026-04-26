'use client';

import { Button } from '@ckb/ui-kit';
import { useEffect, useState } from 'react';
import { api, type ApiRisk } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';

const CATEGORIES = [
  'Commercial',
  'Schedule',
  'Technical',
  'Safety',
  'Regulatory',
  'Environmental',
  'ClientBehaviour',
  'Subcontractor',
  'ForceMAjeure',
  'Other',
] as const;

const LIKELIHOODS = ['Low', 'Medium', 'High'] as const;

const STATUS_BADGE: Record<string, string> = {
  Open: '',
  Mitigated: 'ckb-badge--info',
  Occurred: 'ckb-badge--warning',
  Closed: 'ckb-badge--success',
};

export function RisksPanel({ contractId }: { contractId: string }) {
  const token = useAuthStore((s) => s.token);
  const [risks, setRisks] = useState<ApiRisk[] | null>(null);
  const [statusFilter, setStatusFilter] = useState('Open');
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  async function reload(): Promise<void> {
    if (!token) return;
    try {
      const result = await api.listRisks({ token }, contractId, statusFilter);
      setRisks(result.items);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void reload();
  }, [token, contractId, statusFilter]);

  return (
    <div>
      <div className="ckb-stack-row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>Risk Register</h3>
        <div className="ckb-stack-row" style={{ gap: 8 }}>
          <label>
            <span className="ckb-help">Status </span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.currentTarget.value)}
            >
              <option value="">All</option>
              <option value="Open">Open</option>
              <option value="Mitigated">Mitigated</option>
              <option value="Occurred">Occurred</option>
              <option value="Closed">Closed</option>
            </select>
          </label>
          <Button onClick={() => setShowCreate(true)}>Add risk</Button>
        </div>
      </div>

      {error && (
        <div role="alert" className="ckb-error">
          {error}
        </div>
      )}
      {risks === null && <p>Loading…</p>}
      {risks !== null && risks.length === 0 && (
        <div className="ckb-empty-state">
          <p>
            No{statusFilter ? ` ${statusFilter.toLowerCase()}` : ''} risks.
            {statusFilter === 'Open'
              ? ' Risks identified during the bid phase or contract execution are tracked here.'
              : ''}
          </p>
        </div>
      )}
      {risks !== null && risks.length > 0 && (
        <table className="ckb-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Category</th>
              <th>P</th>
              <th>I</th>
              <th>Status</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {risks.map((r) => (
              <tr key={r.id}>
                <td>
                  <div style={{ fontWeight: 500 }}>{r.title}</div>
                  {r.mitigation && (
                    <div className="ckb-help">
                      Mitigation: {r.mitigation.slice(0, 120)}
                      {r.mitigation.length > 120 ? '…' : ''}
                    </div>
                  )}
                </td>
                <td>{r.category}</td>
                <td>
                  <span className={likelihoodClass(r.probability)}>{r.probability[0]}</span>
                </td>
                <td>
                  <span className={likelihoodClass(r.impact)}>{r.impact[0]}</span>
                </td>
                <td>
                  <span className={`ckb-badge ${STATUS_BADGE[r.status] ?? ''}`}>
                    {r.status}
                  </span>
                </td>
                <td>
                  <span className={`ckb-badge ${r.source === 'BidHandoff' ? 'ckb-badge--info' : ''}`}>
                    {r.source === 'BidHandoff' ? 'Bid handoff' : r.source}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showCreate && (
        <CreateRiskDialog
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

function likelihoodClass(l: string): string {
  if (l === 'High') return 'ckb-badge ckb-badge--warning';
  if (l === 'Medium') return 'ckb-badge ckb-badge--info';
  return 'ckb-badge';
}

function CreateRiskDialog({
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
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('Commercial');
  const [probability, setProbability] = useState<(typeof LIKELIHOODS)[number]>('Low');
  const [impact, setImpact] = useState<(typeof LIKELIHOODS)[number]>('Low');
  const [mitigation, setMitigation] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(): Promise<void> {
    if (!token || !title.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await api.createRisk({ token }, contractId, {
        title: title.trim(),
        category,
        probability,
        impact,
        mitigation: mitigation.trim() || null,
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
      <h4>Add risk</h4>
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
      <div className="ckb-stack-row" style={{ gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
        <label>
          Category{' '}
          <select value={category} onChange={(e) => setCategory(e.currentTarget.value as typeof category)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Probability{' '}
          <select value={probability} onChange={(e) => setProbability(e.currentTarget.value as typeof probability)}>
            {LIKELIHOODS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </label>
        <label>
          Impact{' '}
          <select value={impact} onChange={(e) => setImpact(e.currentTarget.value as typeof impact)}>
            {LIKELIHOODS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </label>
      </div>
      <div style={{ marginTop: 8 }}>
        <label>
          Mitigation plan
          <textarea
            className="ckb-input"
            rows={2}
            value={mitigation}
            onChange={(e) => setMitigation(e.currentTarget.value)}
          />
        </label>
      </div>
      {err && (
        <div role="alert" className="ckb-error">{err}</div>
      )}
      <div className="ckb-stack-row" style={{ marginTop: 12 }}>
        <Button onClick={submit} disabled={!title.trim() || busy}>
          {busy ? 'Saving…' : 'Add risk'}
        </Button>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  );
}
