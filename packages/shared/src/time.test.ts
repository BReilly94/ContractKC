import { describe, expect, it } from 'vitest';
import { isIsoDate, parseIso, toIsoString, utcNow } from './time.js';

describe('time', () => {
  it('utcNow returns a Date', () => {
    expect(utcNow()).toBeInstanceOf(Date);
  });

  it('toIsoString + parseIso round-trip', () => {
    const d = new Date('2026-04-21T10:30:00.000Z');
    const iso = toIsoString(d);
    expect(parseIso(iso).getTime()).toBe(d.getTime());
  });

  it('parseIso rejects invalid values', () => {
    expect(() => parseIso('not-a-date')).toThrow(/Invalid/);
  });

  it('isIsoDate validates YYYY-MM-DD', () => {
    expect(isIsoDate('2026-04-21')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('21/04/2026')).toBe(false);
  });
});
