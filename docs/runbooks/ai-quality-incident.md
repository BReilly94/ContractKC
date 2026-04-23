# Runbook — AI Quality Incident

**Scope:** a user reports a bad AI answer, or a response was blocked by the citation verifier, or thumbs-down feedback is spiking.

## 1. Locate the incident

Every AI response is persisted in `query_log`:

```sql
SELECT id, contract_id, user_id, capability, prompt_version, model_actual,
       question, answer, blocked, blocked_reason, confidence,
       retrieval_hits, retrieval_top_score, retrieval_context_hash,
       cited_chunk_ids, created_at
FROM query_log
WHERE id = '<queryId>';
```

For bulk patterns:

```sql
SELECT capability, prompt_version, SUM(CASE WHEN blocked=1 THEN 1 ELSE 0 END) AS blocked,
       COUNT(*) AS total
FROM query_log
WHERE created_at > DATEADD(DAY, -7, SYSUTCDATETIME())
GROUP BY capability, prompt_version;
```

## 2. Reproduce

`retrieval_context_hash` is `SHA-256(sorted_chunk_ids + capability@version)`. If the index still contains those chunks, the same question produces the same hash and the answer is exactly replayable.

Re-run the capability directly:

```
pnpm --filter @ckb/ai regression
```

For a targeted replay, feed the question back through `runQaSynth` with the original chunks.

## 3. Classify

- **Citation verifier blocked** (`blocked=1`) — Non-Negotiable #1 caught an un-cited or foreign-cited response. The model is mis-behaving; add a negative regression query and iterate on the prompt.
- **Retrieval miss** (`retrieval_hits=0` or `top_score` low) — the index doesn't contain the right chunks. Check if the document was indexed (`embed-index` worker log) and its OCR status. Re-index if needed.
- **Bad generation despite good retrieval** — the model selected the wrong chunks or misread them. Add a regression query with `expectCitations` + `expectSubstrings` targeting the expected behaviour, fix the prompt, bump `PROMPT_VERSION`, land both in the same PR.

## 4. Mitigate

- If a specific prompt version is producing bad output, revert to the previous version by a PR to `packages/ai/src/capabilities/<name>/prompt.ts`. The capability's regression harness must pass on the revert.
- For contract-specific retrieval issues, delete and re-index the contract:
  ```
  SearchClient.deleteNamespace('<contractId>')
  SearchClient.ensureNamespace('<contractId>')
  // enqueue document.ocr.v1 + retrieval.embed-index.v1 for each document
  ```

## 5. Never

- Do not update a `query_log` row to alter the recorded answer — the log is append-only in intent, and users may reference it.
- Do not disable citation verification as a workaround — if responses are failing verification, the prompt needs fixing.

## Regression loop

Every incident should result in one new `queries.jsonl` entry for the affected capability. The regression harness is our early-warning system — additions there are the closed loop.
