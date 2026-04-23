# Review Gates — What Requires Human Sign-Off

Claude Code can self-certify most unit-of-work completion. The items below require explicit human review. Do not self-approve.

## 1. Business-Logic Human Gates (🔒 in the SOW)

These are explicit gates the SOW defines and that the product depends on. They must be enforced in code **and** honored in the review process.

| Gate | SOW ref | What it blocks |
|---|---|---|
| Contract Owner approves contract summary | 5.4 | Contract moves from `Onboarding` to `Active` |
| Human verifies extracted deadlines | 5.5 | Deadline fires external alerts |
| Human verifies meeting minute action items | 6.19 | Action items feed deadline tracker |
| Commercial Lead override on Claim Readiness Score | 6.13 | Claim moves to `Submitted` below threshold |
| Contract Owner approves closeout checklist exceptions | 6.21 | Contract moves to `Archived` |

For each: the gate is tested (see `.claude/rules/testing.md` section 3). A PR that weakens or removes a gate requires an explicit SOW amendment linked in the PR description.

## 2. Engineering PR Review Gates

Any PR that touches the following areas requires a named human reviewer before merge:

1. **Audit log** — any change to the append-only logic, the hash chain, or the export path.
2. **Authorization** — any change to per-contract access, individual revocation, or role resolution.
3. **Prompt templates** — any change to a prompt in `packages/ai/capabilities/*/prompt.ts`.
4. **Model routing** — any change to `packages/ai/routing.ts`.
5. **Non-Negotiables** — any change to code that implements a Non-Negotiable from SOW section 2.
6. **Engineering rules** — any change to `.claude/rules/*.md`.
7. **Database schema** — any migration.
8. **Infrastructure** — any change under `infra/`.
9. **Encryption, secrets, key material** — any change to how any of these are handled.
10. **Data portability export format** — any change to what 5.13 produces.

## 3. Pre-Production Gates

Before any deploy to production:

1. Runbook exists and is current for the unit of work.
2. Observability complete — logs, metrics, traces, dashboarded.
3. Load test executed against performance targets (SOW section 9).
4. Dependency audit clean.
5. For AI-touching changes: regression harness green, spot-audit performed on 20 sample responses.
6. Rollback plan documented.

## 4. Release Gates

1. Pre-launch penetration test (before Phase 1 go-live and annually).
2. Data residency confirmation (Azure Canada Central + Canada East).
3. Azure AD / Entra ID cutover plan (or AD FS fallback ready).
4. Pilot contract selected and loaded with representative data.
5. Training materials ready for the relevant persona set (see SOW 11.5).
6. Legal sign-off on evidentiary protocol (SOW 12.27).

## 5. What Claude Code Can Self-Certify

- Unit test passing for a new function.
- Refactoring with no behavior change and tests unchanged.
- Documentation updates (except `.claude/rules/` which require review).
- Dependency version bumps where the regression suite and dependency audit pass.
- New UI components added to `packages/ui-kit/` that pass accessibility lint.

When in doubt: route to human review. The cost of a false-positive review request is a minute of someone's time. The cost of a false-negative on an authorization bug is an audit finding or worse.
