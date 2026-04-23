# @ckb/queue

Queue + worker abstraction. BullMQ on Redis locally; Service Bus stub is where the Azure impl goes.

## Idempotency

Pass `{ jobId: '<stable-key>' }` on `enqueue` to get provider-level dedup. The ingestion worker uses `sha256(raw_eml) + contractId` as the job id, which makes webhook retries safe.

## Canonical queues

See `QUEUES` in `factory.ts` — one versioned name per pipeline stage. Version suffix (`.v1`) is an escape hatch for breaking payload changes; don't rename a queue without a migration.

## Config

| Env var | Purpose |
|---|---|
| `REDIS_URL` | Redis connection for BullMQ. |
| `PROVIDER_MODE` | `local` or `azure`; `azure` currently throws. |
