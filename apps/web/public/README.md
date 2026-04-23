# Public Brand Assets — PLACEHOLDER

## Status

The logo currently rendered by `<Logo>` in `@ckb/ui-kit` and by `favicon.svg`
in this folder is a **hand-drawn SVG approximation** of the Technica Mining
mark, **not the official vector artwork**.

It exists so the app can be developed and demoed without shipping a blank
header. It is not brand-compliant.

## Why this matters

Technica Brand Guidelines (2023) explicitly forbid altered or previous
versions of the logo. The placeholder is a derivative, not the real mark,
so it must be replaced before any external release.

## How to replace

1. Obtain the official SVGs from Technica brand / marketing.
2. Drop them into `apps/web/public/brand/`:
   - `technica-horizontal.svg`
   - `technica-vertical.svg`
   - `technica-mark.svg`
3. Update `packages/ui-kit/src/Logo.tsx` — swap the inline `<MarkPaths>` and
   the `horizontal` / `vertical` SVG bodies for the official path data (or
   switch the component to reference the files via `<img src="/brand/...">`).
4. Replace `apps/web/public/favicon.svg` with the official brandmark SVG.
5. Re-run the ui-kit tests.

## Usage rules still enforced in code

Even with the placeholder swapped out, the component enforces:

- Minimum rendered widths: 180px (horizontal) / 130px (vertical) / 42px (mark)
  — see brand guide page 6. Below-minimum renders log a dev-time warning.
- Clear space equal to the inner-circle diameter — applied as CSS padding,
  per brand guide page 5.
- Tone restricted to `black` / `white` / `gray` — no gradients, no brand-gold
  fills, no effects.

See `.claude/rules/ui.md` for the full rule.
