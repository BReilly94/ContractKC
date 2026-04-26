# CKB UI/UX Design Brief
**Version:** 1.0 — 2026-04-24
**Owner:** Brian Reilly
**Status:** Active — use this brief to guide every UI/UX session and component build.

---

## How to Use This Document

Paste the relevant sections as context at the start of any Claude Code session where you are designing or building UI. The brief is structured so you can either use the whole thing or pull individual sections (e.g., just "AI UX Patterns" when working on the query interface).

**The goal:** CKB must be the best commercial-contract management UI in the construction industry — better than Procore, Aconex, InEight, or Trimble ProjectSight. The AI layer is the differentiator; the design must make that differentiator feel trustworthy, decisive, and daily-useful to a PM under pressure.

---

## 1. Design Philosophy

### 1.1 Three Governing Principles

**1. Authoritative Precision.**
This is an evidence-based commercial-defence tool. Every surface should feel like a well-designed Bloomberg terminal or a tier-1 legal platform — dense, accurate, and trustworthy. Not playful. Not consumer. Users are making decisions that affect multi-million-dollar contracts; the UI must earn their confidence.

**2. AI as Augmentation, Not Oracle.**
The AI layer enhances human judgment — it does not replace it. Every AI output must visibly carry its evidence trail (citations), its confidence level, and a clear path for the human to verify, override, or reject it. The UNVERIFIED state is a first-class design element, not an afterthought badge. Users should feel in control, not delegated to.

**3. Calm Urgency.**
Construction projects are chaotic. CKB must feel organised and reassuring even when surfacing critical items (overdue deadlines, unverified claims, proactive flags). Surface urgency through structure and hierarchy — not alarm-red everywhere. Reserve red for genuine blockers; use amber for warnings; use the status system deliberately.

### 1.2 Competitive Benchmark

| Competitor | What they do well | Where CKB must exceed |
|---|---|---|
| Procore | Clean card-based UI, good mobile | AI integration is bolted-on; no citation/verification UX |
| Aconex | Powerful document control | Dense and dated; poor mobile; no AI layer |
| InEight | Modern dashboards | Shallow contract intelligence; no evidence packaging |
| Fieldwire | Excellent mobile-first | Field-task focused; no commercial-defence depth |
| Trimble ProjectSight | Solid doc management | No AI; poor claim/variation workflows |

CKB's advantages to make visible: AI citations + verification gates, evidence packaging, claim readiness scoring, proactive flags, contemporaneous record locking. These are the features that justify the switch — the UX must surface them prominently.

### 1.3 Emotional Tone by Persona

| Persona | Context | Desired feeling |
|---|---|---|
| PM | Office — detailed contract review | Comprehensive, nothing missed |
| Commercial Lead | Deadline-driven, claim prep | Fast answers, evidence at hand |
| Site Supervisor | Mobile, field conditions | Quick, readable, one-thumb operable |
| Auditor | Read-only review | Clear chain of custody, nothing ambiguous |

---

## 2. Visual Design System

### 2.1 Color System (Build on Existing Tokens)

The Technica brand palette is fixed. Build a semantic layer on top of it:

**Primary palette** (from `tokens.ts` — do not alter):
- Pitch Black `#000000` — primary text, headers
- Technica Gold `#877232` — primary brand action, active states
- Light Gold `#DECA8C` — accent on dark surfaces
- Platinum `#CCCCCC` — borders, dividers
- Pure White `#FFFFFF` — backgrounds

**Extend the token set with semantic roles** (propose additions to `tokens.ts`):

