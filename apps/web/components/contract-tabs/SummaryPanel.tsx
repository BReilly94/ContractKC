'use client';

import { Button } from '@ckb/ui-kit';
import { useEffect, useState } from 'react';
import { api, type ApiSummary } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';

export function SummaryPanel({ contractId }: { contractId: string }) {
  const token = useAuthStore((s) => s.token);
  const [summary, setSummary] = useState<ApiSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notFound, setNotFound] = useState(false);

  async function reload(): Promise<void> {
    if (!token) return;
    try {
      setSummary(await api.getSummary({ token }, contractId));
      setNotFound(false);
    } catch (e) {
      if ((e as { status?: number }).status === 404) {
        setNotFound(true);
        setSummary(null);
      } else {
        setError((e as Error).message);
      }
    }
  }
  useEffect(() => {
    void reload();
  }, [token, contractId]);

  async function generate(): Promise<void> {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await api.generateSummary({ token }, contractId);
      // The worker runs async; poll a few times for demo ergonomics.
      for (let i = 0; i < 5; i += 1) {
        await new Promise((r) => setTimeout(r, 1500));
        await reload();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function verify(): Promise<void> {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await api.verifySummary({ token }, contractId);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="ckb-stack-row" style={{ justifyContent: 'space-between' }}>
        <h3>Contract summary</h3>
        <Button onClick={generate} disabled={busy}>
          {busy ? 'Working…' : summary ? 'Regenerate' : 'Generate'}
        </Button>
      </div>

      {error && <div role="alert" className="ckb-error">{error}</div>}

      {notFound && (
        <div className="ckb-empty-state">
          <p>
            No summary yet. Generation pulls master-agreement chunks, calls Claude Opus
            with citation discipline, and stores the result as Unverified (Non-Negotiable #2).
          </p>
        </div>
      )}

      {summary && (
        <div>
          <div className="ckb-stack-row" style={{ gap: 8 }}>
            <span
              className={`ckb-badge ${
                summary.verificationState === 'Unverified'
                  ? 'ckb-badge--warning'
                  : 'ckb-badge--success'
              }`}
            >
              {summary.verificationState === 'Unverified' ? 'UNVERIFIED' : 'VERIFIED'}
            </span>
            {summary.generatedAt && (
              <span className="ckb-help">
                Generated {new Date(summary.generatedAt).toLocaleString()}
              </span>
            )}
            {summary.verifiedAt && (
              <span className="ckb-help">
                Verified {new Date(summary.verifiedAt).toLocaleString()}
              </span>
            )}
          </div>

          {summary.verificationState === 'Unverified' && (
            <div style={{ marginTop: 12 }}>
              <Button onClick={verify} disabled={busy}>
                Verify summary (Owner only)
              </Button>
              <p className="ckb-help">
                Only the Contract Owner can approve the summary. Until then, the
                contract cannot transition Onboarding → Active (Non-Negotiable #2).
              </p>
            </div>
          )}

          {summary.contentJson && (
            <pre
              className="ckb-card"
              style={{ marginTop: 16, whiteSpace: 'pre-wrap', overflow: 'auto' }}
            >
              {JSON.stringify(summary.contentJson, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
