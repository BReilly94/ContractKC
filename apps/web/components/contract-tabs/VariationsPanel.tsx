'use client';

import { Button } from '@ckb/ui-kit';
import { useEffect, useState } from 'react';
import { api, type ApiVariation } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';

const LIFECYCLE_STATES = [
  'Proposed',
  'Priced',
  'Submitted',
  'Approved',
  'Rejected',
  'Disputed',
  'Closed',
] as const;

function formatMoney(cents: number | null, fallback = '—'): string {
  if (cents === null) return fallback;
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function VariationsPanel({ contractId }: { contractId: string }) {
  const token = useAuthStore((s) => s.token);
  const [variations, setVariations] = useState<ApiVariation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  async function reload(): Promise<void> {
    if (!token) return;
    try {
      const result = await api.listVariations({ token }, contractId);
      setVariations(result.items);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void reload();
  }, [token, contractId]);

  return (
    <div>
      <div className="ckb-stack-row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>Variation / Change Order Register</h3>
        <Button onClick={() => setShowCreate(true)}>New variation</Button>
      </div>

      {error && (
        <div role="alert" className="ckb-error">
          {error}
        </div>
      )}
      {variations === null && <p>Loading…</p>}
      {variations !== null && variations.length === 0 && (
        <div className="ckb-empty-state">
          <p>
            No variations recorded. Create one when a client instruction directs work
            outside the original scope.
          </p>
        </div>
      )}
      {variations !== null && variations.length > 0 && (
        <table className="ckb-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Title</th>
              <th>Status</th>
              <th>Priced</th>
              <th>Approved</th>
              <th>Submitted</th>
            </tr>
          </thead>
          <tbody>
            {variations.map((v) => (
              <tr key={v.id}>
                <td>{v.variationNumber ?? '—'}</td>
                <td>
                  <span title={v.description ?? undefined}>{v.title}</span>
                  {v.originatingInstruction && (
                    <div className="ckb-help">{v.originatingInstruction}</div>
                  )}
                </td>
                <td>
                  <span className={`ckb-badge ${stateBadgeClass(v.lifecycleState)}`}>
                    {v.lifecycleState}
                  </span>
                </td>
                <td>{formatMoney(v.pricedAmountCents)}</td>
                <td>{formatMoney(v.approvedAmountCents)}</td>
                <td>
                  {v.submittedAt ? new Date(v.submittedAt).toLocaleDateString() : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showCreate && (
        <CreateVariationDialog
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

function stateBadgeClass(state: string): string {
  if (state === 'Approved') return 'ckb-badge--success';
  if (state === 'Rejected' || state === 'Disputed') return 'ckb-badge--warning';
  return '';
}

function CreateVariationDialog({
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
  const [description, setDescription] = useState('');
  const [originating, setOriginating] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(): Promise<void> {
    if (!token || !title.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await api.createVariation({ token }, contractId, {
        title: title.trim(),
        description: description.trim() || null,
        originatingInstruction: originating.trim() || null,
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
      <h4>New variation</h4>
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
          Originating instruction (RFI, email, verbal direction)
          <input
            type="text"
            className="ckb-input"
            value={originating}
            onChange={(e) => setOriginating(e.currentTarget.value)}
            maxLength={1024}
          />
        </label>
      </div>
      <div style={{ marginTop: 8 }}>
        <label>
          Description
          <textarea
            className="ckb-input"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.currentTarget.value)}
          />
        </label>
      </div>
      {err && (
        <div role="alert" className="ckb-error">
          {err}
        </div>
      )}
      <div className="ckb-stack-row" style={{ marginTop: 12 }}>
        <Button onClick={submit} disabled={!title.trim() || busy}>
          {busy ? 'Saving…' : 'Create'}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