```typescript
// Proposed semantic color extensions
surface: {
  base: '#FFFFFF',         // page background
  raised: '#F9F8F6',       // card / panel (warm white, not cold grey)
  overlay: '#F3F1EC',      // nested card, code blocks
  dark: '#111111',         // dark panels, sidebar on large screens
  darkRaised: '#1C1C1C',   // dark card
},
status: {
  // Use these roles, never raw danger/warning/success for status chips
  active: { bg: '#ECFDF5', text: '#065F46', border: '#A7F3D0' },
  onboarding: { bg: '#EFF6FF', text: '#1E40AF', border: '#BFDBFE' },
  suspended: { bg: '#FEF3C7', text: '#92400E', border: '#FDE68A' },
  closed: { bg: '#F3F4F6', text: '#374151', border: '#D1D5DB' },
  archived: { bg: '#F5F3FF', text: '#4C1D95', border: '#DDD6FE' },
},
ai: {
  // AI-specific affordances — distinct from generic status
  unverified: { bg: '#FFFBEB', text: '#92400E', border: '#F59E0B' },
  verified: { bg: '#F0FDF4', text: '#166534', border: '#4ADE80' },
  citation: { bg: '#EFF6FF', text: '#1D4ED8', border: '#93C5FD' },
  confidenceHigh: '#059669',
  confidenceMedium: '#D97706',
  confidenceLow: '#DC2626',
  insufficientContext: '#6B7280',
},
risk: {
  critical: { bg: '#FEF2F2', text: '#991B1B', border: '#FCA5A5' },
  high: { bg: '#FFF7ED', text: '#9A3412', border: '#FDBA74' },
  medium: { bg: '#FFFBEB', text: '#92400E', border: '#FDE68A' },
  low: { bg: '#F0FDF4', text: '#166534', border: '#86EFAC' },
},
```

**Tones to use:**
- Light mode first (office use). Dark mode in Phase 3 — do not anticipate it in component code yet, but use CSS custom properties so the switch is a variable swap, not a component rewrite.
- Never create custom named colors in feature code — extend `tokens.ts` and use the token.

### 2.2 Typography

Add a dedicated type scale to `tokens.ts`. The system font stack is fine; do not load a web font.

```typescript
type: {
  // Headings: use font-weight 600+ (semibold), tight tracking
  display:  { size: '1.875rem', weight: 600, lineHeight: '2.25rem', tracking: '-0.02em' },  // page title
  h1:       { size: '1.5rem',   weight: 600, lineHeight: '2rem',    tracking: '-0.01em' },  // section title
  h2:       { size: '1.25rem',  weight: 600, lineHeight: '1.75rem', tracking: '-0.01em' },
  h3:       { size: '1.125rem', weight: 600, lineHeight: '1.75rem', tracking: '0' },
  h4:       { size: '1rem',     weight: 600, lineHeight: '1.5rem',  tracking: '0' },

  // Body
  bodyLg:   { size: '1rem',     weight: 400, lineHeight: '1.625rem' },
  body:     { size: '0.9375rem', weight: 400, lineHeight: '1.5rem' }, // 15px — slightly tighter than browser default
  bodySm:   { size: '0.875rem', weight: 400, lineHeight: '1.375rem' },

  // UI chrome (labels, badges, table headers, metadata)
  label:    { size: '0.75rem',  weight: 500, lineHeight: '1rem',    tracking: '0.04em', textTransform: 'uppercase' as const },
  code:     { fontFamily: '"Cascadia Code", "Fira Code", "Consolas", monospace', size: '0.875rem' },
},
```

Rule: never set `font-size` inline in feature code. Use the type scale via Tailwind utility classes that map to these tokens, or via a `<Text>` component in ui-kit.

### 2.3 Spacing and Grid

Use an 8px base unit throughout. The existing space scale (4, 8, 12, 16, 24, 32) is correct — add 40, 48, 64 for larger gaps:

```
4  → tight inline gap (icon + label)
8  → compact list item padding
12 → form field internal padding
16 → card internal padding (default)
24 → card gap, section spacing
32 → page section gap
48 → large section break
```

**Page grid:**
- Desktop (1440px+): 12-column grid, 24px gutters, max-width 1440px centered
- Tablet (768–1023px): 8-column grid
- Mobile (<768px): 4-column grid, 16px gutters

**Sidebar layout (desktop):**
- Fixed left nav: 240px wide, collapses to 64px icon-only rail on 1024px breakpoint
- Content area fills remaining space
- Right panel (document viewer, detail drawers): 420px, slides in over content

### 2.4 Elevation and Depth

```
0 — flat surface (page background)
1 — card (subtle border, no shadow): border: 1px solid var(--color-border)
2 — raised panel (soft shadow): box-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)
3 — floating element (dropdown, tooltip): box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.06)
4 — modal/dialog: box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.05)
```

