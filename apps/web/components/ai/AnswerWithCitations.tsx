'use client';

import type { ReactNode } from 'react';

export interface CitationResolver {
  (chunkId: string): { label: string; sourceType: string; sourceId: string } | null;
}

/**
 * Renders an AI answer, replacing [cite:<chunkId>] markers with clickable
 * citation chips. Non-Negotiable #1 is enforced server-side; this just
 * makes the citations visible and clickable.
 */
export function AnswerWithCitations({
  text,
  resolver,
}: {
  text: string;
  resolver: CitationResolver;
}) {
  const parts: ReactNode[] = [];
  const regex = /\[cite:([a-zA-Z0-9,_-]+)\]/g;
  let last = 0;
  let idx = 0;
  for (const m of text.matchAll(regex)) {
    if (m.index !== undefined && m.index > last) {
      parts.push(<span key={`t-${idx++}`}>{text.slice(last, m.index)}</span>);
    }
    const chunkIds = m[1]!.split(',').map((s) => s.trim());
    for (const id of chunkIds) {
      if (id === 'none') {
        // "[cite:none]" is the explicit-refusal marker — render faintly.
        parts.push(
          <span
            key={`c-${idx++}`}
            className="ckb-citation"
            style={{ opacity: 0.7 }}
            title="No sources cited"
          >
            none
          </span>,
        );
        continue;
      }
      const resolved = resolver(id);
      parts.push(
        <a
          key={`c-${idx++}`}
          className="ckb-citation"
          href={resolved ? anchorFor(resolved) : '#'}
          title={resolved?.label ?? id}
        >
          {resolved?.label ?? id}
        </a>,
      );
    }
    last = (m.index ?? 0) + m[0].length;
  }
  if (last < text.length) parts.push(<span key={`t-final`}>{text.slice(last)}</span>);
  return <>{parts}</>;
}

function anchorFor(ref: { sourceType: string; sourceId: string }): string {
  if (ref.sourceType === 'Document') return `/documents/${ref.sourceId}`;
  if (ref.sourceType === 'Email') return `/emails/${ref.sourceId}`;
  if (ref.sourceType === 'Clause') return `/clauses/${ref.sourceId}`;
  return '#';
}
