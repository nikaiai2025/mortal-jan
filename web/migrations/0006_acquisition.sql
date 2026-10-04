-- Acquisition owns no credentials, IPs, names, or arbitrary URLs. A browser's first touch is immutable.
CREATE TABLE acquisition_visitors (
  visitor_hash TEXT PRIMARY KEY,
  player_id INTEGER UNIQUE,
  first_seen_ms INTEGER NOT NULL,
  first_seen_day TEXT NOT NULL,
  source TEXT NOT NULL,
  medium TEXT NOT NULL,
  campaign TEXT NOT NULL,
  content TEXT NOT NULL,
  landing TEXT NOT NULL,
  eligible INTEGER NOT NULL DEFAULT 1 CHECK (eligible IN (0, 1)),
  first_answer_ms INTEGER,
  first_answer_day TEXT,
  returned_day TEXT
);

-- The first saved answer can be checked without scanning this player's history or all answers.
CREATE INDEX answers_first_by_player ON answers (player_id, answered_at, id);

CREATE TABLE acquisition_daily (
  day TEXT NOT NULL,
  source TEXT NOT NULL,
  medium TEXT NOT NULL,
  campaign TEXT NOT NULL,
  content TEXT NOT NULL,
  landing TEXT NOT NULL,
  new_visitors INTEGER NOT NULL DEFAULT 0,
  converted_24h INTEGER NOT NULL DEFAULT 0,
  first_answers INTEGER NOT NULL DEFAULT 0,
  returned_7d INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, source, medium, campaign, content, landing)
);

-- Triggers apply only to acquisition tables. Analytics failure cannot roll back a game answer.
CREATE TRIGGER acquisition_arrival AFTER INSERT ON acquisition_visitors WHEN NEW.eligible = 1 BEGIN
  INSERT INTO acquisition_daily (day, source, medium, campaign, content, landing, new_visitors)
  VALUES (NEW.first_seen_day, NEW.source, NEW.medium, NEW.campaign, NEW.content, NEW.landing, 1)
  ON CONFLICT (day, source, medium, campaign, content, landing) DO UPDATE SET new_visitors = new_visitors + 1;
END;

-- A returning player may be recognized only after an anonymous arrival has already been saved.
CREATE TRIGGER acquisition_existing AFTER UPDATE OF eligible ON acquisition_visitors
WHEN OLD.eligible = 1 AND NEW.eligible = 0 AND OLD.first_answer_ms IS NULL BEGIN
  UPDATE acquisition_daily SET new_visitors = new_visitors - 1
  WHERE day = OLD.first_seen_day AND source = OLD.source AND medium = OLD.medium
    AND campaign = OLD.campaign AND content = OLD.content AND landing = OLD.landing;
END;

CREATE TRIGGER acquisition_first_answer AFTER UPDATE OF first_answer_ms ON acquisition_visitors
WHEN OLD.first_answer_ms IS NULL AND NEW.first_answer_ms IS NOT NULL AND NEW.eligible = 1 BEGIN
  INSERT INTO acquisition_daily (day, source, medium, campaign, content, landing, first_answers)
  VALUES (NEW.first_answer_day, NEW.source, NEW.medium, NEW.campaign, NEW.content, NEW.landing, 1)
  ON CONFLICT (day, source, medium, campaign, content, landing) DO UPDATE SET first_answers = first_answers + 1;
  UPDATE acquisition_daily SET converted_24h = converted_24h + 1
  WHERE day = NEW.first_seen_day AND source = NEW.source AND medium = NEW.medium
    AND campaign = NEW.campaign AND content = NEW.content AND landing = NEW.landing
    AND NEW.first_answer_ms BETWEEN NEW.first_seen_ms AND NEW.first_seen_ms + 86400000;
END;

CREATE TRIGGER acquisition_return AFTER UPDATE OF returned_day ON acquisition_visitors
WHEN OLD.returned_day IS NULL AND NEW.returned_day IS NOT NULL AND NEW.eligible = 1 BEGIN
  UPDATE acquisition_daily SET returned_7d = returned_7d + 1
  WHERE day = NEW.first_answer_day AND source = NEW.source AND medium = NEW.medium
    AND campaign = NEW.campaign AND content = NEW.content AND landing = NEW.landing;
END;