### 2.5 Border Radius

```
sm: 4px   → badges, chips, small UI elements
md: 6px   → form fields, buttons
lg: 8px   → cards, panels
xl: 12px  → modal dialogs, large cards
full: 9999px → pill badges, avatar circles
```

---

## 3. Component Library — Standards

All components live in `packages/ui-kit/src/`. This section describes the components that must exist and their design spec. Build from here, not from feature code.

### 3.1 Navigation

**AppShell** — wraps every authenticated page:
- Left sidebar: logo (mark only on collapsed, horizontal on expanded), nav items with icon + label
- Top bar (mobile only): hamburger + page title + quick actions
- Nav items: icon (24px), label (type.bodySm, weight 500), active state uses a left border accent in Technica Gold + light gold tint background
- Section groupings with small uppercase labels (type.label)

**Nav item groups (desktop sidebar):**
```
[Overview]        — contract list / dashboard
─── Active contracts
─── Onboarding
─── Archived

[AI Assistant]    — query interface
[Deadlines]       — all-contracts deadline view
[Claims]          — claim register
[Correspondence]  — email + outbound
[Diary]           — site diary
─────────────────
[Admin]           — gear icon, only for Admin role
[Audit Log]       — padlock icon, only for Auditor role
```

### 3.2 Cards

**BaseCard** props: `elevated?: boolean`, `interactive?: boolean`, `padded?: boolean`

Interactive cards show a subtle Technica Gold left border + light background shift on hover. Never use heavy drop-shadows for hover — keep it subtle.

**Stat card** — for dashboard KPIs:
```
┌─────────────────────────────┐
│ LABEL (type.label)          │
│ 42      ↑ 3 this week       │
│ (display) (bodySm, muted)   │
└─────────────────────────────┘
```

**ContractCard** — for the contract list:
```
┌─────────────────────────────────────────────────┐
│ [StatusChip]  CONTRACT NAME (h3)        [Value] │
│ Client · PM name · Term dates           [Flags] │
│ [DeadlineChip if overdue] [AIFlagChip]          │
└─────────────────────────────────────────────────┘
```

### 3.3 Status Chips / Badges

**StatusChip** — uses the `status.*` color set from §2.1. Never use inline color styles.

```tsx
<StatusChip status="active" />           // Active
<StatusChip status="onboarding" />       // Onboarding
<StatusChip status="suspended" />        // Suspended
```

**VerificationBadge** — for AI-extracted content:

```tsx
<VerificationBadge state="unverified" />  // amber, "UNVERIFIED" text + warning icon
<VerificationBadge state="verified" />    // green, "VERIFIED" text + checkmark
```

Rules:
- The UNVERIFIED badge is never hidden by CSS. It is removed only when the verification action completes.
- Size: compact inline version (for inline use next to a value) + block version (for top of a panel).

### 3.4 AI Output Components

These are the components that differentiate CKB from every competitor. Build them with exceptional care.

**CitationInline** — rendered inline within AI-generated text:
```
...the extension period is 14 days [¹] from the...
```
- Superscript number in Technica Gold
- On hover: tooltip showing document title, page/clause reference
- On click: opens document viewer at that exact location with highlight

**CitationList** — rendered at the bottom of any AI response:
```
Sources
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[1] Contract Agreement v3.pdf, §14.2 (page 31)
[2] Variation #4 — Approved, Attachment B
[3] Email: 2025-11-03, Subject: RE: Extension request
```
Each line is a button that opens the document viewer at the cited location.

**ConfidenceIndicator** — shown on every AI response:
```tsx
<ConfidenceIndicator level="high" />    // green dot + "High confidence"
<ConfidenceIndicator level="medium" />  // amber dot + "Medium confidence"
<ConfidenceIndicator level="low" />     // red dot + "Low confidence"
<ConfidenceIndicator level="insufficient_context" />  // grey dot + "Insufficient context"
```
Always text + color — never color alone (accessibility rule).

