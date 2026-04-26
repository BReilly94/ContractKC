# UI — Engineering Rules

## 1. Design System

All UI is built from `packages/ui-kit/`. No ad-hoc Tailwind classes in feature code beyond layout utilities.

TKC design tokens (colors, spacing, typography) live in `packages/ui-kit/tokens.ts` and are the single source of truth. The token file is shared with other TKC applications.

If `packages/ui-kit/` is missing a component the feature needs, propose the addition to `ui-kit` in the PR rather than inlining a one-off. The ui-kit is the force multiplier; inline components quietly fork it.

## 2. Accessibility — WCAG 2.1 AA

- All interactive elements have accessible names.
- Color is never the only signal (status, error, confidence) — always accompanied by icon or text.
- Focus order matches visual order.
- All flows are keyboard-navigable.
- Form errors are announced to screen readers.

Accessibility is linted in CI (`eslint-plugin-jsx-a11y`) and spot-audited in E2E tests (`@axe-core/playwright`).

## 3. Mobile-Responsive

Every Phase 1 and Phase 2 surface is mobile-responsive — site supervisors work from phones and tablets.

**Mobile-first for:**
- Daily site diary (6.6)
- Contract dashboard
- Notice & deadline tracker (viewing — alert triage on phone is common)
- Query interface (field staff ask questions from site)

Test breakpoints: 360px, 768px, 1024px, 1440px.

## 4. AI Output Affordances

Every AI-generated output has three visible affordances:
1. **Inline citations** — clickable, scroll to source with highlight.
2. **Confidence indicator** — high / medium / low / insufficient context. Color + text, never color alone.
3. **Feedback** — thumbs up/down with optional comment.

Unverified AI-extracted content (summary, deadlines) carries a visible `UNVERIFIED` badge. The badge is not removable by UI state — only by the human verification action.

## 5. Three-Click Rule (SOW 4.8)

Maximum three clicks from the contract dashboard to any core Phase 1 or Phase 2 function. If a new feature pushes something past three clicks, restructure the navigation, don't bury the feature.

## 6. No Browser Storage of Contract Content (Non-Negotiable #7)

No `localStorage`, `sessionStorage`, or `IndexedDB` for contract content. Exception: offline diary drafts (6.6), which are the only permitted local persistence and are handled through a dedicated sync service, not ad-hoc browser storage.

Session state is in-memory only (React state, Zustand). Server is the source of truth.

## 7. Empty States

Every list view has an empty state that is not just "No results." It explains what the list would contain, why it might be empty, and what action (if any) the user can take.

## 8. Loading States

Every async operation has a loading state. Skeleton UIs preferred over spinners for any operation over 400ms.

## 9. Error Handling

- User-facing error messages contain no internal state (stack traces, query text, internal IDs).
- Every error surface has a recovery path — retry, contact support, or an alternative action.
- Errors are logged with correlation ID so support can trace the incident.

## 10. Document Viewer Rules

- Citations open the document at the exact clause/page with visible highlight.
- Version chain visible from the document header.
- Superseded versions are accessible but clearly flagged with a `SUPERSEDED` badge.

## 11. Logo Usage (Technica Brand Guidelines 2023)

The Technica Mining logo is rendered only through `<Logo>` from `@ckb/ui-kit`.
Never inline an `<img>` pointing at a brand asset, never hand-roll the SVG in
feature code.

- **Variants:** `horizontal` | `vertical` | `mark`. Orientation is a layout
  choice — pick the one that fits the allocated space.
- **Tones:** `black` | `white` | `gray`. Gray is secondary only. Never apply
  gradients, effects, or any other color.
- **Wordmark rule:** the "Technica Mining" wordmark is never shown without
  the mark. Use `variant="horizontal"` or `variant="vertical"` — do not
  render the wordmark text separately.
- **Minimum rendered widths:** 180px (horizontal) / 130px (vertical) /
  42px (mark). The component warns below these in development.
- **Clear space:** equal to the mark's inner-circle diameter. The component
  applies this as padding automatically. Do not override it with negative
  margins or tighter containers.
- **Product labelling:** when a product name needs to sit beside the logo
  (e.g. "Contract Knowledge Base" in the app bar), render it as a sibling
  element with a visible divider, outside the logo's clear-space. Never
  overlay, composite, or re-letter the wordmark itself.
- **Do not** alter, skew, rotate, recolour, re-letter, or re-arrange the mark
  or wordmark. Do not use previous versions. If the current asset looks
  wrong, escalate to brand — don't edit it in code.

The inline SVG in `Logo.tsx` is a **placeholder** pending delivery of the
official vector artwork. See `apps/web/public/README.md` for the swap
procedure.

## 12. Redaction Display

- Redacted passages show a visible redaction marker (not just blanked space).
- User without clearance sees the marker but not the content, and is not told the content is secret in a way that implies its nature.
- Authorized redactors can toggle between the redacted and original views with a visible indicator of which view is active.
