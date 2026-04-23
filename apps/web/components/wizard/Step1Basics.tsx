'use client';

import { Button, Dialog, Select, TextField, type SelectOption } from '@ckb/ui-kit';
import { useEffect, useState } from 'react';
import { api, type ApiParty, type ApiUser } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { useWizardStore } from '@/lib/wizard-store';

export function Step1Basics({ onNext }: { onNext: () => void }) {
  const token = useAuthStore((s) => s.token);
  const state = useWizardStore();
  const [parties, setParties] = useState<ApiParty[]>([]);
  const [pms, setPms] = useState<ApiUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [newPartyOpen, setNewPartyOpen] = useState(false);
  const [newPartyName, setNewPartyName] = useState('');
  const [newPartyError, setNewPartyError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    Promise.all([api.listParties({ token }), api.listPmUsers({ token })])
      .then(([p, u]) => {
        setParties(p);
        setPms(u);
      })
      .catch(() => {
        /* surfaced below */
      })
      .finally(() => setLoading(false));
  }, [token]);

  function validateAndContinue() {
    const e: Record<string, string> = {};
    if (!state.name.trim()) e.name = 'Contract name is required';
    if (!state.clientPartyId) e.clientPartyId = 'Choose a client';
    if (!state.responsiblePmUserId) e.responsiblePmUserId = 'Choose a responsible PM';
    setErrors(e);
    if (Object.keys(e).length === 0) onNext();
  }

  async function createParty() {
    if (!token) return;
    const name = newPartyName.trim();
    if (name.length === 0) {
      setNewPartyError('Party name is required');
      return;
    }
    try {
      const p = await api.createParty({ token }, name);
      setParties((prev) => [...prev, p].sort((a, b) => a.name.localeCompare(b.name)));
      state.setField('clientPartyId', p.id);
      setNewPartyName('');
      setNewPartyError(null);
      setNewPartyOpen(false);
    } catch (e) {
      setNewPartyError(e instanceof Error ? e.message : 'Create failed');
    }
  }

  if (loading) return <p>Loading…</p>;

  const partyOptions: SelectOption[] = parties.map((p) => ({ value: p.id, label: p.name }));
  const pmOptions: SelectOption[] = pms.map((u) => ({
    value: u.id,
    label: `${u.displayName} (${u.email})`,
  }));

  return (
    <>
      <h2>Step 1 — Basics</h2>
      <p className="ckb-help">Who this contract is with, who owns it on our side, and how sensitive it is.</p>

      <TextField
        label="Contract name"
        required
        value={state.name}
        onChange={(e) => state.setField('name', e.target.value)}
        error={errors.name}
        help="Used in search and on the dashboard. No hard uniqueness constraint."
      />

      <div className="ckb-stack-row" style={{ alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <Select
            label="Client party"
            required
            value={state.clientPartyId}
            onChange={(e) => state.setField('clientPartyId', e.target.value)}
            options={partyOptions}
            placeholder="Select a client"
            error={errors.clientPartyId}
          />
        </div>
        <Button variant="secondary" onClick={() => setNewPartyOpen(true)}>
          + New party
        </Button>
      </div>

      <Select
        label="Responsible PM"
        required
        value={state.responsiblePmUserId}
        onChange={(e) => state.setField('responsiblePmUserId', e.target.value)}
        options={pmOptions}
        placeholder={pmOptions.length === 0 ? 'No PM users seeded' : 'Select a PM'}
        error={errors.responsiblePmUserId}
        help="Users flagged is_pm=true. Set in DB or via admin UI (§5.12)."
      />

      <Select
        label="Confidentiality"
        value={state.confidentialityClass}
        onChange={(e) =>
          state.setField(
            'confidentialityClass',
            e.target.value as 'Standard' | 'Restricted' | 'HighlyRestricted',
          )
        }
        options={[
          { value: 'Standard', label: 'Standard' },
          { value: 'Restricted', label: 'Restricted' },
          { value: 'HighlyRestricted', label: 'Highly Restricted' },
        ]}
      />

      <Select
        label="Primary language"
        value={state.language}
        onChange={(e) => state.setField('language', e.target.value)}
        options={[
          { value: 'en', label: 'English' },
          { value: 'fr', label: 'French' },
          { value: 'es', label: 'Spanish' },
        ]}
      />

      <div className="ckb-stack-row" style={{ justifyContent: 'flex-end' }}>
        <Button onClick={validateAndContinue}>Continue</Button>
      </div>

      <Dialog
        open={newPartyOpen}
        onClose={() => setNewPartyOpen(false)}
        title="Create a new party"
      >
        <TextField
          label="Party name"
          required
          value={newPartyName}
          onChange={(e) => setNewPartyName(e.target.value)}
          error={newPartyError ?? undefined}
        />
        <div className="ckb-stack-row" style={{ justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={() => setNewPartyOpen(false)}>
            Cancel
          </Button>
          <Button onClick={createParty}>Create</Button>
        </div>
      </Dialog>
    </>
  );
}
