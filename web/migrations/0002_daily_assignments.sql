-- Problems assigned to the player on a Japan date, capped by the daily limit. The player's row is
-- written by every assignment anyway, so counting here costs no extra writes or reads.
ALTER TABLE players ADD COLUMN assigned_day TEXT;
ALTER TABLE players ADD COLUMN assigned_count INTEGER NOT NULL DEFAULT 0;
