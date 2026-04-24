'use client';

import { Button, TextField } from '@ckb/ui-kit';
import { useState } from 'react';
import { AuthedShell } from '@/components/AuthedShell';
import { useAuthStore } from '@/lib/auth-store';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

/**
 * Auditor Export UI (Slice JJ — §5.11).
 *
 * Minimal page: a filter form + Download button. Hits the API endpoint
 * with the bearer token in a new window so the browser handles the CSV
 * download. Non-auditors see a forbidden state from the server.
 */
export default function AuditExportPage() {
  return (
    <AuthedShell>
      <AuditExportView />
    </AuthedShell>
  );
}

function AuditExportView() {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [entityType, setEntityType] = useState('');
  const [userId, setUserId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function download(): Promise<void> {
    if (!token) return;
    setError(null);
    setPending(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', new Date(from).toISOString());
      if (to) params.set('to', new Date(to).toISOString());
      if (entityType) params.set('entityType', entityType);
      if (userId) params.set('userId', userId);
      const url = `${API_BASE}/api/admin/audit/export?${params.toString()}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `ckb-audit-export-${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(downloadUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setPending(false);
    }
  }

  return (
    <main>
      <h1>Audit export</h1>
      <p className="ckb-help">
        Exports the append-only audit log as CSV with hash chain intact. Rows are ordered by
        sequence number so the chain is verifiable end-to-end. Requires the Auditor global role.
      </p>
      {user && (
        <p className="ckb-help">
          Signed in as <strong>{user.displayName}</strong> ({user.email}).
        </p>
      )}
      <div className="ckb-card">
        <div className="ckb-stack-row" style={{ flexWrap: 'wrap', gap: 12 }}>
          <TextField
            label="From (UTC)"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
          <TextField
            label="To (UTC)"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
          <TextField
            label="Entity type"
            placeholder="e.g. Contract, Deadline"
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
          />
          <TextField
            label="Actor user ID"
            placeholder="ULID"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          />
        </div>
        <div style={{ marginTop: 12 }}>
          <Button onClick={() => { void download(); }} disabled={pending || !token}>
            {pending ? 'Downloading…' : 'Download CSV'}
          </Button>
        </div>
        {error && (
          <div role="alert" className="ckb-error" style={{ marginTop: 12 }}>
            {error}
          </div>
        )}
      </div>
    </main>
  );
}
