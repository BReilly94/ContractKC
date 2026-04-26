'use client';

import { Button } from '@ckb/ui-kit';
import { useEffect, useState } from 'react';
import { PanelShell } from '@/components/PanelShell';
import { api, type ApiDeadline } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';

function lifecycleBadgeClass(state: ApiDeadline['lifecycleState']): string {
  if (state === 'Active' || state === 'Verified') return 'ckb-badge--success';
  if (state === 'Triggered' || state === 'Missed') return 'ckb-badge--danger';
  if (state === 'Extracted') return 'ckb-badge--warning';
  return '';
}

function formatDue(iso: string | null): string {
  if (!iso) return '—';
  const diff = Math.round((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (diff < -1) return `Overdue ${Math.abs(diff)}d`;
  if (diff < 0) return 'Due yesterday';
  if (diff === 0) return 'Due today';
  if (diff === 1) return 'Tomorrow';
  if (diff <= 14) return `In ${diff} days`;
  if (diff <= 60) return `In ${Math.round(diff / 7)}w`;
  return new Date(iso).toLocaleDateString('en-CA', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function dueCellStyle(iso: string | null, lifecycle: ApiDeadline['lifecycleState']): React.CSSProperties {
  if (!iso || lifecycle === 'Complete' || lifecycle === 'Cancelled') return {};
  const diff = Math.round((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return { color: 'var(--ckb-danger)', fontWeight: 600 };
  if (diff <= 7) return { color: 'var(--ckb-warning)', fontWeight: 600 };
  return {};
}

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

  return (
    <PanelShell
      title="Notice & Deadline Tracker"
      count={deadlines?.length}
      loading={deadlines === null}
      error={error}
      empty={deadlines?.length === 0}
      emptyMessage="No deadlines yet. AI-extracted obligations appear here as Unverified and must be approved before they can trigger alerts."
    >
      <table className="ckb-table">
        <thead>
          <tr>
            <th>Obligation</th>
            <th>Owner</th>
            <th>Due</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {deadlines?.map((d) => (
            <tr key={d.id}>
              <td>
                <div style={{ fontWeight: 600 }}>{d.label}</div>
                {d.triggerCondition && <div className="ckb-help">{d.triggerCondition}</div>}
                {d.sourceCitation && (
                  <div className="ckb-help" style={{ fontStyle: 'italic' }}>
                    {d.sourceCitation}
                  </div>
                )}
              </td>
              <td>{d.responsibleParty}</td>
              <td style={dueCellStyle(d.dueAt, d.lifecycleState)}>
                {formatDue(d.dueAt)}
                {d.durationDays !== null && (
                  <div className="ckb-help">+{d.durationDays}d from trigger</div>
                )}
              </td>
              <td>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {d.verificationState === 'Unverified' && (
                    <span className="ckb-badge ckb-badge--warning">UNVERIFIED</span>
                  )}
                  <span className={`ckb-badge ${lifecycleBadgeClass(d.lifecycleState)}`}>
                    {d.lifecycleState}
                  </span>
                </div>
              </td>
              <td>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {d.verificationState === 'Unverified' && (
                    <Button
                      onClick={() => verify(d.id)}
                      disabled={busyId === d.id}
                      variant="secondary"
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
    </PanelShell>
  );
}
