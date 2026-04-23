import { useId } from 'react';

export interface MoneyInputProps {
  label: string;
  valueCents: number | null;
  currency: string;
  currencyOptions: readonly string[];
  onChange: (next: { valueCents: number | null; currency: string }) => void;
  error?: string;
  disabled?: boolean;
  required?: boolean;
}

export function MoneyInput({
  label,
  valueCents,
  currency,
  currencyOptions,
  onChange,
  error,
  disabled,
  required,
}: MoneyInputProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const major = valueCents === null ? '' : (valueCents / 100).toString();
  return (
    <div className="ckb-field">
      <label htmlFor={id} className="ckb-label">
        {label}
        {required ? ' *' : ''}
      </label>
      <div className="ckb-money">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={major}
          disabled={disabled}
          required={required}
          className="ckb-input ckb-money__amount"
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') {
              onChange({ valueCents: null, currency });
              return;
            }
            const num = Number(raw);
            if (!Number.isFinite(num) || num < 0) return;
            const cents = Math.round(num * 100);
            onChange({ valueCents: cents, currency });
          }}
        />
        <label htmlFor={`${id}-currency`} className="ckb-visuallyhidden">
          Currency
        </label>
        <select
          id={`${id}-currency`}
          value={currency}
          disabled={disabled}
          className="ckb-input ckb-money__currency"
          onChange={(e) => onChange({ valueCents, currency: e.target.value })}
        >
          {currencyOptions.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <div id={errorId} className="ckb-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
