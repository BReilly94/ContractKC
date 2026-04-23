'use client';

import { Button } from '@ckb/ui-kit';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AuthedShell } from '@/components/AuthedShell';
import { api, type ApiDocument } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

export default function DocumentDetailPage() {
  return (
    <AuthedShell>
      <Detail />
    </AuthedShell>
  );
}

function Detail() {
  const params = useParams<{ id: string }>();
  const token = useAuthStore((s) => s.token);
  const [doc, setDoc] = useState<ApiDocument | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !params.id) return;
    api
      .getDocument({ token }, params.id)
      .then(setDoc)
      .catch((e: Error) => setError(e.message));
  }, [token, params.id]);

  if (error) return <main><div role="alert" className="ckb-error">{error}</div></main>;
  if (!doc) return <main><p>Loading…</p></main>;

  return (
    <main>
      <div className="ckb-stack-row" style={{ justifyContent: 'space-between' }}>
        <h1>{doc.originalFilename}</h1>
        <Link href={`/contracts/${doc.contractId}`}>
          <Button variant="ghost">← Back to contract</Button>
        </Link>
      </div>

      <div className="ckb-card">
        <dl>
          <dt>Category</dt>
          <dd>{doc.category}</dd>
          <dt>Mime type</dt>
          <dd>{doc.mimeType}</dd>
          <dt>Size</dt>
          <dd>{formatBytes(doc.sizeBytes)}</dd>
          <dt>SHA-256</dt>
          <dd><code>{doc.sha256}</code></dd>
          <dt>Source</dt>
          <dd>{doc.source}</dd>
          <dt>Uploaded</dt>
          <dd>{new Date(doc.uploadedAt).toLocaleString()}</dd>
        </dl>
        <div className="ckb-stack-row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <span
            className={`ckb-badge ${
              doc.malwareScanStatus === 'Clean' ? 'ckb-badge--success' : 'ckb-badge--warning'
            }`}
          >
            Scan: {doc.malwareScanStatus}
          </span>
          <span className="ckb-badge">OCR: {doc.ocrStatus}</span>
          {doc.encryptionState !== 'None' && (
            <span className="ckb-badge ckb-badge--warning">{doc.encryptionState}</span>
          )}
          {doc.isSuperseded && <span className="ckb-badge">SUPERSEDED</span>}
        </div>
      </div>

      {doc.malwareScanStatus === 'Clean' ? (
        <div className="ckb-card">
          <h3>Preview / download</h3>
          <p className="ckb-help">
            {/* ASSUMPTION: real PDF.js / Mammoth viewer in-app UX lands when
                we pick the final viewer library (Q-002). For now this opens
                the original bytes in a new tab. */}
          </p>
          <DownloadLink docId={doc.id} token={token} filename={doc.originalFilename} />
        </div>
      ) : (
        <div className="ckb-card">
          <h3>Content unavailable</h3>
          <p>
            This document is not yet retrievable. Malware scan status:{' '}
            <strong>{doc.malwareScanStatus}</strong>. Files are only accessible once the
            scan passes (security.md §6).
          </p>
        </div>
      )}
    </main>
  );
}

function DownloadLink({
  docId,
  token,
  filename,
}: {
  docId: string;
  token: string | null;
  filename: string;
}) {
  async function open(): Promise<void> {
    if (!token) return;
    const res = await fetch(`${API_BASE}/api/documents/${docId}/content`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
  return <Button onClick={open}>Download {filename}</Button>;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
