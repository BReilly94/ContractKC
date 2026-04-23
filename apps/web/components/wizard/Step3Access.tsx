'use client';

import { Button, Select, type SelectOption } from '@ckb/ui-kit';
import { GOVERNING_LAW_OPTIONS } from '@ckb/domain';
import { useEffect, useMemo, useState } from 'react';
import { api, type ApiUser } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { useWizardStore, type ContractRole } from '@/lib/wizard-store';

const ROLE_OPTIONS: SelectOption[] = [
  { value: 'Owner', label: 'Owner' },
  { value: 'Administrator', label: 'Administrator' },
  { value: 'Contributor', label: 'Contributor' },
  { value: 'Viewer', label: 'Viewer' },
  { value: 'RestrictedViewer', label: 'Restricted Viewer' },
];

export function Step3Access({
  onBack,
  onSubmit,
  submitting,
  error,
}: {
  onBack: () => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
}) {
  const { user, token } = useAuthStore();
  const state = useWizardStore();
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [draftUserId, setDraftUserId] = useState('');
  const [draftRole, setDraftRole] = useState<ContractRole>('Viewer');

  useEffect(() => {
    if (!token) return;
    api.listPmUsers({ token }).then(setUsers).catch(() => {
      /* ignore */
    });
  }, [token]);

  const creatorId = user?.id;
  const pmId = state.responsiblePmUserId;
  const pmName = users.find((u) => u.id === pmId)?.displayName ?? pmId;
  const governingLawLabel = useMemo(
    () => GOVERNING_LAW_OPTIONS.find((o) => o.code === state.governingLaw)?.label ?? state.governingLaw,
    [state.governingLaw],
  );

  const extraUserOptions: SelectOption[] = users
    .filter((u) => u.id !== creatorId && u.id !== pmId)
    .filter((u) => !state.additionalGrants.some((g) => g.userId === u.id))
    .map((u) => ({ value: u.id, label: `${u.displayName} (${u.email})` }));

  function addGrant() {
    if (!draftUserId) return;
    state.setField('additionalGrants', [
      ...state.additionalGrants,
      { userId: draftUserId, role: draftRole },
    ]);
    setDraftUserId('');
  }
  function removeGrant(userId: string) {
    state.setField(
      'additionalGrants',
      state.additionalGrants.filter((g) => g.userId !== userId),
    );
  }

  return (
    <>
      <h2>Step 3 — Access & review</h2>
      <p className="ckb-help">
        The creator is always the Owner and the responsible PM is always an Administrator. Add other
        users as needed.
      </p>

      <div className="ckb-card">
        <strong>Default grants</strong>
        <ul>
          <li>
            {user?.displayName ?? 'You'} — <strong>Owner</strong> (creator, locked)
          </li>
          {pmId && pmId !== creatorId && (
            <li>
              {pmName} — <strong>Administrator</strong> (responsible PM)
            </li>
          )}
        </ul>
      </div>

      <div className="ckb-card">
        <strong>Additional grants</strong>
        {state.additionalGrants.length === 0 ? (
          <p className="ckb-help">None — this contract will be visible to the creator and PM only.</p>
        ) : (
          <ul>
            {state.additionalGrants.map((g) => {
              const u = users.find((x) => x.id === g.userId);
              return (
                <li key={g.userId} className="ckb-stack-row">
                  <span>
                    {u?.displayName ?? g.userId} — {g.role}
                  </span>
                  <Button variant="ghost" onClick={() => removeGrant(g.userId)}>
                    Remove
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="ckb-stack-row">
          <div style={{ flex: 1 }}>
            <Select
              label="Add user"
              value={draftUserId}
              onChange={(e) => setDraftUserId(e.target.value)}
              options={extraUserOptions}
              placeholder={
                extraUserOptions.length === 0 ? 'No more users to add' : 'Pick a user'
              }
            />
          </div>
          <div style={{ flex: 1 }}>
            <Select
              label="Role"
              value={draftRole}
              onChange={(e) => setDraftRole(e.target.value as ContractRole)}
              options={ROLE_OPTIONS}
            />
          </div>
          <Button variant="secondary" onClick={addGrant} disabled={!draftUserId}>
            Add
          </Button>
        </div>
      </div>

      <div className="ckb-card">
        <h3>Review</h3>
        <dl>
          <dt>Name</dt>
          <dd>{state.name}</dd>
          <dt>Language / Confidentiality</dt>
          <dd>
            {state.language} · {state.confidentialityClass}
          </dd>
          <dt>Value</dt>
          <dd>
            {state.contractValueCents === null
              ? '—'
              : new Intl.NumberFormat('en-CA', {
                  style: 'currency',
                  currency: state.currency,
                }).format(state.contractValueCents / 100)}
          </dd>
          <dt>Term</dt>
          <dd>
            {state.startDate} → {state.endDate || 'open-ended'}
          </dd>
          <dt>Governing law</dt>
          <dd>{governingLawLabel}</dd>
          <dt>Email alias</dt>
          <dd>{state.humanEmailAlias || '— canonical only'}</dd>
        </dl>
      </div>

      {error && (
        <div role="alert" className="ckb-error">
          {error}
        </div>
      )}

      <div className="ckb-stack-row" style={{ justifyContent: 'space-between' }}>
        <Button variant="secondary" onClick={onBack} disabled={submitting}>
          Back
        </Button>
        <Button onClick={onSubmit} disabled={submitting}>
          {submitting ? 'Creating…' : 'Create contract'}
        </Button>
      </div>
    </>
  );
}
