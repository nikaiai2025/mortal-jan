import {
	DAILY_ANSWER_LIMIT,
	DAILY_CHART_DAYS,
	HUMAN_STATS_MIN_ANSWERS,
	SET_SIZE,
	type SetTheme,
	displayName,
	isMiss,
	jstDate,
	setOf,
} from "../shared/rules";
import type {
	AnswerResult,
	Breakdown,
	Choice,
	DailySet,
	DailyStats,
	Evaluation,
	Me,
	Profile,
	ProblemResponse,
	Question,
	RankingAxis,
	RankingEntry,
	RankingPeriod,
	Result,
	SetProblem,
	SetSummary,
	Stats,
} from "../shared/types";
import { HttpError, addressKey, json, positiveInt, randomId, randomInt, randomToken, readJson, sha256Hex } from "./http";
import { validateName } from "./names";

interface Ctx {
	request: Request;
	env: Env;
	url: URL;
	params: string[];
}

const PLAYER_COLUMNS = "id, public_id, name, current_problem_id, assigned_day, assigned_count";

interface PlayerRow {
	id: number;
	public_id: string;
	name: string | null;
	current_problem_id: number | null;
	/** Japan date of the last assignment and how many problems were assigned that day. */
	assigned_day: string | null;
	assigned_count: number;
}

interface ProblemRow {
	id: number;
	kind: Question["kind"];
	difficulty: Result["difficulty"];
	scene: string;
	choices: string;
	evaluation: string;
	answer_count: number;
	score_sum: number;
}

interface AnswerRow {
	action: string;
	score: number;
	pitari: number;
}

type Handler = (ctx: Ctx) => Promise<Response>;

const routes: [string, RegExp, Handler][] = [
	["POST", /^\/api\/players$/, createPlayer],
	["GET", /^\/api\/me$/, getMe],
	["PUT", /^\/api\/me\/name$/, putName],
	["GET", /^\/api\/problems\/current$/, getCurrent],
	["GET", /^\/api\/problems\/next$/, getNext],
	["GET", /^\/api\/problems\/(\d+)$/, getProblem],
	["GET", /^\/api\/problems\/(\d+)\/log$/, getProblemLog],
	["POST", /^\/api\/problems\/(\d+)\/answer$/, postAnswer],
	["GET", /^\/api\/daily$/, getDaily],
	["GET", /^\/api\/sets$/, getSets],
	["GET", /^\/api\/sets\/([a-z]+)\/(\d+)$/, getSet],
	["GET", /^\/api\/players\/([a-z0-9]+)$/, getProfile],
	["GET", /^\/api\/ranking$/, getRanking],
];

export async function route(request: Request, env: Env, url: URL): Promise<Response> {
	for (const [method, pattern, handler] of routes) {
		const match = url.pathname.match(pattern);
		if (!match || request.method !== method) continue;
		try {
			return await handler({ request, env, url, params: match.slice(1) });
		} catch (error) {
			if (error instanceof HttpError) return json({ error: error.code }, error.status);
			console.error(error);
			return json({ error: "internal" }, 500);
		}
	}
	return json({ error: "not_found" }, 404);
}

// ---- players ----

async function authenticate(ctx: Ctx): Promise<PlayerRow> {
	const token = ctx.request.headers.get("Authorization")?.match(/^Bearer (\S+)$/)?.[1];
	if (!token) throw new HttpError(401, "unauthorized");
	const player = await ctx.env.DB.prepare(`SELECT ${PLAYER_COLUMNS} FROM players WHERE token_hash = ?`)
		.bind(await sha256Hex(token))
		.first<PlayerRow>();
	if (!player) throw new HttpError(401, "unauthorized");
	return player;
}

const loadPlayer = (db: D1Database, id: number) =>
	db.prepare(`SELECT ${PLAYER_COLUMNS} FROM players WHERE id = ?`).bind(id).first<PlayerRow>();

const clientIp = (ctx: Ctx) => addressKey(ctx.request.headers.get("CF-Connecting-IP") ?? "local");

async function limit(limiter: RateLimit, key: string): Promise<void> {
	const { success } = await limiter.limit({ key });
	if (!success) throw new HttpError(429, "rate_limited");
}

/** Writes by a player: per player, and per IP so that new players do not reset the limit. */
async function limitPlayerWrites(ctx: Ctx, player: PlayerRow): Promise<void> {
	await limit(ctx.env.ANSWER_LIMITER, `p:${player.id}`);
	await limit(ctx.env.IP_LIMITER, `ip:${clientIp(ctx)}`);
}

