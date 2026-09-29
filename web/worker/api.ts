import {
	DAILY_ANSWER_LIMIT,
	HUMAN_STATS_MIN_ANSWERS,
	RANKING_MIN_ANSWERS,
	SET_SIZE,
	displayName,
	jstDate,
	setOf,
} from "../shared/rules";
import type {
	AnswerResult,
	Choice,
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

interface PlayerRow {
	id: number;
	public_id: string;
	name: string | null;
	current_problem_id: number | null;
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
	["GET", /^\/api\/problems\/(\d+)$/, getProblem],
	["POST", /^\/api\/problems\/(\d+)\/answer$/, postAnswer],
	["GET", /^\/api\/sets$/, getSets],
	["GET", /^\/api\/sets\/(\d+)$/, getSet],
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
	const player = await ctx.env.DB.prepare(
		"SELECT id, public_id, name, current_problem_id FROM players WHERE token_hash = ?",
	)
		.bind(await sha256Hex(token))
		.first<PlayerRow>();
	if (!player) throw new HttpError(401, "unauthorized");
	return player;
}

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

async function statsOf(db: D1Database, playerId: number, now: Date): Promise<{ all: Stats; today: Stats }> {
	const today = jstDate(now);
	const { results } = await db
		.prepare("SELECT period, answers, score_sum, pitari FROM player_stats WHERE player_id = ? AND period IN ('all', ?)")
		.bind(playerId, today)
		.all<{ period: string; answers: number; score_sum: number; pitari: number }>();
	const pick = (period: string): Stats => {
		const row = results.find((r) => r.period === period);
		return { answers: row?.answers ?? 0, scoreSum: row?.score_sum ?? 0, pitari: row?.pitari ?? 0 };
	};
	return { all: pick("all"), today: pick(today) };
}

async function getMe(ctx: Ctx): Promise<Response> {
	const player = await authenticate(ctx);
	const me: Me = { publicId: player.public_id, name: player.name, ...(await statsOf(ctx.env.DB, player.id, new Date())) };
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

let problemCountCache: number | null = null;

async function problemCount(db: D1Database): Promise<number> {
	problemCountCache ??= (await db.prepare("SELECT MAX(id) AS n FROM problems").first<number>("n")) ?? 0;
	return problemCountCache;
}

async function loadProblem(db: D1Database, id: number): Promise<ProblemRow> {
	const row = await db.prepare("SELECT * FROM problems WHERE id = ?").bind(id).first<ProblemRow>();
	if (!row) throw new HttpError(404, "not_found");
	return row;
}

async function loadAnswer(db: D1Database, playerId: number, problemId: number): Promise<AnswerResult | null> {
	const row = await db
		.prepare("SELECT action, score, pitari FROM answers WHERE player_id = ? AND problem_id = ?")
		.bind(playerId, problemId)
		.first<AnswerRow>();
	return row && { action: row.action, score: row.score, pitari: row.pitari === 1 };
}

function questionOf(row: ProblemRow): Question {
	return { id: row.id, kind: row.kind, scene: JSON.parse(row.scene), choices: JSON.parse(row.choices) };
}

async function resultOf(db: D1Database, row: ProblemRow, answer: AnswerResult, sharerId: string | null): Promise<Result> {
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
	};
}

/** Assign a problem unless another one got assigned meanwhile. */
async function assign(db: D1Database, playerId: number, problemId: number): Promise<void> {
	await db
		.prepare("UPDATE players SET current_problem_id = ?1 WHERE id = ?2 AND (current_problem_id IS NULL OR current_problem_id = ?1)")
		.bind(problemId, playerId)
		.run();
}

async function release(db: D1Database, playerId: number, problemId: number): Promise<void> {
	await db.prepare("UPDATE players SET current_problem_id = NULL WHERE id = ? AND current_problem_id = ?").bind(playerId, problemId).run();
}

/** A random problem the player has not answered, or null when all are answered. */
async function randomUnanswered(db: D1Database, playerId: number): Promise<number | null> {
	const count = await problemCount(db);
	const answered = db.prepare("SELECT 1 FROM answers WHERE player_id = ? AND problem_id = ?");
	for (let attempt = 0; attempt < 20; attempt++) {
		const id = randomInt(count);
		if (!(await answered.bind(playerId, id).first())) return id;
	}
	// Rare: the player has answered most problems.
	return db
		.prepare(
			"SELECT id FROM problems WHERE id NOT IN (SELECT problem_id FROM answers WHERE player_id = ?) ORDER BY random() LIMIT 1",
		)
		.bind(playerId)
		.first<number>("id");
}

async function getCurrent(ctx: Ctx): Promise<Response> {
	const player = await authenticate(ctx);
	let id = player.current_problem_id;
	if (id !== null && (await loadAnswer(ctx.env.DB, player.id, id))) {
		// The assignment points at an answered problem (a lost race); move on.
		await release(ctx.env.DB, player.id, id);
		id = null;
	}
	if (id === null) {
		id = await randomUnanswered(ctx.env.DB, player.id);
		if (id === null) return json({ state: "finished" } satisfies ProblemResponse);
		await assign(ctx.env.DB, player.id, id);
	}
	const question = questionOf(await loadProblem(ctx.env.DB, id));
	return json({ state: "question", question } satisfies ProblemResponse);
}

async function getProblem(ctx: Ctx): Promise<Response> {
	const player = await authenticate(ctx);
	const id = positiveInt(ctx.params[0]);
	const row = await loadProblem(ctx.env.DB, id);
	const answer = await loadAnswer(ctx.env.DB, player.id, id);
	if (answer) {
		if (player.current_problem_id === id) await release(ctx.env.DB, player.id, id);
		const result = await resultOf(ctx.env.DB, row, answer, ctx.url.searchParams.get("from"));
		return json({ state: "result", result } satisfies ProblemResponse);
	}
	if (player.current_problem_id !== null && player.current_problem_id !== id) {
		return json({ state: "locked", currentId: player.current_problem_id } satisfies ProblemResponse);
	}
	if (player.current_problem_id !== id) await assign(ctx.env.DB, player.id, id);
	return json({ state: "question", question: questionOf(row) } satisfies ProblemResponse);
}

const statsUpsert = `
INSERT INTO player_stats (player_id, period, answers, score_sum, pitari, qualified, average, pitari_rate)
VALUES (?1, ?2, 1, ?3, ?4, 1 >= ?5, ?3, ?4)
ON CONFLICT (player_id, period) DO UPDATE SET
  answers = answers + 1,
  score_sum = score_sum + ?3,
  pitari = pitari + ?4,
  qualified = answers + 1 >= ?5,
  average = CAST(score_sum + ?3 AS REAL) / (answers + 1),
  pitari_rate = CAST(pitari + ?4 AS REAL) / (answers + 1)`;

const setUpsert = `
INSERT INTO player_sets (player_id, set_no, answered, score_sum, pitari) VALUES (?1, ?2, 1, ?3, ?4)
ON CONFLICT (player_id, set_no) DO UPDATE SET
  answered = answered + 1, score_sum = score_sum + ?3, pitari = pitari + ?4`;

async function postAnswer(ctx: Ctx): Promise<Response> {
	const player = await authenticate(ctx);
	await limitPlayerWrites(ctx, player);
	const id = positiveInt(ctx.params[0]);
	const action = (await readJson(ctx.request)).action;
	const db = ctx.env.DB;
	const row = await loadProblem(db, id);

	const sharerId = ctx.url.searchParams.get("from");
	const existing = await loadAnswer(db, player.id, id);
	if (existing) {
		if (player.current_problem_id === id) await release(db, player.id, id);
		return json({ state: "result", result: await resultOf(db, row, existing, sharerId) } satisfies ProblemResponse);
	}
	if (player.current_problem_id !== id) throw new HttpError(409, "not_assigned");
	const now = new Date();
	const answeredToday = await db
		.prepare("SELECT answers FROM player_stats WHERE player_id = ? AND period = ?")
		.bind(player.id, jstDate(now))
		.first<number>("answers");
	if ((answeredToday ?? 0) >= DAILY_ANSWER_LIMIT) throw new HttpError(429, "daily_limit");
	const choices: Choice[] = JSON.parse(row.choices);
	if (typeof action !== "string" || !choices.some((c) => c.action === action)) throw new HttpError(400, "invalid_action");

	const evaluation: Evaluation = JSON.parse(row.evaluation);
	const score = evaluation.candidates.find((c) => c.action === action)?.score ?? 0;
	const pitari = action === evaluation.best ? 1 : 0;
	try {
		await db.batch([
			db
				.prepare("INSERT INTO answers (player_id, problem_id, action, score, pitari, answered_at) VALUES (?, ?, ?, ?, ?, ?)")
				.bind(player.id, id, action, score, pitari, now.toISOString()),
			db.prepare(statsUpsert).bind(player.id, "all", score, pitari, RANKING_MIN_ANSWERS.all),
			db.prepare(statsUpsert).bind(player.id, jstDate(now), score, pitari, RANKING_MIN_ANSWERS.today),
			db.prepare(setUpsert).bind(player.id, setOf(id), score, pitari),
			db.prepare("UPDATE problems SET answer_count = answer_count + 1, score_sum = score_sum + ? WHERE id = ?").bind(score, id),
			db.prepare("UPDATE players SET current_problem_id = NULL WHERE id = ? AND current_problem_id = ?").bind(player.id, id),
		]);
	} catch (error) {
		// A concurrent submission already stored the answer; return that one.
		const stored = await loadAnswer(db, player.id, id);
		if (!stored) throw error;
		return json({ state: "result", result: await resultOf(db, row, stored, sharerId) } satisfies ProblemResponse);
	}
	const updated = { ...row, answer_count: row.answer_count + 1, score_sum: row.score_sum + score };
	const result = await resultOf(db, updated, { action, score, pitari: pitari === 1 }, sharerId);
	return json({ state: "result", result } satisfies ProblemResponse);
}

// ---- problem sets ----

const SETS_PER_PAGE = 100;

async function getSets(ctx: Ctx): Promise<Response> {
	const player = await authenticate(ctx);
	const totalSets = Math.ceil((await problemCount(ctx.env.DB)) / SET_SIZE);
	const page = Math.min(positiveInt(ctx.url.searchParams.get("page") ?? "1"), Math.max(1, Math.ceil(totalSets / SETS_PER_PAGE)));
	const first = (page - 1) * SETS_PER_PAGE + 1;
	const { results } = await ctx.env.DB.prepare(
		"SELECT set_no, answered, score_sum, pitari FROM player_sets WHERE player_id = ? AND set_no BETWEEN ? AND ?",
	)
		.bind(player.id, first, first + SETS_PER_PAGE - 1)
		.all<{ set_no: number; answered: number; score_sum: number; pitari: number }>();
	const sets: SetSummary[] = results.map((r) => ({
		set: r.set_no,
		answered: r.answered,
		scoreSum: r.score_sum,
		pitari: r.pitari,
	}));
	return json({ page, totalSets, setsPerPage: SETS_PER_PAGE, sets });
}

async function getSet(ctx: Ctx): Promise<Response> {
	const player = await authenticate(ctx);
	const set = positiveInt(ctx.params[0]);
	const count = await problemCount(ctx.env.DB);
	const first = (set - 1) * SET_SIZE + 1;
	if (first > count) throw new HttpError(404, "not_found");
	const last = Math.min(first + SET_SIZE - 1, count);
	const { results } = await ctx.env.DB.prepare(
		"SELECT problem_id, action, score, pitari FROM answers WHERE player_id = ? AND problem_id BETWEEN ? AND ?",
	)
		.bind(player.id, first, last)
		.all<AnswerRow & { problem_id: number }>();
	const problems: SetProblem[] = [];
	for (let id = first; id <= last; id++) {
		const row = results.find((r) => r.problem_id === id);
		problems.push({ id, answer: row ? { action: row.action, score: row.score, pitari: row.pitari === 1 } : null });
	}
	return json({ set, problems });
}

// ---- public pages ----

async function getProfile(ctx: Ctx): Promise<Response> {
	const db = ctx.env.DB;
	const player = await db
		.prepare("SELECT id, public_id, name, current_problem_id FROM players WHERE public_id = ?")
		.bind(ctx.params[0])
		.first<PlayerRow>();
	if (!player) throw new HttpError(404, "not_found");
	const { results } = await db
		.prepare(
			"SELECT problem_id, score, pitari, answered_at FROM answers WHERE player_id = ? ORDER BY answered_at DESC LIMIT 50",
		)
		.bind(player.id)
		.all<{ problem_id: number; score: number; pitari: number; answered_at: string }>();
	const profile: Profile = {
		publicId: player.public_id,
		name: player.name,
		...(await statsOf(db, player.id, new Date())),
		history: results.map((r) => ({ id: r.problem_id, score: r.score, pitari: r.pitari === 1, answeredAt: r.answered_at })),
	};
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

async function getRanking(ctx: Ctx): Promise<Response> {
	const period = ctx.url.searchParams.get("period") as RankingPeriod;
	const axis = ctx.url.searchParams.get("axis") as RankingAxis;
	if (!(period === "all" || period === "today") || !Object.hasOwn(RANKING_ORDER, axis)) throw new HttpError(400, "invalid_query");
	const key = period === "all" ? "all" : jstDate(new Date());
	const cacheKey = `${key}:${axis}`;
	const cached = rankingCache.get(cacheKey);
	if (cached && cached.expires > Date.now()) return json({ period, axis, entries: cached.entries }, 200, "public, max-age=30");

	const qualified = axis === "answers" ? "" : "AND s.qualified = 1";
	const { results } = await ctx.env.DB.prepare(
		`SELECT p.public_id, p.name, s.answers, s.average, s.pitari_rate
		 FROM player_stats s JOIN players p ON p.id = s.player_id
		 WHERE s.period = ? ${qualified} ORDER BY ${RANKING_ORDER[axis]} LIMIT ${RANKING_SIZE}`,
	)
		.bind(key)
		.all<{ public_id: string; name: string | null; answers: number; average: number; pitari_rate: number }>();
	const entries: RankingEntry[] = [];
	results.forEach((r, index) => {
		const value = axis === "answers" ? r.answers : axis === "average" ? r.average : r.pitari_rate;
		const previous = entries[index - 1];
		const rank = previous && previous.value === value ? previous.rank : index + 1;
		entries.push({ rank, publicId: r.public_id, name: r.name, answers: r.answers, value });
	});
	rankingCache.set(cacheKey, { expires: Date.now() + RANKING_TTL_MS, entries });
	return json({ period, axis, entries }, 200, "public, max-age=30");
}
