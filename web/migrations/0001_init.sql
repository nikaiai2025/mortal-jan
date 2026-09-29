-- Problems are loaded once from generator output (python -m generator.load).
CREATE TABLE problems (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  scene TEXT NOT NULL,        -- JSON, returned before answering
  choices TEXT NOT NULL,      -- JSON, returned before answering
  evaluation TEXT NOT NULL,   -- JSON, returned only after answering
  source TEXT NOT NULL,       -- JSON, generation provenance
  answer_count INTEGER NOT NULL DEFAULT 0,
  score_sum INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE players (
  id INTEGER PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,
  token_hash TEXT NOT NULL UNIQUE,
  name TEXT,
  -- Problem shown for answering; locked until answered (NULL when none).
  current_problem_id INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE answers (
  player_id INTEGER NOT NULL,
  problem_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  score INTEGER NOT NULL,
  pitari INTEGER NOT NULL,
  answered_at TEXT NOT NULL,
  PRIMARY KEY (player_id, problem_id)
) WITHOUT ROWID;
CREATE INDEX answers_history ON answers (player_id, answered_at DESC);

-- Aggregates updated with each answer so that rankings never scan answers.
-- period: 'all' or a JST date 'YYYY-MM-DD'.
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

CREATE TABLE player_sets (
  player_id INTEGER NOT NULL,
  set_no INTEGER NOT NULL,
  answered INTEGER NOT NULL,
  score_sum INTEGER NOT NULL,
  pitari INTEGER NOT NULL,
  PRIMARY KEY (player_id, set_no)
) WITHOUT ROWID;
