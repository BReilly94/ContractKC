export function utcNow(): Date {
  return new Date();
}

export function toIsoString(date: Date): string {
  return date.toISOString();
}

export function parseIso(value: string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid ISO date: ${value}`);
  }
  return d;
}

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE_REGEX.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}