**AIResponseCard** — wraps any AI-synthesised response:
```
┌──────────────────────────────────────────────────────┐
│ [ConfidenceIndicator]             [👍] [👎] [⋯ more] │
│                                                      │
│ Response text with inline [¹] citations...          │
│                                                      │
│ ──────────────────────────────────────────────────── │
│ Sources                                              │
│ [CitationList]                                       │
│                                                      │
│ [VerificationBadge state="unverified"] if applicable │
└──────────────────────────────────────────────────────┘
```

**FlagCard** — for proactive AI flags:
```
┌────────────────────────────────────────────────────┐
│ ⚑ PROACTIVE FLAG           [Dismiss] [View source] │
│ RISK LEVEL: [high]                                 │
│                                                    │
│ Clause 14.3 imposes a 7-day notice window [¹]...  │
│ Deadline: 2026-05-12 (18 days)                     │
│ ──────────────────────────────────────────────────  │
│ [Snooze 7d] [Add to Deadlines] [Create diary entry]│
└────────────────────────────────────────────────────┘
```

### 3.5 Data Tables

All tables use a shared **DataTable** component from ui-kit.

Design rules:
- Header row: `type.label` (uppercase, 12px, medium weight), border-bottom 2px solid Technica Gold
- Row height: 48px default; 40px compact mode
- Alternating row background: `surface.raised` / white — subtle, not striped aggressively
- Row hover: `surface.overlay` with Technica Gold left border (4px)
- Sticky header on scroll
- Sortable columns show ↑↓ chevrons; active sort shows active color
- Selection checkboxes on left (for bulk actions)
- Action menu (⋯) on right of each row, appears on hover

Empty state: centered in the table area, icon + headline + subtext + primary action button.

### 3.6 Forms

**FormField** wrapper:
- Label: `type.label`, above the input
- Input: 40px height, 12px horizontal padding, `radius.md`
- Helper text: `type.bodySm`, `color.textMuted`, below input
- Error state: red border + error text + error icon — never just color change
- Required indicator: asterisk after label, `color.danger`

**FieldGroup** — for related fields (e.g., contract dates):
- Groups fields with a shared section label
- Displays as a 2-column grid on desktop, stacked on mobile

### 3.7 Drawer / Side Panel

Used for: document viewer, email thread detail, claim detail, variation detail.

- Slides in from the right, overlays content (does not push)
- Width: 480px default; 720px for document viewer; 960px for split document+query view
- Header: title + close button (top right) + breadcrumb if nested
- Body: scrollable independently
- Footer: primary action + secondary action (sticky to bottom)
- Overlay: semi-transparent backdrop on mobile; none on desktop (visible side-by-side)

### 3.8 Modals / Dialogs

Use for: confirmations, short forms, verification gates.
- Max width: 480px
- Always has a header (title) and a footer (primary + cancel)
- Destructive confirmations: primary button uses `color.danger`, label is specific ("Delete variation", not just "Confirm")
- Verification gate dialogs (human gate moments): include the item being verified + a summary of what changes as a result

---

## 4. Key Surface Designs

### 4.1 Contract Dashboard (Contracts List)

The landing page after login. This is the most-visited surface.

**Layout:**
```
┌─────────────────────────────────────────────────────────────────┐
│ [AppShell sidebar]  │  My Contracts                        [+ New contract] │
│                     │  ──────────────────────────────────────────────────── │
│                     │  [SearchBar]  [Filter: Status ▾] [Filter: PM ▾] [↓ Export] │
│                     │                                              │
│                     │  ┌─ Requires attention (3) ─────────────────┐ │
│                     │  │ [ContractCard — overdue deadline] [ContractCard — unverified AI] │
│                     │  └────────────────────────────────────────── ┘ │
│                     │                                              │
│                     │  ┌─ Active (12) ───────────────────────────┐ │
│                     │  │ [ContractCard grid or table toggle]      │ │
│                     │  └────────────────────────────────────────── ┘ │
│                     │                                              │
│                     │  ┌─ Onboarding (2) ────────────────────────┐ │
│                     │  └────────────────────────────────────────── ┘ │
└─────────────────────────────────────────────────────────────────┘
```

