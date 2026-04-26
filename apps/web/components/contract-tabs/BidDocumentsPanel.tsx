'use client';

import { Button } from '@ckb/ui-kit';
import { useEffect, useState } from 'react';
import { api, type ApiBidHandoff, type ApiDocument } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';

const BID_CATEGORIES = [
  'BidDocument',
  'NegotiationRecord',
  'Correspondence',
  'Specification',
  'Other',
] as const;

export function BidDocumentsPanel({ contractId }: { contractId: string }) {
  const token = useAuthStore((s) => s.token);
  const [handoffs, setHandoffs] = useState<ApiBidHandoff[] | null>(null);
  const [handoffDocs, setHandoffDocs] = useState<ApiDocument[] | null>(null);
  const [manualDocs, setManualDocs] = useState<ApiDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);

  async function reload(): Promise<void> {
    if (!token) return;
    try {
      const [h, hd, md] = await Promise.all([
        api.listBidHandoffs({ token }, contractId),
        api.listDocuments({ token }, contractId, { source: 'BidHandoff' }),
        api.listDocuments({ token }, contractId, { category: 'BidDocument' }),
      ]);
      setHandoffs(h);
      setHandoffDocs(hd);
      setManualDocs(md);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void reload();
  }, [token, contractId]);

  const latestHandoff = handoffs?.[0] ?? null;
  const allDocs = [...(handoffDocs ?? []), ...(manualDocs ?? [])].sort(
    (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime(),
  );

  return (
    <div>
      {error && (
        <div role="alert" className="ckb-error">
          {error}
        </div>
      )}

      <div className="ckb-card" style={{ marginBottom: 16 }}>
        <h3>Bid Handoff</h3>
        {handoffs === null && <p>Loading…</p>}
        {handoffs !== null && !latestHandoff && (
          <div className="ckb-empty-state">
            <p>
              No automated handoff received from the Bid Intake &amp; Generation app yet.
            </p>
            <p>
              Upload bid-phase documents manually below. When the handoff arrives it will
              import its own documents alongside anything uploaded here.
            </p>
          </div>
        )}
        {latestHandoff && <HandoffSummary handoff={latestHandoff} extraCount={handoffs!.length - 1} />}
      </div>

      <div className="ckb-stack-row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>Bid Documents</h3>
        <Button onClick={() => setShowUpload(true)}>Upload bid document</Button>
      </div>

      {handoffDocs === null && manualDocs === null && <p>Loading…</p>}
      {handoffDocs !== null && manualDocs !== null && allDocs.length === 0 && (
        <div className="ckb-empty-state">
          <p>
            No bid documents yet. Upload the winning proposal, estimates, assumptions,
            qualifications, or other bid-phase materials to get started.
          </p>
        </div>
      )}
      {allDocs.length > 0 && (
        <table className="ckb-table">
          <thead>
            <tr>
              <th>Filename</th>
              <th>Category</th>
              <th>Origin</th>
              <th>Scan</th>
              <th>Uploaded</th>
            </tr>
          </thead>
          <tbody>
            {allDocs.map((d) => (
              <tr key={d.id}>
                <td>
                  <a href={`/documents/${d.id}`}>{d.originalFilename}</a>
                </td>
                <td>{d.category}</td>
                <td>
                  <span
                    className={`ckb-badge ${d.source === 'BidHandoff' ? 'ckb-badge--info' : ''}`}
                  >
                    {d.source === 'BidHandoff' ? 'Bid app' : 'Manual'}
                  </span>
                </td>
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

function HandoffSummary({
  handoff,
  extraCount,
}: {
  handoff: ApiBidHandoff;
  extraCount: number;
}) {
  return (
    <div>
      <dl>
        <dt>Bid ID</dt>
        <dd>
          <code>{handoff.bidId}</code>
        </dd>
        <dt>Source system</dt>
        <dd>{handoff.sourceSystem}</dd>
        <dt>Status</dt>
        <dd>
          <span
            className={`ckb-badge ${
              handoff.status === 'Processed'
                ? 'ckb-badge--success'
                : handoff.status === 'Failed'
                  ? 'ckb-badge--warning'
                  : ''
            }`}
          >
            {handoff.status}
          </span>
        </dd>
        <dt>Received</dt>
        <dd>{new Date(handoff.receivedAt).toLocaleString()}</dd>
        <dt>Documents imported</dt>
        <dd>{handoff.documentsCreated}</dd>
        <dt>Contacts imported</dt>
        <dd>{handoff.contactsCreated}</dd>
        <dt>Risks imported</dt>
        <dd>
          {handoff.risksCreated}
          {handoff.risksCreated > 0 && (
            <span className="ckb-badge ckb-badge--warning" style={{ marginLeft: 8 }}>
              UNVERIFIED
            </span>
          )}
        </dd>
      </dl>
      {handoff.errorMessage && (
        <div role="alert" className="ckb-error" style={{ marginTop: 8 }}>
          {handoff.errorMessage}
        </div>
      )}
      {extraCount > 0 && (
        <p className="ckb-help" style={{ marginTop: 8 }}>
          {extraCount} earlier handoff{extraCount > 1 ? 's' : ''} on record.
        </p>
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
  const [category, setCategory] = useState<(typeof BID_CATEGORIES)[number]>('BidDocument');
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
      <h4>Upload bid document</h4>
      <p className="ckb-help">
        Originals are stored immutably (Non-Negotiable #3). Malware scan and OCR run
        asynchronously.
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
            onChange={(e) =>
              setCategory(e.currentTarget.value as (typeof BID_CATEGORIES)[number])
            }
          >
            {BID_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c === 'BidDocument' ? 'Bid Document (winning proposal, estimates, etc.)' : c}
              </option>
            ))}
          </select>
        </label>
      </div>
      {err && (
        <div role="alert" className="ckb-error">
          {err}
        </div>
      )}
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
