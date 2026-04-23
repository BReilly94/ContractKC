export type CurrencyCode = string & { readonly __brand: 'CurrencyCode' };

const SUPPORTED_CURRENCIES = ['CAD', 'USD', 'EUR', 'AUD', 'MXN'] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export const supportedCurrencies: readonly SupportedCurrency[] = SUPPORTED_CURRENCIES;

export function isSupportedCurrency(code: string): code is SupportedCurrency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(code);
}

export function asCurrency(code: string): CurrencyCode {
  if (!isSupportedCurrency(code)) {
    throw new Error(`Unsupported currency: ${code}`);
  }
  return code as CurrencyCode;
}

export interface Money {
  readonly cents: number;
  readonly currency: CurrencyCode;
}

export function money(cents: number, currency: string): Money {
  if (!Number.isInteger(cents)) {
    throw new Error(`Money cents must be an integer, got ${cents}`);
  }
  if (cents < 0) {
    throw new Error(`Money cents must be non-negative, got ${cents}`);
  }
  return { cents, currency: asCurrency(currency) };
}

export function formatMoney(m: Money, locale = 'en-CA'): string {
  const major = m.cents / 100;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: m.currency,
  }).format(major);
}
