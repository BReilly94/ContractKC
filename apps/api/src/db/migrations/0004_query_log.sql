-- Migration: 0004_query_log
-- Scope: persistent record of AI queries + feedback (§5.3.7, ai-layer.md §9).
--
-- Keeps enough context to reproduce a response (prompt template version,
-- model, input + retrieved context hash, citations). Prompt contents and
-- response bodies do NOT go into the general log stream (security.md §13)
-- but they do live here — with tighter access controls enforced by role
-- at the API layer (Auditor + Contract Owner + KC Admin).

CREATE TABLE query_log (
  id                          CHAR(26)        NOT NULL PRIMARY KEY,
  contract_id                 CHAR(26)        NOT NULL,
  user_id                     CHAR(26)        NOT NULL,
  capability                  VARCHAR(40)     NOT NULL,
  prompt_version              VARCHAR(64)     NOT NULL,
  model_tier                  VARCHAR(16)     NOT NULL,
  model_actual                VARCHAR(64)     NOT NULL,
  question                    NVARCHAR(MAX)   NOT NULL,
  answer                      NVARCHAR(MAX)   NOT NULL,
  blocked                     BIT             NOT NULL DEFAULT 0,
  blocked_reason              NVARCHAR(1024)  NULL,
  confidence                  VARCHAR(24)     NOT NULL,
  retrieval_hits              INT             NOT NULL,
  retrieval_top_score         FLOAT           NULL,
  retrieval_context_hash      CHAR(64)        NOT NULL,
  cited_chunk_ids             NVARCHAR(MAX)   NULL, -- JSON array
  input_tokens                INT             NOT NULL,
  output_tokens               INT             NOT NULL,
  latency_ms                  INT             NOT NULL,
  correlation_id              CHAR(26)        NOT NULL,
  created_at                  DATETIMEOFFSET  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT fk_query_log_contract FOREIGN KEY (contract_id) REFERENCES contract(id),
  CONSTRAINT fk_query_log_user     FOREIGN KEY (user_id)     REFERENCES app_user(id),
  CONSTRAINT ck_query_log_confidence CHECK (
    confidence IN ('high', 'medium', 'low', 'insufficient_context')
  )
);

CREATE INDEX ix_query_log_contract     ON query_log(contract_id, created_at DESC);
CREATE INDEX ix_query_log_user         ON query_log(user_id, created_at DESC);
CREATE INDEX ix_query_log_correlation  ON query_log(correlation_id);

CREATE TABLE query_feedback (
  id                CHAR(26)        NOT NULL PRIMARY KEY,
  query_log_id      CHAR(26)        NOT NULL,
  user_id           CHAR(26)        NOT NULL,
  thumb             VARCHAR(4)      NOT NULL,
  comment           NVARCHAR(2000)  NULL,
  created_at        DATETIMEOFFSET  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT fk_qfb_query FOREIGN KEY (query_log_id) REFERENCES query_log(id),
  CONSTRAINT fk_qfb_user  FOREIGN KEY (user_id)      REFERENCES app_user(id),
  CONSTRAINT ck_qfb_thumb CHECK (thumb IN ('up', 'down'))
);

CREATE INDEX ix_qfb_query ON query_feedback(query_log_id);
