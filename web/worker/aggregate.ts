import { RANKING_MIN_ANSWERS } from "../shared/rules";

// Folds answers added since the last run into player_stats and the problems' counters.
// Runs every 10 minutes (wrangler.jsonc triggers), so answering itself writes only the answer.

// Every statement re-checks the cursor it started from, so an overlapping run adds nothing twice.
const GUARD = "(SELECT last_answer_id FROM aggregation WHERE id = 1) = ?1";

// The all-time row also counts the answers by the problems' current difficulty (the ranking's mix bar):
// one problem row is read per new answer. generator.relabel rebuilds these counts after a threshold change.
const allUpsert = `
INSERT INTO player_stats (player_id, period, answers, score_sum, pitari, qualified, average, pitari_rate, easy, normal, hard)
SELECT a.player_id, 'all', COUNT(*), SUM(a.score), SUM(a.pitari), COUNT(*) >= ?3,
  CAST(SUM(a.score) AS REAL) / COUNT(*), CAST(SUM(a.pitari) AS REAL) / COUNT(*),
  SUM(p.difficulty = 'easy'), SUM(p.difficulty = 'normal'), SUM(p.difficulty = 'hard')
FROM answers a JOIN problems p ON p.id = a.problem_id
WHERE a.id > ?1 AND a.id <= ?2 AND ${GUARD}
GROUP BY a.player_id
ON CONFLICT (player_id, period) DO UPDATE SET
  answers = answers + excluded.answers,
  score_sum = score_sum + excluded.score_sum,
  pitari = pitari + excluded.pitari,
  qualified = answers + excluded.answers >= ?3,
  average = CAST(score_sum + excluded.score_sum AS REAL) / (answers + excluded.answers),
  pitari_rate = CAST(pitari + excluded.pitari AS REAL) / (answers + excluded.answers),
  easy = easy + excluded.easy,
  normal = normal + excluded.normal,
  hard = hard + excluded.hard`;

// A day's row feeds the player's daily chart; the day's ranking reads daily_results instead.
const dayUpsert = `
INSERT INTO player_stats (player_id, period, answers, score_sum, pitari, qualified, average, pitari_rate)
SELECT player_id, jst_date, COUNT(*), SUM(score), SUM(pitari), 0,
  CAST(SUM(score) AS REAL) / COUNT(*), CAST(SUM(pitari) AS REAL) / COUNT(*)
FROM answers WHERE id > ?1 AND id <= ?2 AND ${GUARD}
GROUP BY player_id, jst_date
ON CONFLICT (player_id, period) DO UPDATE SET
  answers = answers + excluded.answers,
  score_sum = score_sum + excluded.score_sum,
  pitari = pitari + excluded.pitari,
  average = CAST(score_sum + excluded.score_sum AS REAL) / (answers + excluded.answers),
  pitari_rate = CAST(pitari + excluded.pitari AS REAL) / (answers + excluded.answers)`;

const problemsUpdate = `
UPDATE problems SET answer_count = answer_count + s.n, score_sum = score_sum + s.total
FROM (
  SELECT problem_id, COUNT(*) AS n, SUM(score) AS total FROM answers
  WHERE id > ?1 AND id <= ?2 AND ${GUARD} GROUP BY problem_id
) AS s
WHERE problems.id = s.problem_id`;

export const readCursor = async (db: D1Database): Promise<number> =>
	(await db.prepare("SELECT last_answer_id FROM aggregation WHERE id = 1").first<number>("last_answer_id")) ?? 0;

/** Returns the number of answers folded in. */
export async function aggregate(db: D1Database): Promise<number> {
	const cursor = await readCursor(db);
	const upto = (await db.prepare("SELECT MAX(id) AS n FROM answers").first<number>("n")) ?? 0;
	if (upto <= cursor) return 0;
	await fold(db, cursor, upto);
	return upto - cursor;
}

/** Fold answers (cursor, upto] in one transaction; does nothing if the cursor moved meanwhile. */
export async function fold(db: D1Database, cursor: number, upto: number): Promise<void> {
	await db.batch([
		db.prepare(allUpsert).bind(cursor, upto, RANKING_MIN_ANSWERS),
		db.prepare(dayUpsert).bind(cursor, upto),
		db.prepare(problemsUpdate).bind(cursor, upto),
		db.prepare("UPDATE aggregation SET last_answer_id = ?2 WHERE id = 1 AND last_answer_id = ?1").bind(cursor, upto),
	]);
}
