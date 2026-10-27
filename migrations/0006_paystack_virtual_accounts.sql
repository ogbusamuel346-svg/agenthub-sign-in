CREATE TABLE IF NOT EXISTS paystack_virtual_accounts (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  customer_id INTEGER,
  customer_code TEXT,
  account_id INTEGER,
  account_number TEXT UNIQUE,
  account_name TEXT,
  bank_name TEXT,
  bank_slug TEXT,
  currency TEXT NOT NULL DEFAULT 'NGN' CHECK (currency = 'NGN'),
  status TEXT NOT NULL CHECK (status IN ('creating', 'pending', 'assigned', 'failed')),
  failure_code TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_paystack_virtual_accounts_customer
  ON paystack_virtual_accounts(customer_code);

CREATE TABLE IF NOT EXISTS paystack_virtual_account_events (
  event_key TEXT PRIMARY KEY,
  event TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  account_number TEXT,
  customer_code TEXT,
  amount_minor INTEGER,
  received_at INTEGER NOT NULL
);