async function createPlayer(ctx: Ctx): Promise<Response> {
	await limit(ctx.env.PLAYER_LIMITER, `ip:${clientIp(ctx)}`);
	const token = randomToken();
	const tokenHash = await sha256Hex(token);
	for (let attempt = 0; attempt < 5; attempt++) {
		const publicId = randomId(8);
		try {
			await ctx.env.DB.prepare("INSERT INTO players (public_id, token_hash, created_at) VALUES (?, ?, ?)")
				.bind(publicId, tokenHash, new Date().toISOString())
				.run();
			return json({ token, publicId }, 201);
		} catch (error) {
			if (!String(error).includes("UNIQUE")) throw error;
		}
	}
	throw new HttpError(500, "id_exhausted");
}

interface PlayerAnswers {
	all: Stats;
	today: Stats;
	daily: DailyStats[];
	breakdown: Breakdown | null;
	history: Profile["history"];
}

const emptyStats = (): Stats => ({ answers: 0, scoreSum: 0, pitari: 0 });

const HISTORY_SIZE = 50;

/**
 * A player's stats counted from their answers (always up to date). `detail` adds the breakdown and
 * the recent answers (all of them, or the misses for the review list), read with the problems' current
 * kind and difficulty: the difficulty is never copied into answers, so a threshold change only
 * relabels the problems (generator.relabel).
 */
async function playerAnswers(db: D1Database, playerId: number, now: Date, detail = true, history: "all" | "miss" = "all"): Promise<PlayerAnswers> {
	const today = jstDate(now);
	const { results } = await db
		.prepare(
			detail
				? "SELECT a.id, a.problem_id, a.score, a.pitari, a.answered_at, a.jst_date, p.kind, p.difficulty FROM answers a JOIN problems p ON p.id = a.problem_id WHERE a.player_id = ?"
				: "SELECT id, problem_id, score, pitari, answered_at, jst_date FROM answers WHERE player_id = ?",
		)
		.bind(playerId)
		.all<{ id: number; problem_id: number; score: number; pitari: number; answered_at: string; jst_date: string } & Partial<Pick<ProblemRow, "kind" | "difficulty">>>();
	const all = emptyStats();
	const days = new Map<string, Stats>();
	const breakdown: Breakdown | null = detail
		? { kind: { discard: emptyStats(), riichi: emptyStats(), call: emptyStats() }, difficulty: { easy: emptyStats(), normal: emptyStats(), hard: emptyStats() } }
		: null;
	for (const r of results) {
		let day = days.get(r.jst_date);
		if (!day) days.set(r.jst_date, (day = emptyStats()));
		const counted = [all, day];
		if (breakdown && r.kind && r.difficulty) counted.push(breakdown.kind[r.kind], breakdown.difficulty[r.difficulty]);
		for (const stats of counted) {
			stats.answers++;
			stats.scoreSum += r.score;
			stats.pitari += r.pitari;
		}
	}
	const daily = [...days]
		.sort(([a], [b]) => a.localeCompare(b))
		.slice(-DAILY_CHART_DAYS)
		.map(([date, stats]) => ({ date, ...stats }));
	const recent = detail
		? results
				.filter((r) => history === "all" || isMiss(r.score, r.pitari === 1))
				.sort((a, b) => b.id - a.id)
				.slice(0, HISTORY_SIZE)
		: [];
	const historyItems = recent.map((r) => ({ id: r.problem_id, difficulty: r.difficulty ?? null, score: r.score, pitari: r.pitari === 1, answeredAt: r.answered_at }));
	return { all, today: days.get(today) ?? emptyStats(), daily, breakdown, history: historyItems };
}

async function getMe(ctx: Ctx): Promise<Response> {
	const player = await authenticate(ctx);
	const { all, today } = await playerAnswers(ctx.env.DB, player.id, new Date(), false);
	const me: Me = { publicId: player.public_id, name: player.name, all, today };
	return json(me);
}

async function putName(ctx: Ctx): Promise<Response> {
	const player = await authenticate(ctx);
	await limitPlayerWrites(ctx, player);
	const name = validateName((await readJson(ctx.request)).name);
	await ctx.env.DB.prepare("UPDATE players SET name = ? WHERE id = ?").bind(name, player.id).run();
	return json({ name });
}

// ---- problems ----

// Problems are added or relabelled (generator.relabel) rarely, so a few minutes of staleness is fine.
const PROBLEM_CACHE_TTL_MS = 10 * 60_000;
let problemCountCache: { count: number; expires: number } | null = null;

async function problemCount(db: D1Database): Promise<number> {
	if (problemCountCache && problemCountCache.expires > Date.now()) return problemCountCache.count;
	const count = (await db.prepare("SELECT MAX(id) AS n FROM problems").first<number>("n")) ?? 0;
	// An empty table (before the problems are loaded) is not remembered.
	problemCountCache = count ? { count, expires: Date.now() + PROBLEM_CACHE_TTL_MS } : null;
	return count;
}

