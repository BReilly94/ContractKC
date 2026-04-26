'use client';

import { useEffect, useState } from 'react';
import { PanelShell } from '@/components/PanelShell';
import { api, type ApiEmailList } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';

function trustBadgeClass(state: string): string {
  if (state === 'Approved') return 'ckb-badge--success';
  if (state === 'Blocked') return 'ckb-badge--danger';
  return 'ckb-badge--warning';
}

function formatEmailDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const timeStr = d.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' });

  if (diffDays === 0) return `Today, ${timeStr}`;
  if (diffDays === 1) return `Yesterday, ${timeStr}`;
  if (diffDays < 7) {
    return d.toLocaleDateString('en-CA', { weekday: 'short' }) + `, ${timeStr}`;
  }
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function EmailsPanel({ contractId }: { contractId: string }) {
  const token = useAuthStore((s) => s.token);
  const [emails, setEmails] = useState<ApiEmailList[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api
      .listEmails({ token }, contractId)
      .then(setEmails)
      .catch((e: Error) => setError(e.message));
  }, [token, contractId]);

  return (
    <PanelShell
      title="Emails"
      count={emails?.length}
      loading={emails === null}
      error={error}
      empty={emails?.length === 0}
      emptyMessage="No emails yet. Send correspondence to the project address or forward from Outlook using the add-in."
    >
      <table className="ckb-table">
        <thead>
          <tr>
            <th>Subject</th>
            <th>From</th>
            <th>Received</th>
            <th>Trust</th>
          </tr>
        </thead>
        <tbody>
          {emails?.map((e) => (
            <tr key={e.id}>
              <td>
                <a href={`/emails/${e.id}`}>{e.subject || '(no subject)'}</a>
                {e.direction === 'Outbound' && (
                  <span className="ckb-badge" style={{ marginLeft: 8 }}>
                    SENT
                  </span>
                )}
                {e.privilegedFlag && (
                  <span className="ckb-badge ckb-badge--warning" style={{ marginLeft: 8 }}>
                    PRIVILEGED
                  </span>
                )}
                {e.containsSharedLink && (
                  <span className="ckb-badge" style={{ marginLeft: 8 }}>
                    SHARED LINK
                  </span>
                )}
              </td>
              <td>
                <div style={{ fontWeight: e.fromName ? 600 : undefined }}>{e.fromName ?? e.fromAddress}</div>
                {e.fromName && <div className="ckb-help">{e.fromAddress}</div>}
              </td>
              <td style={{ whiteSpace: 'nowrap' }}>{formatEmailDate(e.receivedAt)}</td>
              <td>
                <span className={`ckb-badge ${trustBadgeClass(e.senderTrustState)}`}>
                  {e.senderTrustState}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </PanelShell>
  );
}
