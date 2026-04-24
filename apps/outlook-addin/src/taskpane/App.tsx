import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  listAccessibleContracts,
  type ApiContract,
  ApiError,
} from '../lib/api-client.js';
import {
  clearStoredSession,
  fetchDevUsers,
  isAzureAdMode,
  issueDevToken,
  readStoredToken,
  readStoredUser,
  writeStoredSession,
  type DevUserRow,
  type StoredUser,
} from '../lib/auth.js';
import { getCurrentItemSummary, readCurrentItemAsEml } from '../lib/office-item.js';
import {
  enqueueForward,
  flushQueue,
  listQueuedForwards,
  type QueuedForward,
} from '../lib/offline-queue.js';

/**
 * Taskpane root. Renders:
 *   - login section (dev-mode shim; Azure AD acquisition is a TODO)
 *   - current-item preview
 *   - searchable contract dropdown (default-deny list from /api/contracts)
 *   - "Send to Contract" button
 *   - offline queue view with manual flush
 */
export const App: React.FC = () => {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<StoredUser | null>(null);
  const [contracts, setContracts] = useState<readonly ApiContract[]>([]);
  const [loadingContracts, setLoadingContracts] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedContractId, setSelectedContractId] = useState<string | null>(null);
  const [queueItems, setQueueItems] = useState<readonly QueuedForward[]>([]);
  const [status, setStatus] = useState<
    | { kind: 'idle' }
    | { kind: 'sending' }
    | { kind: 'queued'; entryId: number; reason: string }
    | { kind: 'success'; eventId: string; contractName: string }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' });
  const [online, setOnline] = useState<boolean>(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  const itemSummary = useMemo(() => getCurrentItemSummary(), []);

  // --- hydrate session + contracts on mount ---------------------------------
  useEffect(() => {
    setToken(readStoredToken());
    setUser(readStoredUser());
  }, []);

  useEffect(() => {
    if (!token) return;
    setLoadingContracts(true);
    listAccessibleContracts(token)
      .then((rows) => setContracts(rows))
      .catch((err) => {
        const message = err instanceof ApiError ? err.message : String(err);
        setStatus({ kind: 'error', message });
      })
      .finally(() => setLoadingContracts(false));
  }, [token]);

  // --- queue state + online listener ---------------------------------------
  const refreshQueue = useCallback(async () => {
    setQueueItems(await listQueuedForwards());
  }, []);

  useEffect(() => {
    void refreshQueue();
  }, [refreshQueue]);

  useEffect(() => {
    const onOnline = (): void => {
      setOnline(true);
      if (token) {
        void flushQueue(token).then(refreshQueue);
      }
    };
    const onOffline = (): void => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [token, refreshQueue]);

  // --- derived: filtered contract list --------------------------------------
  const filteredContracts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contracts;
    return contracts.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.projectEmailAddress.toLowerCase().includes(q) ||
        (c.projectEmailAlias?.toLowerCase().includes(q) ?? false),
    );
  }, [contracts, search]);

  // --- actions --------------------------------------------------------------
  const handleSend = useCallback(async () => {
    if (!token) {
      setStatus({ kind: 'error', message: 'Sign in first' });
      return;
    }
    if (!selectedContractId) {
      setStatus({ kind: 'error', message: 'Select a contract' });
      return;
    }
    setStatus({ kind: 'sending' });
    const contract = contracts.find((c) => c.id === selectedContractId);
    try {
      const { base64, fromAddress, subject } = await readCurrentItemAsEml();
      try {
        const res = await (await import('../lib/api-client.js')).forwardEmailToContract(
          token,
          selectedContractId,
          base64,
          fromAddress,
        );
        setStatus({
          kind: 'success',
          eventId: res.inboundEventId,
          contractName: contract?.name ?? selectedContractId,
        });
        await refreshQueue();
      } catch (err) {
        const isNetwork = err instanceof TypeError;
        if (isNetwork) {
          // Offline / API unreachable: queue for later (SOW §6.18 offline queue,
          // IndexedDB exception to Non-Negotiable #7).
          const id = await enqueueForward({
            contractId: selectedContractId,
            contractName: contract?.name ?? selectedContractId,
            subject,
            envelopeFrom: fromAddress,
            emlBase64: base64,
          });
          await refreshQueue();
          setStatus({
            kind: 'queued',
            entryId: id,
            reason: 'Offline — email will be forwarded when the network returns.',
          });
        } else {
          const message = err instanceof ApiError ? err.message : String(err);
          setStatus({ kind: 'error', message });
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus({ kind: 'error', message });
    }
  }, [token, selectedContractId, contracts, refreshQueue]);

  const handleFlush = useCallback(async () => {
    if (!token) return;
    const outcome = await flushQueue(token);
    await refreshQueue();
    if (outcome.succeeded > 0) {
      setStatus({
        kind: 'success',
        eventId: `flushed:${outcome.succeeded}`,
        contractName: 'queued items',
      });
    } else if (outcome.failed > 0) {
      const first = outcome.results.find((r) => !r.ok);
      setStatus({ kind: 'error', message: first?.error ?? 'Flush failed' });
    }
  }, [token, refreshQueue]);

  // --- render ---------------------------------------------------------------
  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">Send to Contract</h1>
        <div className="app__status-pill" data-online={online}>
          {online ? 'Online' : 'Offline'}
        </div>
      </header>

      {!token ? (
        <LoginSection
          onSignedIn={async (t, u) => {
            await writeStoredSession(t, u);
            setToken(t);
            setUser(u);
          }}
        />
      ) : (
        <>
          <section className="app__user">
            <span>
              Signed in as <strong>{user?.displayName ?? user?.email}</strong>
            </span>
            <button
              type="button"
              onClick={async () => {
                await clearStoredSession();
                setToken(null);
                setUser(null);
              }}
            >
              Sign out
            </button>
          </section>

          <section className="app__item-preview">
            <h2>Current email</h2>
            {itemSummary ? (
              <dl>
                <dt>From</dt>
                <dd>
                  {itemSummary.fromName ?? ''} {'<'}
                  {itemSummary.fromAddress ?? 'unknown'}
                  {'>'}
                </dd>
                <dt>Subject</dt>
                <dd>{itemSummary.subject || '(no subject)'}</dd>
              </dl>
            ) : (
              <p className="muted">No Outlook item in context.</p>
            )}
          </section>

          <section className="app__contract-picker">
            <h2>Route to contract</h2>
            <label htmlFor="ckb-contract-search">Search</label>
            <input
              id="ckb-contract-search"
              type="search"
              placeholder="Contract name or project email"
              value={search}
              onChange={(e: { target: { value: string } }) => setSearch(e.target.value)}
            />
            {loadingContracts ? (
              <p className="muted">Loading contracts…</p>
            ) : (
              <ul className="app__contract-list" role="listbox">
                {filteredContracts.length === 0 && (
                  <li className="muted">
                    No accessible contracts. Ask your contract owner for a grant.
                  </li>
                )}
                {filteredContracts.map((c) => (
                  <li key={c.id}>
                    <label>
                      <input
                        type="radio"
                        name="ckb-contract"
                        value={c.id}
                        checked={selectedContractId === c.id}
                        onChange={() => setSelectedContractId(c.id)}
                      />
                      <span className="app__contract-name">{c.name}</span>
                      <span className="app__contract-email muted">
                        {c.projectEmailAlias ?? c.projectEmailAddress}
                      </span>
                      <span className="app__contract-state">{c.lifecycleState}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="app__send">
            <button
              type="button"
              className="app__send-btn"
              onClick={handleSend}
              disabled={status.kind === 'sending' || !selectedContractId || !itemSummary}
            >
              {status.kind === 'sending' ? 'Sending…' : 'Send to Contract'}
            </button>
            <StatusBanner status={status} />
          </section>

          <section className="app__queue">
            <div className="app__queue-header">
              <h2>Pending ({queueItems.length})</h2>
              <button
                type="button"
                disabled={!online || queueItems.length === 0}
                onClick={handleFlush}
              >
                Flush now
              </button>
            </div>
            {queueItems.length === 0 ? (
              <p className="muted">Nothing waiting.</p>
            ) : (
              <ul>
                {queueItems.map((q) => (
                  <li key={q.id}>
                    <strong>{q.contractName}</strong>
                    <span className="muted"> — {q.subject}</span>
                    <span className="muted">
                      {' '}
                      (queued {new Date(q.queuedAt).toLocaleString()}, {q.attempts} attempts)
                    </span>
                    {q.lastError && (
                      <div className="error-text">last error: {q.lastError}</div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
};

// --- sub-components ---------------------------------------------------------

const LoginSection: React.FC<{
  onSignedIn: (token: string, user: StoredUser) => Promise<void>;
}> = ({ onSignedIn }) => {
  const [devUsers, setDevUsers] = useState<readonly DevUserRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAzureAdMode()) return;
    fetchDevUsers()
      .then(setDevUsers)
      .catch((err) => setError(String(err)));
  }, []);

  const signInAsDev = useCallback(
    async (u: DevUserRow) => {
      setLoading(true);
      setError(null);
      try {
        const token = await issueDevToken(u.id);
        await onSignedIn(token, { id: u.id, email: u.email, displayName: u.displayName });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [onSignedIn],
  );

  if (isAzureAdMode()) {
    // TODO (post-M365): replace with `OfficeRuntime.auth.getAccessToken` and an
    // on-behalf-of exchange against our API audience. Until then, this branch
    // is intentionally unimplemented — surface it clearly rather than fake it.
    return (
      <section className="app__login">
        <h2>Azure AD sign-in</h2>
        <p className="muted">
          Production Azure AD SSO wiring is pending (Slice: Outlook Add-in Phase 2).
          Contact IT to bridge a bearer token or switch AUTH_MODE=local-dev for dev builds.
        </p>
      </section>
    );
  }

  return (
    <section className="app__login">
      <h2>Sign in (dev)</h2>
      <p className="muted">
        Pick a dev principal. Production builds require Azure AD SSO.
      </p>
      {error && <div className="error-text">{error}</div>}
      <ul>
        {devUsers.map((u) => (
          <li key={u.id}>
            <button type="button" disabled={loading} onClick={() => void signInAsDev(u)}>
              {u.displayName} — <span className="muted">{u.email}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};

const StatusBanner: React.FC<{
  status:
    | { kind: 'idle' }
    | { kind: 'sending' }
    | { kind: 'queued'; entryId: number; reason: string }
    | { kind: 'success'; eventId: string; contractName: string }
    | { kind: 'error'; message: string };
}> = ({ status }) => {
  if (status.kind === 'idle' || status.kind === 'sending') return null;
  if (status.kind === 'success') {
    return (
      <div className="banner banner--success" role="status">
        Forwarded to {status.contractName}. Inbound event: {status.eventId}.
      </div>
    );
  }
  if (status.kind === 'queued') {
    return (
      <div className="banner banner--warn" role="status">
        {status.reason} (queue entry #{status.entryId})
      </div>
    );
  }
  return (
    <div className="banner banner--error" role="alert">
      {status.message}
    </div>
  );
};
