'use client';

import { Button } from '@ckb/ui-kit';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AuthedShell } from '@/components/AuthedShell';
import { api, type ApiEmailDetail } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';

export default function EmailDetailPage() {
  return (
    <AuthedShell>
      <Detail />
    </AuthedShell>
  );
}

function Detail() {
  const params = useParams<{ id: string }>();
  const token = useAuthStore((s) => s.token);
  const [email, setEmail] = useState<ApiEmailDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !params.id) return;
    api
      .getEmail({ token }, params.id)
      .then(setEmail)
      .catch((e: Error) => setError(e.message));
  }, [token, params.id]);

  if (error) return <main><div role="alert" className="ckb-error">{error}</div></main>;
  if (!email) return <main><p>Loading…</p></main>;

  return (
    <main>
      <div className="ckb-stack-row" style={{ justifyContent: 'space-between' }}>
        <h1>{email.subject || '(no subject)'}</h1>
        <Link href={`/contracts/${email.contractId}`}>
          <Button variant="ghost">← Back to contract</Button>
        </Link>
      </div>

      <div className="ckb-card">
        <dl>
          <dt>From</dt>
          <dd>
            {email.fromName ? `${email.fromName} <${email.fromAddress}>` : email.fromAddress}
          </dd>
          <dt>To</dt>
          <dd>{email.toAddresses.join(', ')}</dd>
          {email.ccAddresses.length > 0 && (
            <>
              <dt>CC</dt>
              <dd>{email.ccAddresses.join(', ')}</dd>
            </>
          )}
          <dt>Received</dt>
          <dd>{new Date(email.receivedAt).toLocaleString()}</dd>
          <dt>Message-ID</dt>
          <dd><code>{email.rfcMessageId}</code></dd>
          <dt>raw .eml SHA-256</dt>
          <dd><code>{email.rawEmlSha256}</code></dd>
        </dl>
        <div className="ckb-stack-row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <span
            className={`ckb-badge ${
              email.senderTrustState === 'Approved' ? 'ckb-badge--success' : 'ckb-badge--warning'
            }`}
          >
            {email.senderTrustState}
          </span>
          {email.privilegedFlag && (
            <span className="ckb-badge ckb-badge--warning">PRIVILEGED</span>
          )}
          {email.containsSharedLink && (
            <span className="ckb-badge">SHARED LINK</span>
          )}
        </div>
      </div>

      <div className="ckb-card">
        <h3>Body</h3>
        <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--ckb-font-sans)' }}>
          {email.bodyText ?? '(no plain-text body)'}
        </pre>
      </div>

      {email.attachments.length > 0 && (
        <div className="ckb-card">
          <h3>Attachments</h3>
          <ul>
            {email.attachments.map((a) => (
              <li key={a.documentId}>
                <a href={`/documents/${a.documentId}`}>{a.filename}</a> ·{' '}
                <span className="ckb-help">
                  {a.mimeType} · {formatBytes(a.sizeBytes)} ·{' '}
                  <span
                    className={`ckb-badge ${
                      a.malwareScanStatus === 'Clean'
                        ? 'ckb-badge--success'
                        : 'ckb-badge--warning'
                    }`}
                  >
                    {a.malwareScanStatus}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