Design decisions:
- "Requires attention" section surfaces contracts with overdue deadlines, unverified AI items, or proactive flags. Deliberately prominent — appears before the alphabetical list.
- Toggle between card grid (quick scan) and table view (sortable columns) persists in user preference (Zustand, in-memory).
- Search is always visible (not collapsed). Contract management is a high-search workflow.

### 4.2 Contract Detail Page

The primary workspace. Replaces the current tab layout with a structured sidebar model.

**Layout (desktop):**
```
┌──────────┬─────────────────────────────────────────────────────┐
│ App nav  │ CONTRACT NAME                    [Status] [Actions ▾]│
│          │ Client · PM · $2.4M · 2024-03-01 → 2026-12-31       │
│          │ ─────────────────────────────────────────────────────│
│          │ [Left content nav]  │  [Panel content]               │
│          │                     │                               │
│          │  Overview           │  (panel renders here)         │
│          │  AI Query           │                               │
│          │  Documents          │                               │
│          │  Emails             │                               │
│          │  Deadlines          │                               │
│          │  ── Commercial ──   │                               │
│          │  Variations         │                               │
│          │  Claims             │                               │
│          │  Payments           │                               │
│          │  ── Records ──      │                               │
│          │  Site Diary         │                               │
│          │  Meeting Minutes    │                               │
│          │  Submittals         │                               │
│          │  ── Risk ──         │                               │
│          │  Risk Register      │                               │
│          │  Proactive Flags    │                               │
│          │  ── Contacts ──     │                               │
│          │  Directory          │                               │
│          │  ── Admin ──        │                               │
│          │  Review Queue       │                               │
└──────────┴─────────────────────────────────────────────────────┘
```

The left content nav is fixed within the contract workspace. Active section highlighted with Technica Gold left border.

**Mobile layout:** full-screen page with a bottom sheet drawer that expands into the content nav.

### 4.3 AI Query Interface

This is the UI that justifies the product's existence. Build it with exceptional care.

```
┌──────────────────────────────────────────────────────────────┐
│ Ask a question about this contract                           │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ e.g. "What is the notice period for scope changes?"      │ │
│ │                                              [Ask →]     │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ ── Previous questions ─────────────────────────────────────  │
│                                                              │
│ [AIResponseCard]                                             │
│   "The notice period is 14 days from the event giving rise  │
│   to the claim [¹][²]. This applies to both scope additions │
│   and omissions per clause 14.3 [³]."                       │
│   [Confidence: High] [👍] [👎]                               │
│   Sources: [CitationList]                                    │
│                                                              │
│ [AIResponseCard — insufficient context]                      │
│   "I could not find a specific provision for force majeure   │
│   notifications. [Suggest uploading the correspondence...]"  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

Design rules for the query interface:
- Query input is prominent — full width, autofocus on tab entry, minimum 56px height
- Suggested queries shown as chips below the empty input (e.g., "What are the payment terms?" / "List all notice periods" / "Summarise variation obligations")
- Each response card is persistent in the session — scroll to review history
- "Insufficient context" responses show a constructive message: what's missing and what action to take (e.g., upload a document, check a specific email thread)
- Streaming responses: show the text appearing token-by-token with a pulsing cursor; citation markers appear as the response builds
- Loading state: skeleton at the card level, not a full-page spinner

### 4.4 Document Viewer

Split-pane layout: document on left, metadata/AI sidebar on right.

```
┌──────────────────────────────────┬──────────────────────────┐
│ DOCUMENT TITLE      v3 [↓] [⋯]  │ Document info            │
│ [SUPERSEDED] badge if applicable │ Type: Contract Agreement  │
│ ───────────────────────────────  │ Uploaded: 2024-03-01      │
│                                  │ SHA-256: [truncated]      │
│   [PDF render / text view]       │ OCR: Complete             │
│                                  │ ─────────────────────────│
│   Lorem ipsum clause 14.3...     │ Clauses (7)              │
│   ██████████████ [HIGHLIGHT]     │ [ClauseChip × 7]         │
│   extension period is 14 days...  │ ─────────────────────────│
│                                  │ Referenced in             │
│                                  │ [2 queries] [1 flag]     │
│                                  │ ─────────────────────────│
│                                  │ Version history           │
│                                  │ v3 (current)              │
│                                  │ v2 — 2024-06-15           │
│                                  │ v1 — 2024-03-01           │
└──────────────────────────────────┴──────────────────────────┘
```

### 4.5 Deadlines Panel

Deadline management is high-stakes. The visual design must communicate urgency tiers clearly.

```
┌─ Deadlines ──────────────────────────────────────────────────┐
│ [Filter: All | Overdue | This week | This month | Verified]  │
│                                                              │
│ ⚠ OVERDUE (2)                                               │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ [!] Notice to Owner — Scope Change   2 days overdue     │ │
│ │     Contract: Technica Phase 2A                         │ │
│ │     [UNVERIFIED]   Source: AI extract from §14.3        │ │
│ │     [Mark sent] [Verify] [Edit]                         │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                              │
│ THIS WEEK (3)                                               │
│ ...                                                          │
│                                                              │
│ UPCOMING (8)                                                │
│ [DataTable — sortable by date, status, contract]            │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

