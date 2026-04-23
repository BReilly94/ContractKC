import { useId } from 'react';
import type { SelectHTMLAttributes } from 'react';

export interface SelectOption {
  readonly value: string;
  readonly label: string;
  readonly group?: string;
}

export interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id' | 'children'> {
  label: string;
  options: readonly SelectOption[];
  error?: string;
  help?: string;
  placeholder?: string;
}

export function Select({
  label,
  options,
  error,
  help,
  placeholder,
  required,
  ...rest
}: SelectProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const helpId = `${id}-help`;
  const grouped = new Map<string | undefined, SelectOption[]>();
  for (const o of options) {
    const bucket = grouped.get(o.group) ?? [];
    bucket.push(o);
    grouped.set(o.group, bucket);
  }
  return (
    <div className="ckb-field">
      <label htmlFor={id} className="ckb-label">
        {label}
        {required ? ' *' : ''}
      </label>
      <select
        id={id}
        required={required}
        {...rest}
        className="ckb-input"
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? errorId : help ? helpId : undefined}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {Array.from(grouped.entries()).map(([group, opts]) =>
          group ? (
            <optgroup key={group} label={group}>
              {opts.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          ) : (
            opts.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))
          ),
        )}
      </select>
      {help && !error && (
        <div id={helpId} className="ckb-help">
          {help}
        </div>
      )}
      {error && (
        <div id={errorId} className="ckb-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
