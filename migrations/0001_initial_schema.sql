-- Cloudflare D1 baseline. This schema is additive and does not migrate or delete Firebase data.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT,
  phone TEXT,
  email_verified INTEGER NOT NULL DEFAULT 0 CHECK (email_verified IN (0, 1)),
  identity_provider TEXT NOT NULL DEFAULT 'firebase',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS wallets (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  balance_minor INTEGER NOT NULL DEFAULT 0 CHECK (balance_minor >= 0),
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS wallet_funding_transactions (
  tx_ref TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL CHECK (currency = 'NGN'),
  customer_email TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'checkout_created', 'processing', 'successful', 'failed')),
  checkout_url TEXT,
  provider_transaction_id TEXT,
  failure_code TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  credited_at INTEGER
);

CREATE TABLE IF NOT EXISTS wallet_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  tx_ref TEXT NOT NULL UNIQUE REFERENCES wallet_funding_transactions(tx_ref),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL CHECK (currency = 'NGN'),
  provider_transaction_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS service_transactions (
  user_id TEXT NOT NULL REFERENCES users(id),
  reference TEXT NOT NULL,
  service TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  provider_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_minor INTEGER NOT NULL CHECK (unit_price_minor > 0),
  total_amount_minor INTEGER NOT NULL CHECK (total_amount_minor > 0),
  currency TEXT NOT NULL CHECK (currency = 'NGN'),
  status TEXT NOT NULL CHECK (status IN ('processing', 'pending', 'successful', 'failed')),
  provider_status TEXT,
  pins_json TEXT,
  failure_code TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  debited_at INTEGER,
  refunded_at INTEGER,
  PRIMARY KEY (user_id, reference)
);

CREATE TABLE IF NOT EXISTS wallet_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  reference TEXT NOT NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('service_debit', 'service_refund')),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  created_at INTEGER NOT NULL,
  UNIQUE (user_id, reference, entry_type)
);

CREATE TABLE IF NOT EXISTS flutterwave_webhook_events (
  event_key TEXT PRIMARY KEY,
  event TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  tx_ref TEXT NOT NULL,
  status TEXT NOT NULL,
  received_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_funding_user_created ON wallet_funding_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_transactions_user_created ON service_transactions(user_id, created_at DESC);