Key rules:
- Overdue items in a red-tinted card, always at top
- UNVERIFIED badge on every AI-extracted deadline until human verifies
- "Verify" action is prominent — not buried in a menu
- Days overdue shown in plain language ("2 days overdue"), not just a date

### 4.6 Claim Workspace

The most complex surface. Commercial lead builds their case here.

- Three-column layout (desktop): left = evidence list, centre = draft, right = citation/source viewer
- Claim readiness score (§6.13) shown as a prominent gauge at the top of the panel, with breakdown
- Evidence items shown with their chain-of-custody status
- AI drafting suggestions appear inline in the draft (like GitHub Copilot suggestions — accept or dismiss)
- Redacted passages clearly marked in the evidence viewer

### 4.7 Site Diary (Mobile-first)

- Large touch targets (minimum 44px)
- Quick-capture at top: voice note placeholder (future) + text entry
- Time-stamped entries in a timeline layout
- Lock state clearly shown: open entries have a subtle edit affordance; locked entries show a padlock icon and the lock timestamp
- Offline draft clearly indicated with a cloud-sync icon + "Draft — not yet synced"

---

## 5. Interaction Patterns

### 5.1 Navigation

- App-level navigation in left sidebar (desktop) / bottom tab bar (mobile, 5 items max)
- Within-contract navigation in a secondary left nav (desktop) / top tab rail (mobile)
- No nested dropdowns — flatten navigation to two levels max
- Breadcrumbs on deep pages (e.g., document viewer, claim workspace)
- Back button is always a labeled link ("← Back to Documents"), never just a chevron

### 5.2 Progressive Disclosure

- Card surfaces show a summary; detail on demand via drill-in or drawer
- AI responses show a one-paragraph summary with "View full response + sources" expansion
- Long document lists paginate (25 per page) with next/previous; search replaces browsing
- Advanced filters collapsed by default; "Show filters" expands them
- Metadata (SHA-256, vector namespace, internal IDs) hidden by default; accessible via a "Technical details" toggle

### 5.3 Actions

**Primary action:** single prominent button per panel. Never two primary buttons.
**Destructive actions:** always require confirmation dialog with specific language.
**Async actions:** button shows loading state (spinner + disabled) during execution; on success, a toast notification; on failure, inline error near the action.

**Toast notifications (top-right, auto-dismiss 4s):**
- Success: green, "Contract activated"
- Warning: amber, "Deadline added — verify before alerts fire"
- Error: red, "Save failed — [retry]" (persistent until dismissed)
- Info: blue, "3 new proactive flags since last visit"

### 5.4 Keyboard Navigation

- `/` opens the global search from anywhere
- `?` opens keyboard shortcuts reference
- `Tab` / `Shift+Tab` navigates interactive elements in document order
- Arrow keys navigate within data tables
- `Esc` closes drawers, modals, and tooltips
- `Enter` submits focused forms
- Document viewer: `j` / `k` navigate between highlighted citations

### 5.5 Motion and Animation