async function loadProblem(db: D1Database, id: number): Promise<ProblemRow> {
	const row = await db.prepare("SELECT * FROM problems WHERE id = ?").bind(id).first<ProblemRow>();
	if (!row) throw new HttpError(404, "not_found");
	return row;
}

const toAnswer = (row: AnswerRow | null | undefined): AnswerResult | null =>
	row ? { action: row.action, score: row.score, pitari: row.pitari === 1 } : null;

async function loadAnswer(db: D1Database, playerId: number, problemId: number): Promise<AnswerResult | null> {
	const row = await db
		.prepare("SELECT action, score, pitari FROM answers WHERE player_id = ? AND problem_id = ?")
		.bind(playerId, problemId)
		.first<AnswerRow>();
	return toAnswer(row);
}

/** Logs contain the AI's actual actions, so only the player who answered can read them. */
async function getProblemLog(ctx: Ctx): Promise<Response> {
	const player = await authenticate(ctx);
	const id = positiveInt(ctx.params[0]);
	if (!(await loadAnswer(ctx.env.DB, player.id, id))) throw new HttpError(403, "answer_required");
	const log = await ctx.env.DB.prepare("SELECT tenhou_json FROM problem_logs WHERE problem_id = ?").bind(id).first<string>("tenhou_json");
	if (!log) throw new HttpError(404, "log_unavailable");
	return new Response(log, {
		headers: {
			"Content-Type": "application/json; charset=utf-8",
			"Cache-Control": "private, no-store",
			"X-Content-Type-Options": "nosniff",
		},
	});
}

/** The player's answers to the given problems (one index probe each). */
async function answersFor(db: D1Database, playerId: number, ids: number[]): Promise<Map<number, AnswerRow>> {
	const { results } = await db
		.prepare(`SELECT problem_id, action, score, pitari FROM answers WHERE player_id = ? AND problem_id IN (${ids.map(() => "?").join(",")})`)
		.bind(playerId, ...ids)
		.all<AnswerRow & { problem_id: number }>();
	return new Map(results.map((r) => [r.problem_id, r]));
}

function questionOf(row: ProblemRow): Question {
	return { id: row.id, kind: row.kind, scene: JSON.parse(row.scene), choices: JSON.parse(row.choices) };
}

async function resultOf(db: D1Database, player: PlayerRow, row: ProblemRow, answer: AnswerResult, sharerId: string | null): Promise<Result> {
	let sharer: Result["sharer"] = null;
	if (sharerId) {
		const found = await db
			.prepare(
				"SELECT p.public_id, p.name, a.action, a.score, a.pitari FROM players p JOIN answers a ON a.player_id = p.id AND a.problem_id = ? WHERE p.public_id = ?",
			)
			.bind(row.id, sharerId)
			.first<AnswerRow & { public_id: string; name: string | null }>();
		if (found) {
			sharer = {
				name: displayName(found.name, found.public_id),
				action: found.action,
				score: found.score,
				pitari: found.pitari === 1,
			};
		}
	}
	return {
		...questionOf(row),
		difficulty: row.difficulty,
		answer,
		evaluation: JSON.parse(row.evaluation),
		human:
			row.answer_count >= HUMAN_STATS_MIN_ANSWERS
				? { answers: row.answer_count, average: row.score_sum / row.answer_count }
				: null,
		sharer,
		playerName: displayName(player.name, player.public_id),
	};
}

const dailyLimitReached = (player: PlayerRow, today: string) =>
	player.assigned_day === today && player.assigned_count >= DAILY_ANSWER_LIMIT;

/**
 * Point the player's assignment at `problemId` unless it changed since it was read
 * (`current`) or today's assignments reached the daily limit. An assignment to an
 * answered problem counts as free: answering does not clear it, which saves a write
 * per answer. The same write counts today's assignments, which caps the answers.
 */
async function assign(db: D1Database, playerId: number, current: number | null, problemId: number): Promise<boolean> {
	const { meta } = await db
		.prepare(
			`UPDATE players SET current_problem_id = ?1,
			   assigned_count = CASE WHEN assigned_day = ?4 THEN assigned_count + 1 ELSE 1 END,
			   assigned_day = ?4
			 WHERE id = ?2 AND current_problem_id IS ?3 AND (assigned_day IS NOT ?4 OR assigned_count < ?5)`,
		)
		.bind(problemId, playerId, current, jstDate(new Date()), DAILY_ANSWER_LIMIT)
		.run();
	return meta.changes === 1;
}

