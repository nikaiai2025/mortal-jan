-- Preconverted, complete rounds. Fetch only when exporting an answered problem.
CREATE TABLE problem_logs (
  problem_id INTEGER PRIMARY KEY REFERENCES problems(id) ON DELETE CASCADE,
  tenhou_json TEXT NOT NULL
);
