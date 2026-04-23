# contract-summary

**Owner:** Commercial Lead
**Prompt version:** 1.0.0
**Model:** Claude Opus (ai-layer.md §4 — drafting)

Generates the §5.4 cheat sheet from retrieved master-agreement + schedule chunks.

## Human verification gate (Non-Negotiable #2)

The summary is persisted with `verification_state = Unverified` and renders with an `UNVERIFIED` badge. It cannot feed downstream features (deadline tracker, proactive flagging, claim readiness) until a Contract Owner approves it. The contract cannot move from `Onboarding` to `Active` before approval.

## Citation discipline

Every factual field carries a citation to at least one retrieved chunk id. Fields with no source return `null` with no citation — the model is instructed not to guess.
