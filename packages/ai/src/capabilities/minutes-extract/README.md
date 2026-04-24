# minutes-extract

**Owner:** Commercial Lead
**Prompt version:** 1.0.0
**Model:** Claude Sonnet (ai-layer.md §4 — routine extraction)

Parses a MeetingMinutes-category document and extracts structured action
items per party with due date / trigger. The extracted meeting date (if
present in the document) is returned alongside the items.

## Verification gate (Non-Negotiable #2)

Action items become `deadline` rows with:
- `source_type = 'MeetingMinutes'`
- `source_id = <extraction.id>`
- `verification_state = 'Unverified'`

They flow through the existing Deadline Tracker state machine and cannot
raise external alerts until a Contract Owner / Administrator verifies them.

## Citation discipline

The capability uses a closed citation grammar (`minutes:<documentName>`) —
there is no retrieval layer involved, so all citations resolve to the
minutes document itself. The worker persists the extraction id and uses
it as the `deadline.source_id` so the UI can deep-link back.