/**
 * Assign the problem the player opened. Any problem can be opened at any time; a concurrent
 * assignment is retried once from the fresh row. Throws when the daily limit is reached.
 */
async function assignOpened(db: D1Database, player: PlayerRow, problemId: number): Promise<void> {
	const today = jstDate(new Date());
	if (player.current_problem_id === problemId) return;
	if (dailyLimitReached(player, today)) throw new HttpError(429, "daily_limit");
	if (await assign(db, player.id, player.current_problem_id, problemId)) return;
	const fresh = await loadPlayer(db, player.id);
	if (fresh?.current_problem_id === problemId) return;
	if (fresh && dailyLimitReached(fresh, today)) throw new HttpError(429, "daily_limit");
	if (!fresh || !(await assign(db, fresh.id, fresh.current_problem_id, problemId))) throw new HttpError(409, "conflict");
}

/** After a failed assignment: the problem another request assigned (still unanswered), or the daily limit. */
async function pendingAfterRace(db: D1Database, playerId: number): Promise<number> {
	const player = await loadPlayer(db, playerId);
	const pending = player && (await pendingProblem(db, player));
	if (pending !== null && pending !== undefined) return pending;
	if (player && dailyLimitReached(player, jstDate(new Date()))) throw new HttpError(429, "daily_limit");
	throw new HttpError(409, "conflict");
}

/** The assigned problem that still waits for an answer, if any. */
async function pendingProblem(db: D1Database, player: PlayerRow): Promise<number | null> {
	const id = player.current_problem_id;
	return id !== null && !(await loadAnswer(db, player.id, id)) ? id : null;
}

// ---- choosing the next problem ----

const THEME_FILTERS: Record<SetTheme, { column: "difficulty" | "kind"; value: string } | null> = {
	all: null,
	easy: { column: "difficulty", value: "easy" },
	normal: { column: "difficulty", value: "normal" },
	hard: { column: "difficulty", value: "hard" },
	discard: { column: "kind", value: "discard" },
	riichi: { column: "kind", value: "riichi" },
	call: { column: "kind", value: "call" },
};

function theme(text: string | null | undefined): SetTheme {
	if (!text || !Object.hasOwn(THEME_FILTERS, text)) throw new HttpError(404, "not_found");
	return text as SetTheme;
}

const themeSizeCache = new Map<SetTheme, { size: number; expires: number }>();

/** Number of problems in a theme. */
async function themeSize(db: D1Database, t: SetTheme): Promise<number> {
	const filter = THEME_FILTERS[t];
	if (!filter) return problemCount(db);
	const cached = themeSizeCache.get(t);
	if (cached && cached.expires > Date.now()) return cached.size;
	const size = (await db.prepare(`SELECT MAX(${filter.column}_pos) AS n FROM problems WHERE ${filter.column} = ?`).bind(filter.value).first<number>("n")) ?? 0;
	themeSizeCache.set(t, { size, expires: Date.now() + PROBLEM_CACHE_TTL_MS });
	return size;
}

/** A random problem of the theme the player has not answered, or null when all are answered. */
async function randomUnanswered(db: D1Database, playerId: number, t: SetTheme): Promise<number | null> {
	const filter = THEME_FILTERS[t];
	const size = await themeSize(db, t);
	if (!size) return null;
	const answered = db.prepare("SELECT 1 FROM answers WHERE player_id = ? AND problem_id = ?");
	for (let attempt = 0; attempt < 20; attempt++) {
		const position = randomInt(size);
		const id = filter
			? await db.prepare(`SELECT id FROM problems WHERE ${filter.column} = ? AND ${filter.column}_pos = ?`).bind(filter.value, position).first<number>("id")
			: position;
		if (id === null || id === undefined) continue; // a position in flux while problems are relabelled
		if (!(await answered.bind(playerId, id).first())) return id;
	}
	// Rare: the player has answered most problems of the theme.
	return db
		.prepare(
			`SELECT id FROM problems WHERE ${filter ? `${filter.column} = ? AND ` : ""}id NOT IN (SELECT problem_id FROM answers WHERE player_id = ?) ORDER BY random() LIMIT 1`,
		)
		.bind(...(filter ? [filter.value] : []), playerId)
		.first<number>("id");
}

/**
 * The first unanswered problem of the theme numbered above `after`, or null at the end. NOT INDEXED
 * keeps SQLite on the primary key (with a theme it would otherwise scan the theme's index and sort),
 * so it walks the problems from `after` and probes the player's answers until the first hit: a few rows.
 */
