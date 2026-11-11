CREATE TABLE IF NOT EXISTS signup_email_notifications (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  email TEXT NOT NULL,
  display_name TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sending', 'sent')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  sent_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_signup_email_notifications_pending
  ON signup_email_notifications(status, updated_at)
  WHERE status <> 'sent';
