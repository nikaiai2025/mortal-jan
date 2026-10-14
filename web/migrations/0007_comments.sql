-- Names are snapshots: changing a player's name does not rewrite past posts.
CREATE TABLE comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  problem_id INTEGER NOT NULL REFERENCES problems(id),
  player_id INTEGER NOT NULL REFERENCES players(id),
  player_public_id TEXT NOT NULL,
  player_name TEXT,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 1000),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX comments_by_problem ON comments (problem_id, id DESC);
