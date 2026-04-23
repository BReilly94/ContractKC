import { describe, expect, it } from 'vitest';
import { asCurrency, formatMoney, isSupportedCurrency, money } from './money.js';

describe('money', () => {
  it('creates money values', () => {
    const m = money(10000, 'CAD');
    expect(m.cents).toBe(10000);
    expect(m.currency).toBe('CAD');
  });

  it('rejects non-integer cents', () => {
    expect(() => money(100.5, 'CAD')).toThrow(/integer/);
  });

  it('rejects negative cents', () => {
    expect(() => money(-1, 'CAD')).toThrow(/non-negative/);
  });

  it('rejects unsupported currencies', () => {
    expect(() => asCurrency('XYZ')).toThrow(/Unsupported/);
  });

  it('type-guards currency codes', () => {
    expect(isSupportedCurrency('CAD')).toBe(true);
    expect(isSupportedCurrency('XYZ')).toBe(false);
  });

  it('formats money for display', () => {
    expect(formatMoney(money(123456, 'CAD'), 'en-CA')).toMatch(/1,234\.56/);
  });
});
