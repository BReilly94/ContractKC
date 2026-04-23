'use client';

import { Button, Logo } from '@ckb/ui-kit';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';

const AUTH_MODE = process.env.NEXT_PUBLIC_AUTH_MODE;

interface DevUser {
  id: string;
  email: string;
  displayName: string;
}

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const [users, setUsers] = useState<DevUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    if (AUTH_MODE !== 'local-dev') {
      setError('Dev login is disabled (AUTH_MODE is not local-dev)');
      return;
    }
    api
      .devListUsers({ token: null })
      .then((list) => setUsers(list))
      .catch((e: Error) => setError(e.message));
  }, []);

  async function pickUser(user: DevUser) {
    setPending(user.id);
    setError(null);
    try {
      const { token } = await api.devIssueToken(user.id);
      login(token, user);
      router.push('/contracts');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed');
    } finally {
      setPending(null);
    }
  }

  return (
    <main className="ckb-login">
      <div className="ckb-login__brand">
        <Logo variant="vertical" tone="black" width={200} />
      </div>
      <h1>Dev login</h1>
      <p className="ckb-help">
        Pick a seeded dev user. This screen is only visible when{' '}
        <code>NEXT_PUBLIC_AUTH_MODE=local-dev</code>.
      </p>
      {error && (
        <div role="alert" className="ckb-error">
          {error}
        </div>
      )}
      {users === null && !error && <p>Loading…</p>}
      {users && users.length === 0 && (
        <div className="ckb-empty-state">
          <p>No dev users available. Run <code>pnpm db:seed</code>.</p>
        </div>
      )}
      {users && users.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {users.map((u) => (
            <li key={u.id} className="ckb-card">
              <div className="ckb-stack-row" style={{ justifyContent: 'space-between' }}>
                <div>
                  <strong>{u.displayName}</strong>
                  <div className="ckb-help">{u.email}</div>
                </div>
                <Button onClick={() => pickUser(u)} disabled={pending === u.id}>
                  {pending === u.id ? 'Signing in…' : 'Sign in as this user'}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
