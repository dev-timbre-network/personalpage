CREATE TABLE IF NOT EXISTS rate_limits (
  ip           TEXT NOT NULL,
  window_start TEXT NOT NULL,
  count        INTEGER DEFAULT 1,
  PRIMARY KEY (ip, window_start)
);
