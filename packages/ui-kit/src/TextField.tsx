import { useId } from 'react';
import type { InputHTMLAttributes } from 'react';

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  error?: string;
  help?: string;
}

export function TextField({ label, error, help, required, ...rest }: TextFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const helpId = `${id}-help`;
  return (
    <div className="ckb-field">
      <label htmlFor={id} className="ckb-label">
        {required ? `${label} *` : label}
      </label>
      <input
        id={id}
        required={required}
        {...rest}
        className="ckb-input"
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? errorId : help ? helpId : undefined}
      />
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
