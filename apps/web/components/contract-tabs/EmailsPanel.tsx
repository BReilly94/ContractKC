'use client';

import { useEffect, useState } from 'react';
import { api, type ApiEmailList } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';

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

  if (error) return <div role="alert" className="ckb-error">{error}</div>;
  if (emails === null) return <p>Loading…</p>;
  if (emails.length === 0) {
    return (
      <div className="ckb-empty-state">
        <p>No emails yet. Send mail to the project address to get started.</p>
      </div>
    );
  }

  return (
    <div>
      <h3>Emails</h3>
      <table className="ckb-table">
        <thead>
          <tr>
            <th>Subject</th>
            <th>From</th>
            <th>Received</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {emails.map((e) => (
            <tr key={e.id}>
              <td>
                <a href={`/emails/${e.id}`}>{e.subject || '(no subject)'}</a>
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
              <td>{e.fromName ? `${e.fromName} <${e.fromAddress}>` : e.fromAddress}</td>
              <td>{new Date(e.receivedAt).toLocaleString()}</td>
              <td>
                <span
                  className={`ckb-badge ${
                    e.senderTrustState === 'Approved'
                      ? 'ckb-badge--success'
                      : 'ckb-badge--warning'
                  }`}
                >
                  {e.senderTrustState}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