- Transitions: 150ms ease-out for state changes (badge swaps, hover states)
- Drawer open/close: 200ms ease-out cubic-bezier(0.16, 1, 0.3, 1) (spring-like)
- Modal open: 200ms scale(0.97) + opacity
- Skeleton loading: 1.5s shimmer pulse
- No animation if `prefers-reduced-motion` is set — respect it unconditionally
- Never animate content that the user is reading (layout shifts, expanding text)

---

## 6. AI UX — Detailed Patterns

This section is critical — it's where CKB wins or loses against competitors.

### 6.1 Citation Grammar

Citations use numbered superscripts `[¹]` in response text, linked to a source list below the response. Rules:

- Superscript numbers are rendered in Technica Gold to be visually distinct from body text
- Numbers are tappable on mobile (not just hoverable on desktop)
- The citation list is always visible below the response — not collapsed. Citations are the product, not an appendix.
- If the same source is cited twice, the same number is reused
- Citations are sorted in order of first appearance

### 6.2 Streaming Responses

AI responses stream token by token. Design for this state:
- A pulsing cursor (the blinking text cursor, not a spinner) appears at the end of the generating text
- Citation markers appear inline as they are generated — they anchor to the source list which starts building simultaneously
- The user can read the response as it streams; they should not feel like they are waiting
- "Generating…" label appears in the ConfidenceIndicator slot until the response is complete

### 6.3 Insufficient Context Response

When the AI cannot answer with sufficient evidence:
```
┌──────────────────────────────────────────────────────────────┐
│ [ConfidenceIndicator: Insufficient context]                  │
│                                                              │
│ I could not find a specific provision about force majeure    │
│ notifications in the indexed documents for this contract.    │
│                                                              │
│ To answer this question:                                     │
│ • Upload the Special Conditions document (not yet indexed)   │
│ • Check the email thread from 2025-09-14 re: project setup   │
│                                                              │
│ [Upload document] [Browse emails]                            │
└──────────────────────────────────────────────────────────────┘
```

Never return a blank or generic "I don't know." Always give a constructive path forward.

### 6.4 Verification Gate UX

When AI-extracted content requires human verification (deadlines, contract summary):

1. The content renders immediately with the UNVERIFIED badge
2. A persistent banner at the top of the panel: "This [deadline/summary] was extracted by AI and has not been verified. Verify it now to enable downstream alerts."
3. The "Verify" action opens a modal showing:
   - The extracted value
   - The source citation
   - A confirm button ("Confirm — this is accurate") and an edit-and-confirm path ("Edit before confirming")
4. Once verified: badge switches to VERIFIED (green), banner dismisses, downstream features unlock
5. The verification event is recorded in the audit log with the verifying user's identity and timestamp

### 6.5 Proactive Flag Presentation

Flags appear in two places: a dedicated "Proactive Flags" section within the contract, and a badge count on the contract card on the dashboard.

Flag cards follow the FlagCard design in §3.4. Additional rules:
- Flags show their age ("Flagged 3 days ago") — stale flags lose urgency context
- Dismissed flags are accessible in a "Dismissed" filter — nothing is lost
- "Add to Deadlines" action pre-populates a deadline from the flag's detected date
- Deep-review flags (Opus tier) are visually distinct from first-pass flags (Sonnet tier) — use a subtle "Deep review" label

### 6.6 Feedback Loop

Every AI response has thumbs up/down. Rules:
- Thumbs down opens a compact feedback form: dropdown reason (Wrong answer / Missing citation / Outdated information / Other) + optional free text
- Feedback is stored against the capability, model version, and prompt template version — not just as anonymous noise
- Positive feedback is recorded too (thumbs up with no required form) — it's the regression signal that the current capability is working

---

## 7. Empty States

Every list and panel must have a designed empty state. Structure:

```
[Illustration or icon — relevant to the section]
[Headline — what this section is for]
[Subtext — why it's empty / what to do]
[Primary action button — the obvious next step]
```

Examples:

