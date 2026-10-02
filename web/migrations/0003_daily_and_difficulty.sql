-- Answers by the problems' current difficulty, shown as a bar on the all-time ranking. Counted at
-- aggregation (period 'all' only); generator.relabel rebuilds them when the thresholds change.
-- The backfill counts the aggregated answers only (up to the cursor), as the next aggregation adds the rest.
ALTER TABLE player_stats ADD COLUMN easy INTEGER NOT NULL DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN normal INTEGER NOT NULL DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN hard INTEGER NOT NULL DEFAULT 0;
UPDATE player_stats SET
  easy = (SELECT COUNT(*) FROM answers a JOIN problems p ON p.id = a.problem_id WHERE a.player_id = player_stats.player_id AND p.difficulty = 'easy' AND a.id <= (SELECT last_answer_id FROM aggregation WHERE id = 1)),
  normal = (SELECT COUNT(*) FROM answers a JOIN problems p ON p.id = a.problem_id WHERE a.player_id = player_stats.player_id AND p.difficulty = 'normal' AND a.id <= (SELECT last_answer_id FROM aggregation WHERE id = 1)),
  hard = (SELECT COUNT(*) FROM answers a JOIN problems p ON p.id = a.problem_id WHERE a.player_id = player_stats.player_id AND p.difficulty = 'hard' AND a.id <= (SELECT last_answer_id FROM aggregation WHERE id = 1))
WHERE period = 'all';

-- Today's ten: the same ten problems for everyone on a Japan date, chosen from the least answered
-- when the day is first requested.
CREATE TABLE daily_sets (
  day TEXT PRIMARY KEY,        -- 'YYYY-MM-DD' in Japan time
  problem_ids TEXT NOT NULL    -- JSON array of ten problem numbers in number order
) WITHOUT ROWID;

-- A player's completed today's ten, written once; the day's ranking reads this table only.
CREATE TABLE daily_results (
  day TEXT NOT NULL,
  player_id INTEGER NOT NULL,
  score_sum INTEGER NOT NULL,
  pitari INTEGER NOT NULL,
  completed_at TEXT NOT NULL,  -- when the tenth answer was recorded (or the set was first seen complete)
  PRIMARY KEY (day, player_id)
) WITHOUT ROWID;
CREATE INDEX daily_ranking ON daily_results (day, score_sum DESC, pitari DESC, completed_at);
