'use client';

import { Button } from '@ckb/ui-kit';
import { useState } from 'react';
import { AnswerWithCitations } from '@/components/ai/AnswerWithCitations';
import { ConfidenceBadge } from '@/components/ai/ConfidenceBadge';
import { api, type ApiQaResponse } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';

interface ChatTurn {
  readonly id: string;
  readonly question: string;
  readonly response: ApiQaResponse | null;
  readonly error: string | null;
  readonly pending: boolean;
}

export function QueryPanel({ contractId }: { contractId: string }) {
  const token = useAuthStore((s) => s.token);
  const [input, setInput] = useState('');
  const [turns, setTurns] = useState<ChatTurn[]>([]);

  async function ask(): Promise<void> {
    if (!token || input.trim().length === 0) return;
    const question = input.trim();
    const id = Math.random().toString(36).slice(2);
    setTurns((prev) => [
      ...prev,
      { id, question, response: null, error: null, pending: true },
    ]);
    setInput('');
    try {
      const resp = await api.askQa({ token }, contractId, question);
      setTurns((prev) =>
        prev.map((t) =>
          t.id === id ? { ...t, response: resp, pending: false } : t,
        ),
      );
    } catch (e) {
      setTurns((prev) =>
        prev.map((t) =>
          t.id === id
            ? { ...t, error: (e as Error).message, pending: false }
            : t,
        ),
      );
    }
  }

  async function sendFeedback(queryId: string, thumb: 'up' | 'down'): Promise<void> {
    if (!token) return;
    try {
      await api.qaFeedback({ token }, queryId, thumb);
    } catch {
      // swallow — UI already showed the response
    }
  }

  return (
    <div>
      <h3>Ask this contract</h3>
      <p className="ckb-help">
        Every AI response is verified for citations before it reaches you — responses that
        fail citation verification are withheld and logged as quality incidents
        (Non-Negotiable #1).
      </p>

      <div style={{ minHeight: 220, marginBottom: 16 }}>
        {turns.length === 0 && (
          <div className="ckb-empty-state">
            <p>Ask a question about this contract, e.g. &ldquo;What is the notice period for a claim?&rdquo;</p>
          </div>
        )}
        {turns.map((t) => (
          <div key={t.id}>
            <div className="ckb-chat-row ckb-chat-row--user">
              <div className="ckb-chat-bubble ckb-chat-bubble--user">{t.question}</div>
            </div>
            <div className="ckb-chat-row">
              {t.pending && <div className="ckb-chat-bubble">Thinking…</div>}
              {!t.pending && t.error && (
                <div className="ckb-chat-bubble ckb-chat-bubble--blocked" role="alert">
                  {t.error}
                </div>
              )}
              {!t.pending && t.response && (
                <div
                  className={`ckb-chat-bubble ${
                    t.response.blocked ? 'ckb-chat-bubble--blocked' : ''
                  }`}
                >
                  <div style={{ marginBottom: 8 }}>
                    <ConfidenceBadge level={t.response.confidence} />
                  </div>
                  <div>
                    <AnswerWithCitations
                      text={t.response.answer}
                      resolver={(chunkId) => {
                        const cit = t.response!.citations.find((c) => c.chunkId === chunkId);
                        if (!cit) return null;
                        return {
                          label:
                            cit.sourceType === 'Document'
                              ? `Document ${cit.sourceId.slice(0, 6)}`
                              : cit.sourceType === 'Email'
                                ? `Email ${cit.sourceId.slice(0, 6)}`
                                : cit.sourceType === 'Clause'
                                  ? `Clause ${cit.sourceId.slice(0, 6)}`
                                  : chunkId,
                          sourceType: cit.sourceType,
                          sourceId: cit.sourceId,
                        };
                      }}
                    />
                  </div>
                  {t.response.citations.length > 0 && (
                    <details style={{ marginTop: 8 }}>
                      <summary>Sources ({t.response.citations.length})</summary>
                      <ul>
                        {t.response.citations.map((c) => (
                          <li key={c.chunkId}>
                            <strong>{c.sourceType}</strong> {c.sourceId.slice(0, 10)}…
                            <div className="ckb-help">{c.snippet}</div>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  {!t.response.blocked && (
                    <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                      <Button
                        variant="ghost"
                        onClick={() => sendFeedback(t.response!.queryId, 'up')}
                      >
                        👍
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => sendFeedback(t.response!.queryId, 'down')}
                      >
                        👎
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="ckb-stack-row">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void ask();
          }}
          placeholder="Ask a question about this contract…"
          style={{
            flex: 1,
            padding: 'var(--ckb-space-3)',
            border: '1px solid var(--ckb-border)',
            borderRadius: 'var(--ckb-radius-sm, 6px)',
          }}
          aria-label="Question"
        />
        <Button onClick={ask} disabled={input.trim().length === 0}>
          Ask
        </Button>
      </div>
    </div>
  );
}
