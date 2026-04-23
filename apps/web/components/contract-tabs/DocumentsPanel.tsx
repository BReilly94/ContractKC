'use client';

import { Button } from '@ckb/ui-kit';
import { useEffect, useState } from 'react';
import { api, type ApiDocument } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';

const CATEGORIES = [
  'MasterAgreement',
  'Schedule',
  'Appendix',
  'Amendment',
  'Drawing',
  'Specification',
  'NegotiationRecord',
  'Correspondence',
  'Permit',
  'Insurance',
  'Bond',
  'Other',
] as const;

export function DocumentsPanel({ contractId }: { contractId: string }) {
  const token = useAuthStore((s) => s.token);
  const [docs, setDocs] = useState<ApiDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);

  async function reload(): Promise<void> {
    if (!token) return;
    try {
      setDocs(await api.listDocuments({ token }, contractId));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void reload();
  }, [token, contractId]);

  return (
    <div>
      <div className="ckb-stack-row" style={{ justifyContent: 'space-between' }}>
        <h3>Documents</h3>
        <Button onClick={() => setShowUpload(true)}>Upload document</Button>
      </div>
      {error && <div role="alert" className="ckb-error">{error}</div>}
      {docs === null && <p>Loading…</p>}
      {docs && docs.length === 0 && (
        <div className="ckb-empty-state">
          <p>No documents yet. Upload the master agreement to get started.</p>
        </div>
      )}
      {docs && docs.length > 0 && (
        <table className="ckb-table">
          <thead>
            <tr>
              <th>Filename</th>
              <th>Category</th>
              <th>Size</th>
              <th>Scan</th>
              <th>OCR</th>
              <th>Uploaded</th>
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.id}>
                <td>
                  <a href={`/documents/${d.id}`}>{d.originalFilename}</a>
                  {d.isSuperseded && (
                    <span className="ckb-badge" style={{ marginLeft: 8 }}>
                      SUPERSEDED
                    </span>
                  )}
                </td>
                <td>{d.category}</td>
                <td>{formatBytes(d.sizeBytes)}</td>
                <td>
                  <span
                    className={`ckb-badge ${
                      d.malwareScanStatus === 'Clean'
                        ? 'ckb-badge--success'
                        : d.malwareScanStatus === 'Quarantined'
                          ? 'ckb-badge--warning'
                          : ''
                    }`}
                  >
                    {d.malwareScanStatus}
                  </span>
                </td>
                <td>{d.ocrStatus}</td>
                <td>{new Date(d.uploadedAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {showUpload && (
        <UploadDialog
          contractId={contractId}
          onClose={() => setShowUpload(false)}
          onUploaded={() => {
            setShowUpload(false);
            void reload();
          }}
        />
      )}
    </div>
  );
}

function UploadDialog({
  contractId,
  onClose,
  onUploaded,
}: {
  contractId: string;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const token = useAuthStore((s) => s.token);
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('Correspondence');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function upload(): Promise<void> {
    if (!token || !file) return;
    setBusy(true);
    setErr(null);
    try {
      const base64 = await fileToBase64(file);
      await api.uploadDocument({ token }, contractId, {
        category,
        originalFilename: file.name,
        mimeType: file.type || 'application/octet-stream',
        contentBase64: base64,
      });
      onUploaded();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ckb-card" style={{ marginTop: 16 }}>
      <h4>Upload document</h4>
      <p className="ckb-help">
        Non-Negotiable #3 — the original bytes are stored immutably at{' '}
        <code>sha256/&lt;hash&gt;</code>. Malware scan and OCR are asynchronous.
      </p>
      <div>
        <label>
          File{' '}
          <input
            type="file"
            onChange={(e) => setFile(e.currentTarget.files?.[0] ?? null)}
          />
        </label>
      </div>
      <div style={{ marginTop: 8 }}>
        <label>
          Category{' '}
          <select
            value={category}
            onChange={(e) => setCategory(e.currentTarget.value as (typeof CATEGORIES)[number])}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>
      {err && <div role="alert" className="ckb-error">{err}</div>}
      <div className="ckb-stack-row" style={{ marginTop: 12 }}>
        <Button onClick={upload} disabled={!file || busy}>
          {busy ? 'Uploading…' : 'Upload'}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
