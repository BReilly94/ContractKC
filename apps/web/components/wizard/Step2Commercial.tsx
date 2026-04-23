'use client';

import {
  Button,
  DatePicker,
  MoneyInput,
  Select,
  TextField,
  type SelectOption,
} from '@ckb/ui-kit';
import { GOVERNING_LAW_OPTIONS } from '@ckb/domain';
import { useState } from 'react';

const SUPPORTED_CURRENCIES = ['CAD', 'USD', 'EUR', 'AUD', 'MXN'] as const;
import { useWizardStore } from '@/lib/wizard-store';

const lawOptions: SelectOption[] = GOVERNING_LAW_OPTIONS.map((o) => ({
  value: o.code,
  label: o.label,
  group: o.group,
}));

export function Step2Commercial({
  onBack,
  onNext,
}: {
  onBack: () => void;
  onNext: () => void;
}) {
  const state = useWizardStore();
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validateAndContinue() {
    const e: Record<string, string> = {};
    if (!state.startDate) e.startDate = 'Start date is required';
    if (state.endDate && state.endDate < state.startDate) {
      e.endDate = 'End date must not precede start date';
    }
    if (!state.governingLaw) e.governingLaw = 'Choose a governing law';
    if (state.humanEmailAlias && !/^[a-z0-9][a-z0-9-]{2,46}[a-z0-9]$/.test(state.humanEmailAlias)) {
      e.humanEmailAlias = 'Lowercase, 4–48 chars, no leading/trailing hyphen';
    }
    setErrors(e);
    if (Object.keys(e).length === 0) onNext();
  }

  return (
    <>
      <h2>Step 2 — Commercial & term</h2>
      <p className="ckb-help">Money, dates, and where the contract is governed.</p>

      <MoneyInput
        label="Contract value"
        valueCents={state.contractValueCents}
        currency={state.currency}
        currencyOptions={SUPPORTED_CURRENCIES}
        onChange={(next) => {
          state.setField('contractValueCents', next.valueCents);
          state.setField('currency', next.currency);
        }}
      />

      <DatePicker
        label="Start date"
        required
        value={state.startDate}
        onChange={(e) => state.setField('startDate', e.target.value)}
        error={errors.startDate}
      />

      <DatePicker
        label="End date"
        value={state.endDate}
        onChange={(e) => state.setField('endDate', e.target.value)}
        error={errors.endDate}
        help="Optional — some contracts are indefinite term."
      />

      <Select
        label="Governing law"
        required
        value={state.governingLaw}
        onChange={(e) => state.setField('governingLaw', e.target.value)}
        options={lawOptions}
        placeholder="Select a jurisdiction"
        error={errors.governingLaw}
      />

      <TextField
        label="Human-readable email alias"
        value={state.humanEmailAlias}
        onChange={(e) => state.setField('humanEmailAlias', e.target.value.toLowerCase())}
        error={errors.humanEmailAlias}
        help="Optional — e.g. redlake-expansion. The canonical address is always generated."
      />

      <div className="ckb-stack-row" style={{ justifyContent: 'space-between' }}>
        <Button variant="secondary" onClick={onBack}>
          Back
        </Button>
        <Button onClick={validateAndContinue}>Continue</Button>
      </div>
    </>
  );
}
