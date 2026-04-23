# email-prescreen

**Owner:** Commercial Lead
**Prompt version:** 1.0.0
**Model:** Claude Sonnet (ai-layer.md §4 — routine classification)

Classifies inbound email for privileged / HR-sensitive / commercially-sensitive content before indexing. Privileged content routes to restricted-access tier; uncertain results go to the review queue.

## Output contract

```json
{
  "privileged": true,
  "category": "Privileged",
  "confidence": "medium",
  "reasoning": "Email references 'attorney-client' in context of a contract dispute."
}
```

## Known limitations

- Bounded-context: only the first ~8KB of body is sent. Long emails may bury signals past the window. Mitigation: the worker also enqueues privileged-check against the email subject + first-paragraph headers.
- English-only currently. Multi-language lands with Q-004.
