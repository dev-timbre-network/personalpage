CREATE TABLE IF NOT EXISTS asks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at  TEXT    DEFAULT (datetime('now')),
  name        TEXT,
  question    TEXT    NOT NULL,
  response    TEXT    NOT NULL,
  user_agent  TEXT,
  ip          TEXT,
  country     TEXT,
  city        TEXT
);
