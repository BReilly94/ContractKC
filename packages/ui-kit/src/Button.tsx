import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({ variant = 'primary', className, type, ...rest }: ButtonProps) {
  const cls = `ckb-btn ckb-btn--${variant}${className ? ` ${className}` : ''}`;
  return <button type={type ?? 'button'} {...rest} className={cls} />;
}
