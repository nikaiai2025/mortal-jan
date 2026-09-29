-- Problems are loaded once from generator output (python -m generator.load).
CREATE TABLE problems (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  scene TEXT NOT NULL,        -- JSON, returned before answering
  choices TEXT NOT NULL,      -- JSON, returned before answering
  evaluation TEXT NOT NULL,   -- JSON, returned only after answering
  source TEXT NOT NULL,       -- JSON, generation provenance
  -- Position (1-based, in number order) within its difficulty and within its kind; problem sets by theme.
  difficulty_pos INTEGER NOT NULL,
  kind_pos INTEGER NOT NULL,
  answer_count INTEGER NOT NULL DEFAULT 0,
  score_sum INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX problems_by_difficulty ON problems (difficulty, difficulty_pos);
CREATE INDEX problems_by_kind ON problems (kind, kind_pos);

CREATE TABLE players (
  id INTEGER PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,
  token_hash TEXT NOT NULL UNIQUE,
  name TEXT,
  -- Problem last shown for answering; it locks other problems until answered.
  current_problem_id INTEGER,
  created_at TEXT NOT NULL
);

-- The facts: who answered what. Everything else is counted from these rows.
CREATE TABLE answers (
  id INTEGER PRIMARY KEY,     -- insertion order; the aggregation reads new rows by id
  player_id INTEGER NOT NULL,
  problem_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  score INTEGER NOT NULL,
  pitari INTEGER NOT NULL,
  answered_at TEXT NOT NULL,
  jst_date TEXT NOT NULL      -- 'YYYY-MM-DD' in Japan time
);
CREATE UNIQUE INDEX answers_by_player ON answers (player_id, problem_id);

-- Aggregates of answers for rankings, folded in every 10 minutes (worker/aggregate.ts)
-- so that rankings never scan answers. period: 'all' or a JST date 'YYYY-MM-DD'.
CREATE TABLE player_stats (
  player_id INTEGER NOT NULL,
  period TEXT NOT NULL,
  answers INTEGER NOT NULL,
  score_sum INTEGER NOT NULL,
  pitari INTEGER NOT NULL,
  qualified INTEGER NOT NULL,   -- answers >= the ranking minimum of the period
  average REAL NOT NULL,
  pitari_rate REAL NOT NULL,
  PRIMARY KEY (player_id, period)
) WITHOUT ROWID;
CREATE INDEX ranking_answers ON player_stats (period, answers DESC);
CREATE INDEX ranking_average ON player_stats (period, average DESC) WHERE qualified = 1;
CREATE INDEX ranking_pitari ON player_stats (period, pitari_rate DESC) WHERE qualified = 1;

-- Answers up to last_answer_id are already in player_stats and the problems' counters.
CREATE TABLE aggregation (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_answer_id INTEGER NOT NULL
);
INSERT INTO aggregation (id, last_answer_id) VALUES (1, 0);