| Surface | Headline | Subtext | Action |
|---|---|---|---|
| Documents | No documents yet | Upload the contract and supporting documents to start extracting clauses and deadlines. | Upload document |
| Deadlines | No deadlines tracked | AI will extract deadlines when documents are indexed. You can also add them manually. | Add deadline |
| AI Query (first use) | Ask your first question | This contract's documents are indexed and ready. Ask about payment terms, notice periods, scope, or anything else. | (show suggested queries) |
| Proactive Flags | No flags at this time | The AI scans for risks and obligation windows. Come back after new documents or emails are added. | View last scan |
| Claims | No claims yet | When a claim scenario arises, create a claim workspace to consolidate evidence, draft notices, and track readiness. | Create claim |
| Site Diary | No diary entries | Site supervisors can log daily observations from mobile. Entries are time-stamped and locked at end of next business day. | Add today's entry |

---

## 8. Error States

### 8.1 API Errors

Never show: stack traces, error codes, SQL errors, internal field names.
Always show: what went wrong (in plain language), whether it's transient, what to do.

```
┌──────────────────────────────────────────────────┐
│ ⚠  Unable to load deadlines                     │
│ This may be a temporary network issue.           │
│ [Try again]   [Contact support]                  │
└──────────────────────────────────────────────────┘
```

### 8.2 AI Errors

If citation verification fails, show:
```
┌──────────────────────────────────────────────────┐
│ ✗  Response withheld                            │
│ The AI response could not be verified against   │
│ the source documents. This has been logged.     │
│ [Try again]   [Report issue]                    │
└──────────────────────────────────────────────────┘
```

### 8.3 Form Validation

- Inline, immediately on blur (not on submit)
- Error text appears below the field with a ✗ icon
- Error text is red, specific ("Date must be after contract start date"), not generic ("Invalid input")
- On submit, scroll to first error and set focus

---

## 9. Implementation Guidance for Claude Code

When implementing any UI component or page using this brief:

1. **Start from tokens.** If a color, size, or spacing value you need is not in `tokens.ts`, propose adding it there first. Never hardcode a value inline.

2. **Build into ui-kit first.** New shared components go in `packages/ui-kit/src/`. Feature panels that are genuinely one-off live in `apps/web/components/`.

3. **AI output components are non-negotiable.** `CitationInline`, `CitationList`, `ConfidenceIndicator`, `AIResponseCard`, and `VerificationBadge` must match the spec in §3.4 exactly. These are the product differentiator.

4. **Accessibility is not optional.** Every interactive element needs an accessible name, ARIA role where the semantic element doesn't provide one, and focus management in modals/drawers (trap focus while open, return focus to trigger on close).

5. **Test at all four breakpoints.** 360px (phone portrait), 768px (tablet), 1024px (small desktop / tablet landscape), 1440px (desktop).

6. **Skeleton loading is the default.** Any data fetch that might take more than 400ms gets a skeleton that matches the layout of the loaded state. Never use a generic spinner for content areas.

7. **Empty states are content.** Wire them from the first build — don't leave a blank white space as a placeholder.

8. **Propose, don't inline.** If a component or pattern you need is not in this brief, add a note to `docs/open-questions.md` and make a reasonable call — don't silently invent patterns.

---

## 10. Prompt Template for a Design Session

Paste this at the start of a Claude Code session focused on a specific surface:

```
I am building the Contract Knowledge Base (CKB) application for Technica Mining.
Read the design brief at docs/design/ui-ux-brief.md before proceeding.

I want to [REDESIGN / BUILD] the [SURFACE NAME] surface.

The surface must:
- Follow the token system in packages/ui-kit/src/tokens.ts
- Use only components from packages/ui-kit/src/ (or add new ones there)
- Match the layout and interaction patterns in the brief
- Include the AI output affordances from §6 of the brief (citations, confidence, verification badges)
- Be mobile-responsive at 360px, 768px, 1024px, 1440px
- Satisfy WCAG 2.1 AA (color + text, accessible names, keyboard navigation)

The specific requirements for this surface are:
[PASTE FROM THIS BRIEF OR ADD YOUR OWN]

Current state of the surface:
[PASTE CURRENT CODE OR DESCRIBE WHAT EXISTS]

Please produce a complete, production-quality implementation.
```

---

*End of brief. Update this document as design decisions are made and confirmed in production.*
