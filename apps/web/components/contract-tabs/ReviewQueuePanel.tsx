'use client';

import { Button } from '@ckb/ui-kit';
import { useEffect, useState } from 'react';
import { api, type ApiReviewQueueItem } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';

export function ReviewQueuePanel({ contractId }: { contractId: string }) {
  const token = useAuthStore((s) => s.token);
  const [items, setItems] = useState<ApiReviewQueueItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function reload(): Promise<void> {
    if (!token) return;
    try {
      setItems(await api.listReviewQueue({ token }, contractId, 'Pending'));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void reload();
  }, [token, contractId]);

  async function approve(id: string): Promise<void> {
    if (!token) return;
    setBusyId(id);
    try {
      await api.approveReview({ token }, id);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }
  async function reject(id: string): Promise<void> {
    if (!token) return;
    setBusyId(id);
    try {
      await api.rejectReview({ token }, id);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <h3>Review queue</h3>
      {error && <div role="alert" className="ckb-error">{error}</div>}
      {items === null && <p>Loading…</p>}
      {items && items.length === 0 && (
        <div className="ckb-empty-state">
          <p>Queue empty. Untrusted senders, password-protected attachments, shared-link content, and privileged mail land here.</p>
        </div>
      )}
      {items && items.length > 0 && (
        <table className="ckb-table">
          <thead>
            <tr>
              <th>Reason</th>
              <th>Email</th>
              <th>From</th>
              <th>Received</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id}>
                <td>
                  <span className="ckb-badge ckb-badge--warning">{it.reason}</span>
                  {it.reasonDetail && (
                    <div className="ckb-help">{it.reasonDetail}</div>
                  )}
                </td>
                <td>
                  <a href={`/emails/${it.emailId}`}>{it.emailSubject || '(no subject)'}</a>
                </td>
                <td>{it.emailFromAddress}</td>
                <td>{new Date(it.emailReceivedAt).toLocaleString()}</td>
                <td>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <Button onClick={() => approve(it.id)} disabled={busyId === it.id}>
                      Approve
                    </Button>
                    <Button onClick={() => reject(it.id)} disabled={busyId === it.id} variant="ghost">
                      Reject
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
