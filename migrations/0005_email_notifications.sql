CREATE TABLE IF NOT EXISTS email_notifications (
  event_kind TEXT NOT NULL CHECK (event_kind IN ('wallet_funding', 'service_purchase')),
  reference TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK (status IN ('pending', 'sending', 'sent')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  sent_at INTEGER,
  PRIMARY KEY (event_kind, reference)
);

CREATE INDEX IF NOT EXISTS idx_email_notifications_pending
  ON email_notifications(status, updated_at)
  WHERE status <> 'sent';