async function nextUnanswered(db: D1Database, playerId: number, t: SetTheme, after: number): Promise<number | null> {
	const filter = THEME_FILTERS[t];
	return db
		.prepare(
			`SELECT p.id FROM problems p NOT INDEXED LEFT JOIN answers a ON a.player_id = ?1 AND a.problem_id = p.id
			 WHERE p.id > ?2 ${filter ? `AND p.${filter.column} = ?3` : ""} AND a.problem_id IS NULL ORDER BY p.id LIMIT 1`,
		)
		.bind(playerId, after, ...(filter ? [filter.value] : []))
		.first<number>("id");
}

/**
 * The problem `choose` picks, assigned to the player. Random play first returns the pending problem
 * (the one opened last and left unanswered), so that a reload shows the same question; play in number
 * order asks for the problem after a given number and ignores the pending one.
 */
async function serveNext(ctx: Ctx, player: PlayerRow, choose: (db: D1Database) => Promise<number | null>, keepPending = true): Promise<Response> {
	const db = ctx.env.DB;
	let id = keepPending ? await pendingProblem(db, player) : null;
	if (id === null) {
		if (dailyLimitReached(player, jstDate(new Date()))) throw new HttpError(429, "daily_limit");
		id = await choose(db);
		if (id === null) return json({ state: "finished" } satisfies ProblemResponse);
		// Already assigned (a reload in number order): no write, no count against the daily limit.
		// Otherwise a concurrent request may have assigned another problem; show that one instead.
		if (id !== player.current_problem_id && !(await assign(db, player.id, player.current_problem_id, id))) id = await pendingAfterRace(db, player.id);
	}
	const question = questionOf(await loadProblem(db, id));
	return json({ state: "question", question } satisfies ProblemResponse);
}

async function getCurrent(ctx: Ctx): Promise<Response> {
	const player = await authenticate(ctx);
	const t = theme(ctx.url.searchParams.get("theme") ?? "all");
	return serveNext(ctx, player, (db) => randomUnanswered(db, player.id, t));
}

async function getNext(ctx: Ctx): Promise<Response> {
	const player = await authenticate(ctx);
	const t = theme(ctx.url.searchParams.get("theme") ?? "all");
	const after = Number(ctx.url.searchParams.get("after") ?? 0);
	if (!Number.isSafeInteger(after) || after < 0) throw new HttpError(400, "invalid_query");
	return serveNext(ctx, player, (db) => nextUnanswered(db, player.id, t, after), false);
}

async function getProblem(ctx: Ctx): Promise<Response> {
	const player = await authenticate(ctx);
	const db = ctx.env.DB;
	const id = positiveInt(ctx.params[0]);
	const row = await loadProblem(db, id);
	const answer = await loadAnswer(db, player.id, id);
	if (answer) {
		const result = await resultOf(db, player, row, answer, ctx.url.searchParams.get("from"));
		return json({ state: "result", result } satisfies ProblemResponse);
	}
	await assignOpened(db, player, id);
	return json({ state: "question", question: questionOf(row) } satisfies ProblemResponse);
}

async function postAnswer(ctx: Ctx): Promise<Response> {
	const player = await authenticate(ctx);
	await limitPlayerWrites(ctx, player);
	const id = positiveInt(ctx.params[0]);
	const action = (await readJson(ctx.request)).action;
	const db = ctx.env.DB;
	const row = await loadProblem(db, id);

	const sharerId = ctx.url.searchParams.get("from");
	const existing = await loadAnswer(db, player.id, id);
	if (existing) return json({ state: "result", result: await resultOf(db, player, row, existing, sharerId) } satisfies ProblemResponse);
	if (player.current_problem_id !== id) throw new HttpError(409, "not_assigned");
	const now = new Date();
	const choices: Choice[] = JSON.parse(row.choices);
	if (typeof action !== "string" || !choices.some((c) => c.action === action)) throw new HttpError(400, "invalid_action");

	const evaluation: Evaluation = JSON.parse(row.evaluation);
	const score = evaluation.candidates.find((c) => c.action === action)?.score ?? 0;
	const pitari = action === evaluation.best ? 1 : 0;
	// The only write of an answer; rankings and players' averages follow from aggregate().
	try {
		await db
			.prepare("INSERT INTO answers (player_id, problem_id, action, score, pitari, answered_at, jst_date) VALUES (?, ?, ?, ?, ?, ?, ?)")
			.bind(player.id, id, action, score, pitari, now.toISOString(), jstDate(now))
			.run();
	} catch (error) {
		// A concurrent submission already stored the answer; return that one.
		const stored = await loadAnswer(db, player.id, id);
		if (!stored) throw error;
		return json({ state: "result", result: await resultOf(db, player, row, stored, sharerId) } satisfies ProblemResponse);
	}
	// The tenth answer of a day's ten records the player's result, wherever the problem was opened.
	// Yesterday's ten (if it exists) still completes after midnight, as yesterday's result.
	for (const [day, create] of [[jstDate(now), true], [jstDate(new Date(now.getTime() - 24 * 3600_000)), false]] as const) {
		const ids = await dailySet(db, day, create);
		if (ids.includes(id)) await recordDaily(db, player.id, day, ids, await answersFor(db, player.id, ids), now);
	}
	const result = await resultOf(db, player, row, { action, score, pitari: pitari === 1 }, sharerId);
	return json({ state: "result", result } satisfies ProblemResponse);
}

