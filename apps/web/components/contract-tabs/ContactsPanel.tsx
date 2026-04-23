'use client';

import { Button } from '@ckb/ui-kit';
import { useEffect, useState } from 'react';
import { api, type ApiContact } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';

const AUTHORITY_LABELS: Record<ApiContact['authorityLevel'], string> = {
  CanDirectExtraWork: 'Can direct extra work',
  CanIssueSiteInstructions: 'Can issue site instructions',
  CanApproveVariations: 'Can approve variations',
  Administrative: 'Administrative',
};

export function ContactsPanel({ contractId }: { contractId: string }) {
  const token = useAuthStore((s) => s.token);
  const [contacts, setContacts] = useState<ApiContact[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  async function reload(): Promise<void> {
    if (!token) return;
    try {
      setContacts(await api.listContacts({ token }, contractId));
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
        <h3>Contact directory</h3>
        <Button onClick={() => setShowAdd(!showAdd)}>Add contact</Button>
      </div>
      {error && <div role="alert" className="ckb-error">{error}</div>}
      {contacts === null && <p>Loading…</p>}
      {contacts && contacts.length === 0 && (
        <div className="ckb-empty-state">
          <p>No contacts yet. Add named individuals with authority levels so the email viewer can surface who can direct work.</p>
        </div>
      )}
      {contacts && contacts.length > 0 && (
        <table className="ckb-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Contact</th>
              <th>Authority</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.roleTitle ?? '—'}</td>
                <td>
                  {c.email && <div>{c.email}</div>}
                  {c.phone && <div className="ckb-help">{c.phone}</div>}
                </td>
                <td>
                  <span className="ckb-badge">{AUTHORITY_LABELS[c.authorityLevel]}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {showAdd && (
        <AddContactForm
          contractId={contractId}
          onClose={() => setShowAdd(false)}
          onAdded={() => {
            setShowAdd(false);
            void reload();
          }}
        />
      )}
    </div>
  );
}

function AddContactForm({
  contractId,
  onClose,
  onAdded,
}: {
  contractId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const token = useAuthStore((s) => s.token);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [authority, setAuthority] = useState<ApiContact['authorityLevel']>('Administrative');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(): Promise<void> {
    if (!token || name.trim().length === 0) return;
    setBusy(true);
    setErr(null);
    try {
      await api.createContact({ token }, contractId, {
        name: name.trim(),
        roleTitle: role.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        authorityLevel: authority,
      });
      onAdded();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ckb-card" style={{ marginTop: 16 }}>
      <h4>New contact</h4>
      <div style={{ display: 'grid', gap: 8 }}>
        <label>
          Name{' '}
          <input
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            style={{ width: '100%', padding: 8 }}
          />
        </label>
        <label>
          Role{' '}
          <input
            value={role}
            onChange={(e) => setRole(e.currentTarget.value)}
            style={{ width: '100%', padding: 8 }}
          />
        </label>
        <label>
          Email{' '}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
            style={{ width: '100%', padding: 8 }}
          />
        </label>
        <label>
          Phone{' '}
          <input
            value={phone}
            onChange={(e) => setPhone(e.currentTarget.value)}
            style={{ width: '100%', padding: 8 }}
          />
        </label>
        <label>
          Authority{' '}
          <select
            value={authority}
            onChange={(e) => setAuthority(e.currentTarget.value as ApiContact['authorityLevel'])}
          >
            {Object.entries(AUTHORITY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>
      {err && <div role="alert" className="ckb-error">{err}</div>}
      <div className="ckb-stack-row" style={{ marginTop: 12 }}>
        <Button onClick={submit} disabled={busy || name.trim().length === 0}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
