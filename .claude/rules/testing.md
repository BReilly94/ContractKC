# Testing — Engineering Rules

## 1. Test Pyramid

- **Unit tests (Vitest):** for every function with business logic. Fast, isolated.
- **Integration tests:** for every capability that crosses a module boundary (DB, queue, external service).
- **E2E tests (Playwright):** for every Phase 1/2 user surface in section 8 of the SOW.
- **AI regression harness:** for every AI capability in `packages/ai/capabilities/`.
- **Load tests:** for the performance targets in SOW section 9.

## 2. Coverage Targets

- `packages/domain/`, `packages/auth/`, `packages/audit/`: **90%+** line coverage.
- `packages/ai/`: regression harness passes at baseline; line coverage less meaningful here.
- `apps/api/`: **80%+** line coverage on route handlers.
- `apps/web/`: E2E coverage of every flow in SOW section 8.

Coverage is enforced in CI. PRs below threshold are blocked.

## 3. What Must Have a Test

- Every Non-Negotiable from SOW section 2 has a dedicated test that would fail if the Non-Negotiable were violated.
- Every 🔒 HUMAN GATE has a test confirming the gate blocks the un-gated path.
- Every lifecycle state machine has tests for every transition — legal transitions succeed, illegal ones are rejected.
- Every authorization path has a test for both the allow case and the deny case.

## 4. What Does Not Need a Test

- Getter/setter boilerplate with no logic.
- Pure framework wiring (routes, module imports).

Everything else needs a test. "Too simple to test" is usually a signal the thing should not exist.

## 5. Test Data

- Fixtures in `tests/fixtures/` — shared, versioned, never generated at runtime.
- No network calls in unit or integration tests — mock at the `LLMClient` boundary for AI calls, mock at the HTTP client for external services.
- Real Azure resources are only touched in pre-production environments, never from CI.

## 6. E2E Test Discipline

- Every Playwright test runs against a seeded database with known state.
- Tests are deterministic — no sleeps, no race-prone waits. Use Playwright's auto-wait.
- Failing E2E tests in CI block merge. No "flaky test" labels that quietly disable.

## 7. Regression Harness Rules

See `.claude/rules/ai-layer.md` section 7.

## 8. Performance Test Gates

Performance targets from SOW section 9 are CI-gated. The performance test suite runs nightly against a staging environment with representative data volume. Regressions open an issue automatically and block the next release.