// ---- today's ten ----
// The same ten problems for everyone on a Japan date: the least answered ones, chosen when the day is
// first requested (one scan of the problems per day) and kept in daily_sets. A player's completed ten
// is recorded once in daily_results, which the day's ranking reads.

const dailySetCache = new Map<string, number[]>();

/** The day's ten problem numbers; [] when the day has no set (and `create` is false, or too few problems exist). */
async function dailySet(db: D1Database, day: string, create = true): Promise<number[]> {
	const cached = dailySetCache.get(day);
	if (cached) return cached;
	const read = () => db.prepare("SELECT problem_ids FROM daily_sets WHERE day = ?").bind(day).first<string>("problem_ids");
	let stored = await read();
	if (!stored) {
		if (!create) {
			dailySetCache.set(day, []); // a past day without a set stays without one
			return [];
		}
		const { results } = await db.prepare("SELECT id FROM problems ORDER BY answer_count, random() LIMIT ?").bind(SET_SIZE).all<{ id: number }>();
		if (results.length < SET_SIZE) return []; // fewer problems than a set (before they are loaded)
		const chosen = results.map((r) => r.id).sort((a, b) => a - b);
		await db.prepare("INSERT OR IGNORE INTO daily_sets (day, problem_ids) VALUES (?, ?)").bind(day, JSON.stringify(chosen)).run();
		stored = (await read()) ?? JSON.stringify(chosen); // the row a concurrent request wrote first
	}
	const ids = JSON.parse(stored) as number[];
	// Today's and yesterday's sets are enough to keep.
	for (const key of dailySetCache.keys()) if (key < day && dailySetCache.size >= 2) dailySetCache.delete(key);
	dailySetCache.set(day, ids);
	return ids;
}

interface DailyRow {
	score_sum: number;
	pitari: number;
	completed_at: string;
}

/** Record the player's completed ten once (answers from any day count); null while problems remain. */
async function recordDaily(db: D1Database, playerId: number, day: string, ids: number[], answers: Map<number, AnswerRow>, now: Date): Promise<DailyRow | null> {
	if (ids.some((id) => !answers.has(id))) return null;
	const existing = await db
		.prepare("SELECT score_sum, pitari, completed_at FROM daily_results WHERE day = ? AND player_id = ?")
		.bind(day, playerId)
		.first<DailyRow>();
	if (existing) return existing;
	const rows = [...answers.values()];
	const row: DailyRow = {
		score_sum: rows.reduce((sum, a) => sum + a.score, 0),
		pitari: rows.reduce((sum, a) => sum + a.pitari, 0),
		completed_at: now.toISOString(),
	};
	await db
		.prepare("INSERT OR IGNORE INTO daily_results (day, player_id, score_sum, pitari, completed_at) VALUES (?, ?, ?, ?, ?)")
		.bind(day, playerId, row.score_sum, row.pitari, row.completed_at)
		.run();
	return row;
}

async function getDaily(ctx: Ctx): Promise<Response> {
	const player = await authenticate(ctx);
	const db = ctx.env.DB;
	const now = new Date();
	const day = jstDate(now);
	const ids = await dailySet(db, day);
	if (!ids.length) throw new HttpError(404, "not_found");
	const { results: rows } = await db
		.prepare(`SELECT id, difficulty FROM problems WHERE id IN (${ids.map(() => "?").join(",")})`)
		.bind(...ids)
		.all<Pick<SetProblem, "id" | "difficulty">>();
	const answers = await answersFor(db, player.id, ids);
	const problems: SetProblem[] = ids.map((id) => ({
		id,
		difficulty: rows.find((r) => r.id === id)?.difficulty ?? "normal",
		answer: toAnswer(answers.get(id)),
	}));
	const recorded = await recordDaily(db, player.id, day, ids, answers, now);
	const result: DailySet["result"] = recorded && { scoreSum: recorded.score_sum, pitari: recorded.pitari, completedAt: recorded.completed_at };
	return json({ day, problems, result, playerName: displayName(player.name, player.public_id) } satisfies DailySet);
}

