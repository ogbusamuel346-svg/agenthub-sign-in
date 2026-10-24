CREATE TABLE IF NOT EXISTS product_price_overrides (
  service TEXT NOT NULL CHECK (service IN ('data', 'exampin')),
  product_id TEXT NOT NULL,
  network_id TEXT NOT NULL DEFAULT '',
  product_name TEXT NOT NULL,
  price_minor INTEGER NOT NULL CHECK (price_minor > 0 AND price_minor <= 100000000),
  updated_by TEXT NOT NULL REFERENCES users(id),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (service, product_id, network_id)
);

CREATE TABLE IF NOT EXISTS admin_activity_archives (
  user_id TEXT NOT NULL REFERENCES users(id),
  activity_kind TEXT NOT NULL,
  reference TEXT NOT NULL,
  archived_by TEXT NOT NULL REFERENCES users(id),
  archived_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, activity_kind, reference)
);
