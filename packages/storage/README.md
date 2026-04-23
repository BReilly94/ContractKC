# @ckb/storage

Blob-storage abstraction. One interface (`StorageClient`), one implementation backed by `@azure/storage-blob` (Azurite locally, Azure Blob in prod — same SDK, different connection string).

## Non-Negotiable #3

Originals are immutable. The caller enforces immutability by passing `{ ifNoneMatch: '*' }` on content-addressed writes:

```ts
await storage.put(`sha256/${sha}/raw.eml`, bytes, {
  contentType: 'message/rfc822',
  ifNoneMatch: '*',
});
```

If the path exists, the write is a no-op and the response carries `created: false`. Same hash → same bytes → idempotent; this is the replay-safety hook for the ingestion worker.

## Config

| Env var | Purpose |
|---|---|
| `STORAGE_CONNECTION_STRING` | Azurite or Azure Blob connection string. |
| `STORAGE_CONTAINER` | Container name. Defaults to `ckb`. |
| `PROVIDER_MODE` | `local` or `azure` — telemetry label only. |
