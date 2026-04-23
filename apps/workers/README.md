# @ckb/workers

Background job host. Boots all workers registered via `registerWorker()` in their own side-effect imports.

Each worker file under `src/workers/*.ts`:
1. imports `registerWorker`
2. calls it with `{ queueName, concurrency, handle }`

Adding a worker is a two-line change in `main.ts` (import its module).

## Phase 1 workers (lands during later slices)

| Queue | Purpose | Slice |
|---|---|---|
| `email.ingest.v1` | Parse + thread + dedup + sender-trust | D |
| `document.malware-scan.v1` | ClamAV scan | E |
| `document.ocr.v1` | Text extraction | E |
| `retrieval.embed-index.v1` | Chunk + embed + index | G |
| `ai.clause-extract.v1` | Clause extraction | K |
| `ai.contract-summary.v1` | Summary generation | I |
| `ai.deadline-extract.v1` | Deadline extraction | J |
| `ai.email-prescreen.v1` | Privileged-content classifier | F |
| `notify.v1` | Single notification dispatch | N |
| `notify.digest.v1` | Daily/weekly digest | N |
