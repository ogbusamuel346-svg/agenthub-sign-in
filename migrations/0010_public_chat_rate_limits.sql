CREATE TABLE IF NOT EXISTS public_chat_rate_limits (
  ip_hash TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_public_chat_rate_limits_updated
  ON public_chat_rate_limits(updated_at);
