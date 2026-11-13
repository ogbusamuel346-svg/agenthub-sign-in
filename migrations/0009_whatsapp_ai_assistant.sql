CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  phone_number TEXT PRIMARY KEY,
  contact_name TEXT,
  mode TEXT NOT NULL DEFAULT 'ai' CHECK (mode IN ('ai', 'paused', 'human')),
  needs_human INTEGER NOT NULL DEFAULT 0 CHECK (needs_human IN (0, 1)),
  escalation_reason TEXT,
  admin_notified_at INTEGER,
  last_message_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_attention
  ON whatsapp_conversations(needs_human, updated_at DESC);

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  whatsapp_message_id TEXT UNIQUE,
  phone_number TEXT NOT NULL REFERENCES whatsapp_conversations(phone_number),
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  sender_type TEXT NOT NULL CHECK (sender_type IN ('customer', 'ai', 'human', 'system')),
  body TEXT NOT NULL,
  provider_timestamp INTEGER,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'sent', 'failed', 'ignored')),
  error_code TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_conversation
  ON whatsapp_messages(phone_number, created_at DESC);

CREATE TABLE IF NOT EXISTS whatsapp_outbound_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_message_id TEXT NOT NULL UNIQUE,
  phone_number TEXT NOT NULL REFERENCES whatsapp_conversations(phone_number),
  body TEXT NOT NULL,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('ai', 'human')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  provider_message_id TEXT,
  error_code TEXT,
  next_attempt_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_outbound_queue_pending
  ON whatsapp_outbound_queue(status, next_attempt_at)
  WHERE status IN ('pending', 'sending');

CREATE TABLE IF NOT EXISTS whatsapp_webhook_events (
  event_key TEXT PRIMARY KEY,
  received_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('accepted', 'processed', 'ignored', 'failed')),
  error_code TEXT
);

CREATE TABLE IF NOT EXISTS whatsapp_assistant_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  assistant_name TEXT NOT NULL DEFAULT 'SamEduHub Assistant',
  business_description TEXT NOT NULL DEFAULT 'SamEduHub provides verified student support and digital services.',
  services_json TEXT NOT NULL DEFAULT '[]',
  prices_json TEXT NOT NULL DEFAULT '[]',
  faq_json TEXT NOT NULL DEFAULT '[]',
  operating_hours TEXT NOT NULL DEFAULT '',
  welcome_message TEXT NOT NULL DEFAULT '',
  system_instructions TEXT NOT NULL DEFAULT '',
  escalation_instructions TEXT NOT NULL DEFAULT '',
  updated_by TEXT,
  updated_at INTEGER NOT NULL
);
