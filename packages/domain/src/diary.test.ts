import { describe, expect, it } from 'vitest';
import { computeDiaryLockAt, isDiaryEntryLocked } from './diary.js';

describe('diary contemporaneous lock (NN #9)', () => {
  it('locks at end of the next UTC day for weekday creation', () => {
    // Tuesday 2026-04-21 14:00 UTC → locks Wed 2026-04-22 23:59:59 UTC.
    const occurred = new Date('2026-04-21T14:00:00Z');
    const lock = computeDiaryLockAt(occurred);
    expect(lock.toISOString()).toBe('2026-04-22T23:59:59.999Z');
  });

  it('skips weekends when next-business-day lands on Monday', () => {
    // Friday 2026-04-24 → next business day is Monday 2026-04-27.
    const occurred = new Date('2026-04-24T14:00:00Z');
    const lock = computeDiaryLockAt(occurred);
    expect(lock.toISOString()).toBe('2026-04-27T23:59:59.999Z');
  });

  it('Saturday and Sunday creation lock on Monday', () => {
    const sat = new Date('2026-04-25T10:00:00Z');
    const sun = new Date('2026-04-26T10:00:00Z');
    expect(computeDiaryLockAt(sat).toISOString()).toBe('2026-04-27T23:59:59.999Z');
    expect(computeDiaryLockAt(sun).toISOString()).toBe('2026-04-27T23:59:59.999Z');
  });

  it('isDiaryEntryLocked is false during the window and true after', () => {
    const occurred = new Date('2026-04-21T14:00:00Z');
    expect(isDiaryEntryLocked(occurred, new Date('2026-04-22T12:00:00Z'))).toBe(false);
    expect(isDiaryEntryLocked(occurred, new Date('2026-04-23T00:00:01Z'))).toBe(true);
  });
});
