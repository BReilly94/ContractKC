-- Migration: 0008_notifications
-- Scope: §5.9 per-event notifications + read state.

CREATE TABLE notification (
  id                  CHAR(26)        NOT NULL PRIMARY KEY,
  user_id             CHAR(26)        NOT NULL,
  contract_id         CHAR(26)        NULL,
  kind                VARCHAR(40)     NOT NULL,
  subject             NVARCHAR(512)   NOT NULL,
  body                NVARCHAR(MAX)   NULL,
  link_path           NVARCHAR(1024)  NULL,
  email_sent          BIT             NOT NULL DEFAULT 0,
  email_sent_at       DATETIMEOFFSET  NULL,
  read_at             DATETIMEOFFSET  NULL,
  created_at          DATETIMEOFFSET  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT fk_notification_user     FOREIGN KEY (user_id)     REFERENCES app_user(id),
  CONSTRAINT fk_notification_contract FOREIGN KEY (contract_id) REFERENCES contract(id),
  CONSTRAINT ck_notification_kind CHECK (
    kind IN (
      'review_queue_item',
      'deadline_due_soon',
      'deadline_missed',
      'summary_unverified',
      'document_quarantined',
      'query_blocked'
    )
  )
);

CREATE INDEX ix_notification_user_unread
  ON notification(user_id, created_at DESC)
  WHERE read_at IS NULL;
