# @ckb/ingestion

First-stage ingestion for §5.2. Two paths feed the same pipeline:

1. **Webhook** — `POST /webhooks/inbound-email/sendgrid` (HMAC-verified, 501 until Slice D wires the multipart body).
2. **Folder watcher** — drops `.eml` files placed in `dev/inbox/<slug>/` through the identical pipeline. Used for dev round-trips without SendGrid.

Both call `acceptInboundEmail()` which:
- computes SHA-256 of the raw bytes
- writes to blob at `sha256/<hash>/raw.eml` with `ifNoneMatch='*'` (Non-Negotiable #3)
- enqueues `email.ingest.v1` with a content-addressed job ID (dedupe for retries)

The full parse → thread → dedup → sender-trust → review-queue pipeline lives in the worker; this app is the thin receiver.

## Config

| Env var | Purpose |
|---|---|
| `INGESTION_PORT` | HTTP port. Defaults to 4001. |
| `INGESTION_WEBHOOK_SECRET` | HMAC-SHA256 secret for signed webhooks. If unset, the webhook path fails closed with 503. |
| `EMAIL_INBOX_DIR` | Folder watched for new `.eml` files. Defaults to `dev/inbox`. |
| `EMAIL_PROCESSED_DIR` | Where files are moved after enqueue. Defaults to `dev/processed`. |
| `EMAIL_DOMAIN` | Domain appended to the folder slug to form the `To:` address. |
