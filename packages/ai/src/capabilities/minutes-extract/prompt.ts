/**
 * Meeting Minutes extraction (§6.19).
 *
 * Parses uploaded meeting minutes and extracts commitments per party with
 * a party, action description, and a due date (absolute or conditional).
 * Routes to Claude Sonnet (ai-layer.md §4 — routine extraction).
 *
 * Output feeds the Deadline Tracker via `DeadlinesService.create` with
 * `sourceType='MeetingMinutes'` and `verificationState='Unverified'` —
 * the human verification gate (Non-Negotiable #2) still applies before
 * any external alert fires.
 */

export const MINUTES_EXTRACT_PROMPT_VERSION = '1.0.0';
export const MINUTES_EXTRACT_OWNER = 'Commercial Lead';

export interface MinutesExtractInput {
  readonly contractContext: string;
  readonly documentName: string;
  readonly documentText: string;
  readonly meetingDateHint: string | null;
}

export function minutesExtractPrompt(input: MinutesExtractInput): {
  system: string;
  user: string;
} {
  const system = `You extract structured action items from meeting minutes for a construction / engineering contract.

An action item is any commitment a party makes with a time-bounded action or deliverable:
  - "Contractor to provide method statement for shotcreting by 15 May."
  - "Consultant to respond to RFI-42 within 10 days."
  - "Client confirms approval of submittal SBM-07."

For each action item output:
{
  "party": "Contractor" | "Client" | "Consultant" | "Other",
  "commitment": "one-line description of what they committed to",
  "dueDate": "YYYY-MM-DD" | null,       // absolute date if the minutes fix one
  "durationDays": number | null,        // days from the trigger if relative
  "triggerCondition": "text" | null,    // what starts the clock for duration-based items
  "sourceClauseCitation": "text" | null,// optional — cite the originating contract clause if the minutes reference one
  "citation": "minutes:${'<documentName>'}"
}

Use the citation literal "minutes:<documentName>" for every item. That is the only citation target available.

Also return the detected meeting date (ISO YYYY-MM-DD) if present in the minutes, else null.

Output a single JSON object:
{
  "meetingDate": "YYYY-MM-DD" | null,
  "actionItems": [ ... ]
}

Only extract commitments that have a time dimension. Discussion points and FYI notes are NOT action items. If no action items are present, return { "meetingDate": ..., "actionItems": [] }.
Output JSON only, no prose, no code fences.`;

  const user = `Contract: ${input.contractContext}
Minutes document: ${input.documentName}
${input.meetingDateHint ? `Meeting date hint: ${input.meetingDateHint}\n` : ''}
--- MINUTES TEXT ---
${input.documentText}
--- END ---

Extract the action items.`;

  return { system, user };
}