// ---- problem sets ----
// A theme's sets are its problems in number order, ten at a time (full sets only).

const SETS_PER_PAGE = 100;

async function getSets(ctx: Ctx): Promise<Response> {
	const player = await authenticate(ctx);
	const db = ctx.env.DB;
	const t = theme(ctx.url.searchParams.get("theme") ?? "all");
	const totalSets = Math.floor((await themeSize(db, t)) / SET_SIZE);
	const page = Math.min(positiveInt(ctx.url.searchParams.get("page") ?? "1"), Math.max(1, Math.ceil(totalSets / SETS_PER_PAGE)));
	const filter = THEME_FILTERS[t];
	const first = (page - 1) * SETS_PER_PAGE + 1;
	const last = Math.min(first + SETS_PER_PAGE - 1, totalSets);
	const [from, to] = [(first - 1) * SET_SIZE + 1, last * SET_SIZE];
	// Counted from the answers of this page's problems; no per-set counters are written on answering.
	const { results } = await (filter
		? db
				.prepare(
					`SELECT p.${filter.column}_pos AS pos, a.score, a.pitari FROM problems p JOIN answers a ON a.player_id = ? AND a.problem_id = p.id
					 WHERE p.${filter.column} = ? AND p.${filter.column}_pos BETWEEN ? AND ?`,
				)
				.bind(player.id, filter.value, from, to)
		: db.prepare("SELECT problem_id AS pos, score, pitari FROM answers WHERE player_id = ? AND problem_id BETWEEN ? AND ?").bind(player.id, from, to)
	).all<{ pos: number; score: number; pitari: number }>();
	const bySet = new Map<number, SetSummary>();
	for (const r of results) {
		const set = setOf(r.pos);
		if (set < first || set > last) continue;
		const summary = bySet.get(set) ?? { set, answered: 0, scoreSum: 0, pitari: 0 };
		summary.answered++;
		summary.scoreSum += r.score;
		summary.pitari += r.pitari;
		bySet.set(set, summary);
	}
	return json({ theme: t, page, totalSets, setsPerPage: SETS_PER_PAGE, sets: [...bySet.values()] });
}

async function getSet(ctx: Ctx): Promise<Response> {
	const player = await authenticate(ctx);
	const db = ctx.env.DB;
	const t = theme(ctx.params[0]);
	const set = positiveInt(ctx.params[1]);
	if (set > Math.floor((await themeSize(db, t)) / SET_SIZE)) throw new HttpError(404, "not_found");
	const filter = THEME_FILTERS[t];
	const { results: entries } = await (filter
		? db
				.prepare(`SELECT id, difficulty FROM problems WHERE ${filter.column} = ? AND ${filter.column}_pos BETWEEN ? AND ? ORDER BY ${filter.column}_pos`)
				.bind(filter.value, (set - 1) * SET_SIZE + 1, set * SET_SIZE)
		: db.prepare("SELECT id, difficulty FROM problems WHERE id BETWEEN ? AND ? ORDER BY id").bind((set - 1) * SET_SIZE + 1, set * SET_SIZE)
	).all<Pick<SetProblem, "id" | "difficulty">>();
	const answers = await answersFor(
		db,
		player.id,
		entries.map((p) => p.id),
	);
	const problems: SetProblem[] = entries.map(({ id, difficulty }) => ({ id, difficulty, answer: toAnswer(answers.get(id)) }));
	return json({ theme: t, set, problems, playerName: displayName(player.name, player.public_id) });
}

// ---- public pages ----

/** Aggregated stats (up to 10 minutes old): at most DAILY_CHART_DAYS + 1 rows, whatever the player's history. */
async function aggregatedStats(db: D1Database, playerId: number, now: Date): Promise<Omit<PlayerAnswers, "breakdown" | "history">> {
	const today = jstDate(now);
	// In descending order 'all' comes before every date ('a' > digits), then the latest days.
	const { results } = await db
		.prepare("SELECT period, answers, score_sum, pitari FROM player_stats WHERE player_id = ? ORDER BY period DESC LIMIT ?")
		.bind(playerId, DAILY_CHART_DAYS + 1)
		.all<{ period: string; answers: number; score_sum: number; pitari: number }>();
	const stats = (row: (typeof results)[number] | undefined): Stats => ({ answers: row?.answers ?? 0, scoreSum: row?.score_sum ?? 0, pitari: row?.pitari ?? 0 });
	const days = results.filter((r) => r.period !== "all");
	return {
		all: stats(results.find((r) => r.period === "all")),
		today: stats(days.find((r) => r.period === today)),
		daily: days.reverse().map((r) => ({ date: r.period, ...stats(r) })),
	};
}

