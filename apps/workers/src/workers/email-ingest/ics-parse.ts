// ical.js has only CJS output; use createRequire.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

export interface ParsedIcsEvent {
  readonly uid: string;
  readonly summary: string;
  readonly description: string | null;
  readonly startsAt: Date;
  readonly endsAt: Date | null;
  readonly organizerEmail: string | null;
  readonly location: string | null;
  readonly sequence: number;
  readonly rrule: string | null;
}

/**
 * Parse an .ics payload (`email-ingestion.md` §7.10). Returns the primary
 * VEVENT — recurring events keep their RRULE as a stored string; lazy
 * expansion happens at display/promotion time.
 */
export function parseIcs(bytes: Buffer): ParsedIcsEvent | null {
  const text = bytes.toString('utf8');
  try {
    const ical = require('ical.js') as {
      parse: (s: string) => unknown;
      Component: new (jCal: unknown) => {
        getAllSubcomponents: (name: string) => Array<{
          getFirstPropertyValue: (name: string) => unknown;
        }>;
      };
      Event: new (component: unknown) => {
        uid: string;
        summary: string;
        description: string;
        startDate: { toJSDate: () => Date };
        endDate: { toJSDate: () => Date } | null;
        organizer: string | null;
        location: string | null;
        sequence: number;
      };
    };
    const jcal = ical.parse(text);
    const root = new ical.Component(jcal);
    const vevents = root.getAllSubcomponents('vevent');
    const first = vevents[0];
    if (!first) return null;
    const event = new ical.Event(first);
    const rruleValue = first.getFirstPropertyValue('rrule');
    const rrule =
      rruleValue && typeof rruleValue === 'object' && rruleValue !== null
        ? (rruleValue as { toString: () => string }).toString()
        : null;
    const organizer = event.organizer
      ? event.organizer.replace(/^mailto:/i, '').toLowerCase()
      : null;
    return {
      uid: event.uid,
      summary: event.summary,
      description: event.description || null,
      startsAt: event.startDate.toJSDate(),
      endsAt: event.endDate ? event.endDate.toJSDate() : null,
      organizerEmail: organizer,
      location: event.location || null,
      sequence: event.sequence ?? 0,
      rrule,
    };
  } catch {
    return null;
  }
}
