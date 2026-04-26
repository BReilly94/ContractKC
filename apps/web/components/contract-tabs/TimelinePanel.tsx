'use client';

import { useEffect, useState } from 'react';
import { Button } from '@ckb/ui-kit';
import { api, type ApiTimelineItem } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';

const KIND_LABELS: Record<string, string> = {
  'contract.lifecycle': 'Lifecycle',
  variation: 'Variation',
  claim: 'Claim',
  rfi: 'RFI',
  submittal: 'Submittal',
  email: 'Email',
  document: 'Document',
  diary: 'Diary',
  record_flag: 'Flag',
  payment: 'Payment',
  'deadline.triggered': 'Deadline',
  interpretation: 'Interpretation',
  notification: 'Notification',
};

export function TimelinePanel({ contractId }: { contractId: string }) {
  const token = useAuthStore((s) => s.token);
  const [items, setItems] = useState<ApiTimelineItem[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(cursor?: string): Promise<void> {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.listTimeline({ token }, contractId, {
        limit: 50,
        cursor,
      });
      setItems((prev) =>
        cursor && prev ? [...prev, ...result.items] : result.items,
      );
      setNextCursor(result.nextCursor);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [token, contractId]);

  return (
    <div>
      <h3>Contract Timeline</h3>
      {error && (
        <div role="alert" className="ckb-error">
          {error}
        </div>
      )}
      {items === null && <p>Loading…</p>}
      {items !== null && items.length === 0 && (
        <div className="ckb-empty-state">
          <p>
            No events recorded yet. The timeline will populate as amendments, emails,
            variations, claims, and other contract events occur.
          </p>
        </div>
      )}
      {items !== null && items.length > 0 && (
        <ol className="ckb-timeline" aria-label="Contract events">
          {items.map((item) => (
            <TimelineEntry key={item.id} item={item} />
          ))}
        </ol>
      )}
      {nextCursor && (
        <div style={{ marginTop: 12 }}>
          <Button variant="ghost" onClick={() => void load(nextCursor)} disabled={loading}>
            {loading ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      )}
    </div>
  );
}

function TimelineEntry({ item }: { item: ApiTimelineItem }) {
  const severityClass =
    item.severity === 'critical'
      ? 'ckb-badge--warning'
      : item.severity === 'warning'
        ? 'ckb-badge--info'
        : '';

  return (
    <li className="ckb-timeline-entry">
      <div className="ckb-stack-row" style={{ gap: 8, alignItems: 'flex-start' }}>
        <span className={`ckb-badge ${severityClass}`} style={{ flexShrink: 0 }}>
          {KIND_LABELS[item.kind] ?? item.kind}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 500 }}>{item.title}</div>
          {item.subtitle && (
            <div className="ckb-help">{item.subtitle}</div>
          )}
        </div>
        <time
          dateTime={item.occurredAt}
          className="ckb-help"
          style={{ flexShrink: 0 }}
        >
          {new Date(item.occurredAt).toLocaleDateString()}
        </time>
      </div>
    </li>
  );
}