/**
 * The owner sees live stats and history counted from their answers (`?history=miss` lists the misses
 * only, for the review). Anyone else (a shared link) gets the aggregated stats only, so a popular page
 * never scans a long history.
 */
async function getProfile(ctx: Ctx): Promise<Response> {
	const db = ctx.env.DB;
	const player = await db.prepare(`SELECT ${PLAYER_COLUMNS} FROM players WHERE public_id = ?`).bind(ctx.params[0]).first<PlayerRow>();
	if (!player) throw new HttpError(404, "not_found");
	const viewer = ctx.request.headers.has("Authorization") ? await authenticate(ctx).catch(() => null) : null;
	const now = new Date();
	const history = ctx.url.searchParams.get("history") === "miss" ? "miss" : "all";
	const profile: Profile =
		viewer?.id === player.id
			? { publicId: player.public_id, name: player.name, ...(await playerAnswers(db, player.id, now, true, history)) }
			: { publicId: player.public_id, name: player.name, ...(await aggregatedStats(db, player.id, now)), breakdown: null, history: [] };
	return json(profile);
}

const RANKING_SIZE = 100;
const RANKING_TTL_MS = 60_000;
const rankingCache = new Map<string, { expires: number; entries: RankingEntry[] }>();
const RANKING_ORDER: Record<RankingAxis, string> = {
	answers: "s.answers DESC",
	average: "s.average DESC, s.answers DESC",
	pitari: "s.pitari_rate DESC, s.answers DESC",
};

/** All time: the aggregated stats by axis, with the answers by difficulty. */
async function allTimeRanking(db: D1Database, axis: RankingAxis): Promise<RankingEntry[]> {
	const qualified = axis === "answers" ? "" : "AND s.qualified = 1";
	const { results } = await db
		.prepare(
			`SELECT p.public_id, p.name, s.answers, s.average, s.pitari_rate, s.easy, s.normal, s.hard
			 FROM player_stats s JOIN players p ON p.id = s.player_id
			 WHERE s.period = 'all' ${qualified} ORDER BY ${RANKING_ORDER[axis]} LIMIT ${RANKING_SIZE}`,
		)
		.all<{ public_id: string; name: string | null; answers: number; average: number; pitari_rate: number; easy: number; normal: number; hard: number }>();
	const entries: RankingEntry[] = [];
	results.forEach((r, index) => {
		const value = axis === "answers" ? r.answers : axis === "average" ? r.average : r.pitari_rate;
		const previous = entries[index - 1];
		const rank = previous && previous.value === value ? previous.rank : index + 1;
		entries.push({ rank, publicId: r.public_id, name: r.name, answers: r.answers, value, mix: { easy: r.easy, normal: r.normal, hard: r.hard } });
	});
	return entries;
}

/** Today: the players who completed today's ten, by score, then pitari, then who finished first. */
async function todayRanking(db: D1Database, day: string): Promise<RankingEntry[]> {
	const { results } = await db
		.prepare(
			`SELECT p.public_id, p.name, r.score_sum, r.pitari, r.completed_at
			 FROM daily_results r JOIN players p ON p.id = r.player_id
			 WHERE r.day = ? ORDER BY r.score_sum DESC, r.pitari DESC, r.completed_at LIMIT ${RANKING_SIZE}`,
		)
		.bind(day)
		.all<{ public_id: string; name: string | null; score_sum: number; pitari: number; completed_at: string }>();
	return results.map((r, index) => ({
		rank: index + 1,
		publicId: r.public_id,
		name: r.name,
		answers: SET_SIZE,
		value: r.score_sum / SET_SIZE,
		mix: null,
		pitari: r.pitari,
		completedAt: r.completed_at,
	}));
}

async function getRanking(ctx: Ctx): Promise<Response> {
	const period = ctx.url.searchParams.get("period") as RankingPeriod;
	const axis = (ctx.url.searchParams.get("axis") ?? "answers") as RankingAxis;
	if (!(period === "all" || period === "today") || !Object.hasOwn(RANKING_ORDER, axis)) throw new HttpError(400, "invalid_query");
	const day = jstDate(new Date());
	const cacheKey = period === "all" ? `all:${axis}` : `today:${day}`;
	const cached = rankingCache.get(cacheKey);
	if (cached && cached.expires > Date.now()) return json({ period, axis, entries: cached.entries }, 200, "public, max-age=30");
	const entries = period === "all" ? await allTimeRanking(ctx.env.DB, axis) : await todayRanking(ctx.env.DB, day);
	rankingCache.set(cacheKey, { expires: Date.now() + RANKING_TTL_MS, entries });
	return json({ period, axis, entries }, 200, "public, max-age=30");
}
