# @ckb/search

Per-contract isolated retrieval. OpenSearch locally (hybrid: BM25 + kNN vector). Azure AI Search slots in at cutover behind the same interface.

## Non-Negotiable #6

Every index operation takes a `contractId`. The impl derives a contract-specific index name (`ckb-contract-<ulid>`) and never reads from any other. `deleteBySource` is scoped the same way. There is no "search all contracts" surface — Phase 1 retrieval is contract-scoped at the index-namespace level, not just query filter level.

## Config

| Env var | Purpose |
|---|---|
| `SEARCH_NODE` | OpenSearch URL, e.g. `http://localhost:9200`. |
| `SEARCH_EMBEDDING_DIM` | Vector dimension; must match the embedding provider. Default 384 (MiniLM). |
| `SEARCH_INDEX_PREFIX` | Optional override for multi-tenant dev. Defaults to `ckb-contract-`. |
