# Runbook — Email Ingestion Failure

**Scope:** you see `inbound_email_event.worker_status = 'Failed'` or mail isn't appearing on the expected contract.

## Triage

1. Grab the correlation ID from the failing event:
   ```sql
   SELECT TOP 20 id, provider, worker_status, last_error, correlation_id, received_at
   FROM inbound_email_event
   WHERE worker_status = 'Failed'
   ORDER BY received_at DESC;
   ```
2. Pull matching log lines from the workers container:
   ```
   docker logs ckb-workers 2>&1 | grep <correlation_id>
   ```
3. Read the raw payload — it's content-addressed in blob storage.
   Look at `raw_payload_blob_path` on the event row.

## Common causes

- **`no_alias_match`** — none of the `To:`/envelope recipients match an active `email_alias`. Check `SELECT local_part, active FROM email_alias WHERE contract_id = '<contract>';`. If the alias was recently renamed, the old alias should be inactive — but that means mail to the old address correctly bounces.
- **storage write error** — Azurite container is down or out of disk. `pnpm dev:up` to restore. The worker is idempotent; re-enqueue the job with `worker_status = 'Queued'` and the same `id`.
- **ClamAV not ready** — the scanner worker re-queues OCR with a delay when the malware scan is still Pending. If ClamAV stayed unhealthy, OCR will churn. Check `docker logs ckb-clamav`.

## Replay

Ingestion is idempotent: the job ID is `sha256(raw_eml) + recipient`. Re-enqueue the inbound event:

```sql
UPDATE inbound_email_event SET worker_status = 'Queued', attempt_count = 0 WHERE id = '<id>';
```

Then drop a fresh row into `email.ingest.v1` with the same payload; the worker will no-op on duplicates.

## Escalation

If the raw `.eml` was never stored (storage write failed), recover from the provider-side archive. The `raw_payload_blob_path` will be null on the event row.
