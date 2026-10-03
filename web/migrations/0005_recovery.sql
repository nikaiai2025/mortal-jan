-- Existing players and records stay intact. Recovery is opt-in.
ALTER TABLE players ADD COLUMN recovery_hash TEXT;
CREATE UNIQUE INDEX players_by_recovery ON players (recovery_hash) WHERE recovery_hash IS NOT NULL;
