CREATE TABLE IF NOT EXISTS hall_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id TEXT NOT NULL UNIQUE,
  initials TEXT NOT NULL CHECK (length(initials) = 3),
  country_code TEXT NOT NULL CHECK (length(country_code) = 3),
  chief_id TEXT NOT NULL CHECK (chief_id IN ('blue', 'red', 'pink', 'green')),
  turns INTEGER NOT NULL CHECK (turns > 0),
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS hall_entries_ranking
  ON hall_entries (turns ASC, created_at ASC, id ASC);

CREATE TABLE IF NOT EXISTS hall_rate_limits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_hash TEXT NOT NULL,
  submitted_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS hall_rate_limits_lookup
  ON hall_rate_limits (source_hash, submitted_at);
