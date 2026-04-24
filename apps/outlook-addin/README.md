# @ckb/outlook-addin

Microsoft Outlook add-in that routes emails (received or sent) to the
Contract Knowledge Base project-designated email address.

Implements SOW §6.18.

## What it does

- Adds a **Send to Contract** ribbon button in Outlook Mail (both message-read
  and message-compose surfaces).
- The button opens a taskpane that:
  1. Lists every contract the signed-in user has access to
     (`GET /api/contracts` — per-contract default-deny enforced server-side,
     security.md §2).
  2. Provides a search-as-you-type filter over contract name and the project
     email alias.
  3. Reads the current Outlook item as raw `.eml` via
     `Office.context.mailbox.item.getAsFileAsync(EmailFileType.Eml, ...)`.
  4. POSTs the base64'd `.eml` to
     `POST /api/contracts/:id/emails/forward`. The API enqueues
     `email.ingest.v1` — the same queue SendGrid feeds — so thread
     reconstruction, malware scan, sender trust, shared-link capture, and ICS
     parsing all run through the existing worker pipeline.
- Falls back to an IndexedDB offline queue when the network is unreachable,
  with an `online` event listener that flushes on reconnect
  *(Non-Negotiable #7 carve-out — see Security section below)*.

## File layout

```
apps/outlook-addin/
├── manifest.xml              Office Add-in manifest (ItemRead + ItemCompose)
├── webpack.config.cjs        Bundles taskpane + commands, serves on https://localhost:3010
├── public/assets/            Placeholder icons — replace with brand assets before release
├── src/
│   ├── taskpane/             React UI entry + styles
│   ├── commands/             Function-command host (stub for ribbon action IDs)
│   ├── lib/                  api-client, auth, offline queue, Office.js helpers
│   └── types/shims.d.ts      Type stubs used when node_modules are not installed
└── README.md
```

## Install and sideload (local dev)

1. Install dependencies from the repo root:
   ```bash
   pnpm install
   ```
2. Start the API (and its Postgres / storage emulator / Redis) in one
   terminal, per the root README:
   ```bash
   pnpm dev:up        # compose stack
   pnpm dev:api       # NestJS API on :4000
   pnpm dev:workers   # email-ingest worker
   ```
3. In another terminal, start the add-in dev server:
   ```bash
   pnpm --filter @ckb/outlook-addin run dev
   ```
   Webpack serves `https://localhost:3010/taskpane.html` (self-signed cert —
   accept it the first time).
4. Sideload the manifest into Outlook:
   - **Outlook Web**: Settings → General → Manage add-ins → My add-ins →
     Add a custom add-in → Add from file → pick `manifest.xml`.
   - **Outlook Desktop (Windows)**: File → Get Add-ins → My add-ins →
     Custom Add-ins → Add a custom add-in → Add from file → pick `manifest.xml`.
   - **Scripted**:
     ```bash
     pnpm --filter @ckb/outlook-addin run start
     ```
     which invokes `office-addin-debugging` to register and launch Outlook.
5. Open any email and click **Send to Contract** in the ribbon. Sign in with
   a dev principal, pick a contract, hit the send button.

To stop the debugger:
```bash
pnpm --filter @ckb/outlook-addin run stop
```

## Auth model

SOW §6.18 calls for "user's Azure AD session (post-M365-migration) or Azure AD
token (pre-migration bridge)." This add-in implements three modes, switched via
`CKB_AUTH_MODE` at build time (inlined by webpack's `DefinePlugin`):

| `CKB_AUTH_MODE` | Behaviour |
|---|---|
| `local-dev` (default) | Lists dev users from `GET /api/dev/users` and mints a bearer via `POST /api/dev/token`. Mirrors the web app's dev login flow. |
| `azure-ad` | **Stubbed.** The login surface renders a "contact IT" message. Full SSO via `OfficeRuntime.auth.getAccessToken` + on-behalf-of exchange is deferred until M365 migration closes (see `docs/runbooks/adfs-fallback.md`). |

The bearer is persisted via **Office `roamingSettings`** — server-synced Exchange
user data, not browser `localStorage` — so signing in once on Outlook Desktop
makes the add-in usable on Outlook Web for the same mailbox.

### What about Non-Negotiable #7?

CLAUDE.md Non-Negotiable #7 forbids browser storage (localStorage / sessionStorage
/ IndexedDB) of contract content. SOW §6.18 carves out one exception:
**offline queuing of forward-requests**. The only data written to IndexedDB is:

- the target `contractId`,
- the queued `.eml` bytes (base64),
- subject / sender metadata captured at queue time.

On success the entry is deleted. There is no long-lived cache of contract
content. See `src/lib/offline-queue.ts` for the commented implementation — it
is the single permitted use of IndexedDB in this package.

## Production deployment

Out of scope for Slice X. High-level checklist for the future slice:

1. Regenerate the manifest `<Id>` via `office-addin-manifest new-guid`.
2. Replace placeholder icons with brand assets (see
   `.claude/rules/ui.md` §11).
3. Swap `localhost:3010` URLs in `manifest.xml` for the production CDN
   (Azure Static Web Apps or similar).
4. Build with `CKB_AUTH_MODE=azure-ad` **once the SSO code is implemented**.
   Until then, `azure-ad` mode is intentionally inoperative.
5. Publish to the Technica M365 tenant via the Microsoft 365 Admin Center
   (Integrated apps → Upload custom apps).

## Testing

`pnpm typecheck` is the primary validation gate. The ambient shims in
`src/types/shims.d.ts` keep the typecheck self-contained even before
`pnpm install` has run. Real @types packages (`@types/office-js`,
`@types/react`, `@types/react-dom`) take precedence once installed and the
shim entries become inert.

Unit tests for `offline-queue.ts` can mock `indexedDB` via `fake-indexeddb`;
add those under `src/lib/*.test.ts` when adding new queue behaviour.

## Related files

- `apps/api/src/inbound/` — backend endpoint this add-in calls.
- `apps/workers/src/workers/email-ingest/` — worker that consumes the
  `email.ingest.v1` job the endpoint enqueues.
- `apps/ingestion/src/pipeline.ts` — the SendGrid-path equivalent; the add-in
  code is intentionally duplicative at the source level (different deployable,
  shared queue contract).
