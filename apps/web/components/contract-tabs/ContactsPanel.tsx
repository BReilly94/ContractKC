'use client';

import { Button, Select, TextField } from '@ckb/ui-kit';
import { useEffect, useState } from 'react';
import { PanelShell } from '@/components/PanelShell';
import { api, type ApiContact } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';

const AUTHORITY_LABELS: Record<ApiContact['authorityLevel'], string> = {
  CanDirectExtraWork: 'Can direct extra work',
  CanIssueSiteInstructions: 'Can issue site instructions',
  CanApproveVariations: 'Can approve variations',
  Administrative: 'Administrative',
};

const AUTHORITY_OPTIONS = (
  Object.entries(AUTHORITY_LABELS) as [ApiContact['authorityLevel'], string][]
).map(([value, label]) => ({ value, label }));

function authorityBadgeClass(level: ApiContact['authorityLevel']): string {
  if (level === 'CanDirectExtraWork' || level === 'CanIssueSiteInstructions') {
    return 'ckb-badge--warning';
  }
  return '';
}

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
    <PanelShell
      title="Contact directory"
      count={contacts?.length}
      action={<Button onClick={() => setShowAdd(!showAdd)}>Add contact</Button>}
      loading={contacts === null}
      error={error}
      empty={contacts?.length === 0}
      emptyMessage="No contacts yet. Add named individuals with their authority levels — the email viewer uses this to surface who can direct work or approve variations."
    >
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
          {contacts?.map((c) => (
            <tr key={c.id}>
              <td style={{ fontWeight: 600 }}>{c.name}</td>
              <td>{c.roleTitle ?? <span className="ckb-help">—</span>}</td>
              <td>
                {c.email && <div>{c.email}</div>}
                {c.phone && <div className="ckb-help">{c.phone}</div>}
                {!c.email && !c.phone && <span className="ckb-help">—</span>}
              </td>
              <td>
                <span className={`ckb-badge ${authorityBadgeClass(c.authorityLevel)}`}>
                  {AUTHORITY_LABELS[c.authorityLevel]}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

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
    </PanelShell>
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
    <div className="ckb-card" style={{ marginTop: 'var(--ckb-space-4)' }}>
      <h4 style={{ margin: '0 0 var(--ckb-space-4)' }}>New contact</h4>

      <TextField
        label="Name"
        required
        value={name}
        onChange={(e) => setName(e.currentTarget.value)}
      />
      <TextField
        label="Role / title"
        value={role}
        onChange={(e) => setRole(e.currentTarget.value)}
      />
      <TextField
        label="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.currentTarget.value)}
      />
      <TextField
        label="Phone"
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.currentTarget.value)}
      />
      <Select
        label="Authority level"
        options={AUTHORITY_OPTIONS}
        value={authority}
        onChange={(e) =>
          setAuthority(e.currentTarget.value as ApiContact['authorityLevel'])
        }
      />

      {err && (
        <div role="alert" className="ckb-error" style={{ marginBottom: 'var(--ckb-space-3)' }}>
          {err}
        </div>
      )}

      <div className="ckb-stack-row">
        <Button onClick={submit} disabled={busy || name.trim().length === 0}>
          {busy ? 'Saving…' : 'Save contact'}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
