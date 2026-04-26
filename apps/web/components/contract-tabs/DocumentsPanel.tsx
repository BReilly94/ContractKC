'use client';

import { Button, Select, type SelectOption } from '@ckb/ui-kit';
import { useEffect, useState } from 'react';
import { PanelShell } from '@/components/PanelShell';
import { api, type ApiDocument } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';

const CATEGORY_LABELS: Record<string, string> = {
  MasterAgreement: 'Master Agreement',
  Schedule: 'Schedule',
  Appendix: 'Appendix',
  Amendment: 'Amendment',
  Drawing: 'Drawing',
  Specification: 'Specification',
  NegotiationRecord: 'Negotiation Record',
  Correspondence: 'Correspondence',
  Permit: 'Permit',
  Insurance: 'Insurance',
  Bond: 'Bond',
  MeetingMinutes: 'Meeting Minutes',
  Other: 'Other',
};

const CATEGORY_OPTIONS: SelectOption[] = Object.entries(CATEGORY_LABELS).map(([value, label]) => ({
  value,
  label,
}));

function scanBadgeClass(status: string): string {
  if (status === 'Clean') return 'ckb-badge--success';
  if (status === 'Quarantined') return 'ckb-badge--danger';
  if (status === 'Scanning') return 'ckb-badge--warning';
  return '';
}

function ocrBadgeClass(status: string): string {
  if (status === 'Complete') return 'ckb-badge--success';
  if (status === 'Failed') return 'ckb-badge--danger';
  if (status === 'Processing') return 'ckb-badge--warning';
  return '';
}

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
    <PanelShell
      title="Documents"
      count={docs?.length}
      action={<Button onClick={() => setShowUpload(true)}>Upload document</Button>}
      loading={docs === null}
      error={error}
      empty={docs?.length === 0}
      emptyMessage="No documents yet. Upload the master agreement to get started — it seeds the AI layer with the contract's terms."
    >
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
          {docs?.map((d) => (
            <tr key={d.id}>
              <td>
                <a href={`/documents/${d.id}`}>{d.originalFilename}</a>
                {d.isSuperseded && (
                  <span className="ckb-badge" style={{ marginLeft: 8 }}>
                    SUPERSEDED
                  </span>
                )}
              </td>
              <td>{CATEGORY_LABELS[d.category] ?? d.category}</td>
              <td>{formatBytes(d.sizeBytes)}</td>
              <td>
                <span className={`ckb-badge ${scanBadgeClass(d.malwareScanStatus)}`}>
                  {d.malwareScanStatus}
                </span>
              </td>
              <td>
                <span className={`ckb-badge ${ocrBadgeClass(d.ocrStatus)}`}>
                  {d.ocrStatus}
                </span>
              </td>
              <td>
                {new Date(d.uploadedAt).toLocaleDateString('en-CA', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showUpload && (
        <UploadForm
          contractId={contractId}
          onClose={() => setShowUpload(false)}
          onUploaded={() => {
            setShowUpload(false);
            void reload();
          }}
        />
      )}
    </PanelShell>
  );
}

function UploadForm({
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
  const [category, setCategory] = useState('Correspondence');
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
    <div className="ckb-card" style={{ marginTop: 'var(--ckb-space-4)' }}>
      <h4 style={{ margin: '0 0 var(--ckb-space-4)' }}>Upload document</h4>

      <div className="ckb-field">
        <label className="ckb-label">File</label>
        <input
          type="file"
          className="ckb-input"
          style={{ paddingTop: 6 }}
          onChange={(e) => setFile(e.currentTarget.files?.[0] ?? null)}
        />
        <div className="ckb-help">
          PDF, DOCX, XLSX, DWG, images, .eml, .msg — originals stored immutably with SHA-256 hash.
        </div>
      </div>

      <Select
        label="Category"
        value={category}
        options={CATEGORY_OPTIONS}
        onChange={(e) => setCategory(e.currentTarget.value)}
      />

      {err && (
        <div role="alert" className="ckb-error" style={{ marginBottom: 'var(--ckb-space-3)' }}>
          {err}
        </div>
      )}

      <div className="ckb-stack-row">
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
