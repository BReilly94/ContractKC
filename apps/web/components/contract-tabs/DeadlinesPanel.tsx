'use client';

import { Button } from '@ckb/ui-kit';
import { useEffect, useState } from 'react';
import { api, type ApiDeadline } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';

export function DeadlinesPanel({ contractId }: { contractId: string }) {
  const token = useAuthStore((s) => s.token);
  const [deadlines, setDeadlines] = useState<ApiDeadline[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function reload(): Promise<void> {
    if (!token) return;
    try {
      setDeadlines(await api.listDeadlines({ token }, contractId));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void reload();
  }, [token, contractId]);

  async function verify(id: string): Promise<void> {
    if (!token) return;
    setBusyId(id);
    try {
      await api.verifyDeadline({ token }, id);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function activate(id: string): Promise<void> {
    if (!token) return;
    setBusyId(id);
    try {
      await api.transitionDeadline({ token }, id, 'Active');
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function complete(id: string): Promise<void> {
    if (!token) return;
    setBusyId(id);
    try {
      await api.transitionDeadline({ token }, id, 'Complete');
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  if (error) return <div role="alert" className="ckb-error">{error}</div>;
  if (deadlines === null) return <p>Loading…</p>;
  if (deadlines.length === 0) {
    return (
      <div className="ckb-empty-state">
        <p>
          No deadlines yet. AI-extracted obligations land here as Unverified and must be
          verified by a Contract Owner or Administrator before they can trigger alerts
          (Non-Negotiable #2).
        </p>
      </div>
    );
  }

  return (
    <div>
      <h3>Notice &amp; Deadline Tracker</h3>
      <table className="ckb-table">
        <thead>
          <tr>
            <th>Obligation</th>
            <th>Owner</th>
            <th>Trigger</th>
            <th>Due</th>
            <th>State</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {deadlines.map((d) => (
            <tr key={d.id}>
              <td>
                <div style={{ fontWeight: 600 }}>{d.label}</div>
                {d.sourceCitation && (
                  <div className="ckb-help">cite: {d.sourceCitation}</div>
                )}
              </td>
              <td>{d.responsibleParty}</td>
              <td>
                {d.absoluteDate ? d.absoluteDate : d.triggerCondition ?? '—'}
                {d.durationDays !== null && ` (+${d.durationDays}d)`}
              </td>
              <td>{d.dueAt ? new Date(d.dueAt).toLocaleDateString() : '—'}</td>
              <td>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  <span
                    className={`ckb-badge ${
                      d.verificationState === 'Verified' ? 'ckb-badge--success' : 'ckb-badge--warning'
                    }`}
                  >
                    {d.verificationState === 'Unverified' ? 'UNVERIFIED' : 'VERIFIED'}
                  </span>
                  <span className="ckb-badge">{d.lifecycleState}</span>
                </div>
              </td>
              <td>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {d.verificationState === 'Unverified' && (
                    <Button
                      onClick={() => verify(d.id)}
                      disabled={busyId === d.id}
                      variant="primary"
                    >
                      Verify
                    </Button>
                  )}
                  {d.lifecycleState === 'Verified' && (
                    <Button
                      onClick={() => activate(d.id)}
                      disabled={busyId === d.id}
                      variant="ghost"
                    >
                      Activate
                    </Button>
                  )}
                  {(d.lifecycleState === 'Active' || d.lifecycleState === 'Triggered') && (
                    <Button
                      onClick={() => complete(d.id)}
                      disabled={busyId === d.id}
                      variant="ghost"
                    >
                      Complete
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
