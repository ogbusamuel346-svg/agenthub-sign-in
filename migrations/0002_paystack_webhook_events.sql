CREATE TABLE IF NOT EXISTS paystack_webhook_events (
  event_key TEXT PRIMARY KEY,
  event TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  tx_ref TEXT NOT NULL,
  status TEXT NOT NULL,
  received_at INTEGER NOT NULL
);
