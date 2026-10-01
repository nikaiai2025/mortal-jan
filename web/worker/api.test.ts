import { SELF, applyD1Migrations, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import type { Me, ProblemResponse, Profile, Result, Session, SetProblem } from "../shared/types";
import { DAILY_ANSWER_LIMIT } from "../shared/rules";
import { aggregate, fold, readCursor } from "./aggregate";

declare global {
	namespace Cloudflare {
		interface Env {
			TEST_MIGRATIONS: { name: string; queries: string[] }[];
		}
	}
}

const PROBLEMS = 20;
// Every fixture problem: best "d:1m" (100), "d:2m" (63), "d:3m" (5).
const evaluation = {
	best: "d:1m",
	candidates: [
		{ action: "d:1m", q: 0, p: 0.6, score: 100 },
		{ action: "d:2m", q: -0.46, p: 0.38, score: 63 },
		{ action: "d:3m", q: -3, p: 0.02, score: 5 },
	],
};
const choices = [{ action: "d:1m" }, { action: "d:2m" }, { action: "d:3m" }];

beforeAll(async () => {
	await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
	// Odd numbers are easy, even numbers hard; all are discard problems.
	const insert = env.DB.prepare(
		"INSERT INTO problems (id, kind, difficulty, scene, choices, evaluation, source, difficulty_pos, kind_pos) VALUES (?, 'discard', ?, ?, ?, ?, '{}', ?, ?)",
	);
	await env.DB.batch(
		Array.from({ length: PROBLEMS }, (_, i) =>
			insert.bind(
				i + 1,
				i % 2 === 0 ? "easy" : "hard",
				JSON.stringify({ hand: ["1m", "2m", "3m"] }),
				JSON.stringify(choices),
				JSON.stringify(evaluation),
				Math.floor(i / 2) + 1,
				i + 1,
			),
		),
	);
});

async function call<T>(path: string, session?: Session, init: RequestInit = {}): Promise<{ status: number; body: T }> {
	const headers = new Headers(init.headers);
	if (session) headers.set("Authorization", `Bearer ${session.token}`);
	const response = await SELF.fetch(`https://example.com${path}`, { ...init, headers });
	return { status: response.status, body: (await response.json()) as T };
}

let clients = 0;
// Each test player comes from its own address so that the per-IP issue limit stays out of the way.
const newPlayer = async () =>
	(await call<Session>("/api/players", undefined, { method: "POST", headers: { "CF-Connecting-IP": `10.0.0.${++clients}` } })).body;
const today = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
const setStats = (session: Session, period: string, answers: number, scoreSum: number, pitari: number) =>
	env.DB.prepare(
		"INSERT INTO player_stats (player_id, period, answers, score_sum, pitari, qualified, average, pitari_rate) SELECT id, ?, ?, ?, ?, 0, 0, 0 FROM players WHERE public_id = ?",
	)
		.bind(period, answers, scoreSum, pitari, session.publicId)
		.run();
const statsRow = (session: Session, period: string) =>
	env.DB.prepare(
		"SELECT s.answers, s.qualified, s.average, s.pitari_rate FROM player_stats s JOIN players p ON p.id = s.player_id WHERE p.public_id = ? AND s.period = ?",
	)
		.bind(session.publicId, period)
		.first();
const answer = (session: Session, id: number, action: string, query = "") =>
	call<ProblemResponse>(`/api/problems/${id}/answer${query}`, session, { method: "POST", body: JSON.stringify({ action }) });
const result = (response: { body: ProblemResponse }): Result => {
	if (response.body.state !== "result") throw new Error(`expected a result, got ${response.body.state}`);
	return response.body.result;
};

describe("questions", () => {
	it("never include the evaluation before answering", async () => {
		const player = await newPlayer();
		const { body } = await call<ProblemResponse>("/api/problems/current", player);
		expect(body.state).toBe("question");
		expect(Object.keys(body.state === "question" ? body.question : {}).sort()).toEqual(["choices", "id", "kind", "scene"]);
	});

	it("keep the assigned problem until it is answered", async () => {
		const player = await newPlayer();
		const first = await call<ProblemResponse>("/api/problems/current", player);
		const again = await call<ProblemResponse>("/api/problems/current", player);
		expect(again.body).toEqual(first.body);
		const id = first.body.state === "question" ? first.body.question.id : 0;
		const other = (id % PROBLEMS) + 1;
		const locked = await call<ProblemResponse>(`/api/problems/${other}`, player);
		expect(locked.body).toEqual({ state: "locked", currentId: id });
	});

	it("reject an unknown player", async () => {
		const { status } = await call("/api/problems/current", { token: "nope", publicId: "x" });
		expect(status).toBe(401);
	});
});

describe("answers", () => {
	it("score by the evaluation and mark pitari only for the best action", async () => {
		const player = await newPlayer();
		await call(`/api/problems/3`, player);
		const best = result(await answer(player, 3, "d:1m"));
		expect(best.answer).toEqual({ action: "d:1m", score: 100, pitari: true });
		expect(best.evaluation.best).toBe("d:1m");

		await call(`/api/problems/4`, player);
		const second = result(await answer(player, 4, "d:2m"));
		expect(second.answer).toEqual({ action: "d:2m", score: 63, pitari: false });

		const me = (await call<Me>("/api/me", player)).body;
		expect(me.all).toEqual({ answers: 2, scoreSum: 163, pitari: 1 });
		expect(me.today).toEqual(me.all);
	});

	it("accept only the assigned problem and a legal action", async () => {
		const player = await newPlayer();
		expect((await answer(player, 5, "d:1m")).status).toBe(409);
		await call(`/api/problems/5`, player);
		expect((await answer(player, 5, "d:9p")).status).toBe(400);
	});

	it("record only the first answer", async () => {
		const player = await newPlayer();
		await call(`/api/problems/6`, player);
		result(await answer(player, 6, "d:3m"));
		const repeated = result(await answer(player, 6, "d:1m"));
		expect(repeated.answer).toEqual({ action: "d:3m", score: 5, pitari: false });
		expect((await call<Me>("/api/me", player)).body.all.answers).toBe(1);
	});

	it("show the sharer's answer to a friend who solved the same problem", async () => {
		const sharer = await newPlayer();
		await call(`/api/problems/7`, sharer);
		await answer(sharer, 7, "d:2m");
		const friend = await newPlayer();
		await call(`/api/problems/7?from=${sharer.publicId}`, friend);
		const solved = result(await answer(friend, 7, "d:1m", `?from=${sharer.publicId}`));
		expect(solved.sharer).toMatchObject({ action: "d:2m", score: 63, pitari: false });
		// Each result names its own player for the share image.
		expect(solved.playerName).toBe(`名無し#${friend.publicId}`);
	});

	it("give concurrent requests the same assigned problem", async () => {
		const player = await newPlayer();
		const responses = await Promise.all(Array.from({ length: 5 }, () => call<ProblemResponse>("/api/problems/current", player)));
		const ids = responses.map((r) => (r.body.state === "question" ? r.body.question.id : r.body.state));
		expect(new Set(ids).size).toBe(1);
	});

	it("give the next random problem once the current one is answered", async () => {
		const player = await newPlayer();
		const first = await call<ProblemResponse>("/api/problems/current", player);
		const id = first.body.state === "question" ? first.body.question.id : 0;
		await answer(player, id, "d:1m");
		const next = await call<ProblemResponse>("/api/problems/current", player);
		expect(next.body.state).toBe("question");
		expect(next.body.state === "question" && next.body.question.id).not.toBe(id);
	});

	it("free the assignment once answered", async () => {
		const player = await newPlayer();
		await call(`/api/problems/13`, player);
		await answer(player, 13, "d:1m");
		const next = await call<ProblemResponse>(`/api/problems/14`, player);
		expect(next.body.state).toBe("question");
	});
});

describe("problem sets", () => {
	type SetBody = { problems: SetProblem[] };

	it("chunk all problems by number", async () => {
		const player = await newPlayer();
		await call(`/api/problems/12`, player);
		await answer(player, 12, "d:1m");
		const set = await call<SetBody>("/api/sets/all/2", player);
		expect(set.body.problems.map((p) => p.id)).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
		expect(set.body.problems.map((p) => p.difficulty)).toEqual(["easy", "hard", "easy", "hard", "easy", "hard", "easy", "hard", "easy", "hard"]);
		expect(set.body.problems[1].answer).toEqual({ action: "d:1m", score: 100, pitari: true });
		const sets = await call<{ totalSets: number; sets: unknown[] }>("/api/sets?theme=all&page=1", player);
		expect(sets.body.totalSets).toBe(2);
		expect(sets.body.sets).toEqual([{ set: 2, answered: 1, scoreSum: 100, pitari: 1 }]);
	});

	it("chunk a theme's problems in number order", async () => {
		const player = await newPlayer();
		const easy = await call<SetBody>("/api/sets/easy/1", player);
		expect(easy.body.problems.map((p) => p.id)).toEqual([1, 3, 5, 7, 9, 11, 13, 15, 17, 19]);
		expect(easy.body.problems.every((p) => p.difficulty === "easy")).toBe(true);
		await call(`/api/problems/5`, player);
		await answer(player, 5, "d:2m");
		const sets = await call<{ totalSets: number; sets: unknown[] }>("/api/sets?theme=easy", player);
		expect(sets.body).toMatchObject({ totalSets: 1, sets: [{ set: 1, answered: 1, scoreSum: 63, pitari: 0 }] });
		expect((await call("/api/sets/call/1", player)).status).toBe(404);
		expect((await call("/api/sets/unknown/1", player)).status).toBe(404);
	});
});

describe("names", () => {
	it("validate and store the ranking name", async () => {
		const player = await newPlayer();
		const put = (name: unknown) => call<{ name?: string; error?: string }>("/api/me/name", player, { method: "PUT", body: JSON.stringify({ name }) });
		expect((await put("  麻雀太郎  ")).body).toEqual({ name: "麻雀太郎" });
		expect((await put("あ".repeat(13))).body).toEqual({ error: "name_too_long" });
		expect((await put("運営です")).body).toEqual({ error: "name_ng" });
		expect((await put("ホシネ")).body).toEqual({ name: "ホシネ" });
		expect((await put("")).body).toEqual({ name: null });
	});
});

describe("ranking", () => {
	it("lists average and pitari rate only for players with enough answers", async () => {
		const [few, many] = [await newPlayer(), await newPlayer()];
		const stats = env.DB.prepare(
			"INSERT INTO player_stats (player_id, period, answers, score_sum, pitari, qualified, average, pitari_rate) SELECT id, 'all', ?, ?, ?, ?, ?, ? FROM players WHERE public_id = ?",
		);
		await env.DB.batch([stats.bind(10, 1000, 10, 0, 100, 1, few.publicId), stats.bind(60, 4800, 30, 1, 80, 0.5, many.publicId)]);
		const average = await call<{ entries: { publicId: string; value: number }[] }>("/api/ranking?period=all&axis=average");
		expect(average.body.entries.map((e) => e.publicId)).toContain(many.publicId);
		expect(average.body.entries.map((e) => e.publicId)).not.toContain(few.publicId);
		expect((await call("/api/ranking?period=week&axis=average")).status).toBe(400);
		expect((await call("/api/ranking?period=all&axis=toString")).status).toBe(400);
	});

	it("qualifies a player with the answer that reaches the minimum", async () => {
		const player = await newPlayer();
		await setStats(player, "all", 49, 4900, 10);
		await setStats(player, today(), 9, 900, 3);
		await call("/api/problems/8", player);
		await answer(player, 8, "d:2m"); // 63 points, not pitari
		await aggregate(env.DB);
		expect(await statsRow(player, "all")).toEqual({ answers: 50, qualified: 1, average: 4963 / 50, pitari_rate: 10 / 50 });
		expect(await statsRow(player, today())).toEqual({ answers: 10, qualified: 1, average: 963 / 10, pitari_rate: 3 / 10 });
	});

	it("keeps a player below the minimum out of the ranking", async () => {
		const player = await newPlayer();
		await setStats(player, "all", 48, 4800, 0);
		await call("/api/problems/9", player);
		await answer(player, 9, "d:1m");
		await aggregate(env.DB);
		expect(await statsRow(player, "all")).toEqual({ answers: 49, qualified: 0, average: 4900 / 49, pitari_rate: 1 / 49 });
	});
});

describe("aggregation", () => {
	it("folds each answer into the stats and the problem's counters exactly once", async () => {
		const player = await newPlayer();
		for (const [id, action] of [[15, "d:1m"], [16, "d:2m"]] as const) {
			await call(`/api/problems/${id}`, player);
			await answer(player, id, action);
		}
		const before = await env.DB.prepare("SELECT answer_count, score_sum FROM problems WHERE id = 16").first();
		const cursor = await readCursor(env.DB);
		await aggregate(env.DB);
		expect(await aggregate(env.DB)).toBe(0);
		// A run that overlapped (still holding the old cursor) must not add the same answers again.
		await fold(env.DB, cursor, await readCursor(env.DB));
		expect(await statsRow(player, "all")).toMatchObject({ answers: 2, average: 163 / 2, pitari_rate: 1 / 2 });
		const after = await env.DB.prepare("SELECT answer_count, score_sum FROM problems WHERE id = 16").first<{ answer_count: number; score_sum: number }>();
		expect(after).toEqual({ answer_count: (before?.answer_count as number) + 1, score_sum: (before?.score_sum as number) + 63 });
	});

	it("shows a player's own stats before the aggregation runs, and others the aggregated ones", async () => {
		const player = await newPlayer();
		await call("/api/problems/17", player);
		await answer(player, 17, "d:1m");
		const me = (await call<Me>("/api/me", player)).body;
		expect(me.all).toEqual({ answers: 1, scoreSum: 100, pitari: 1 });
		const own = (await call<Profile>(`/api/players/${player.publicId}`, player)).body;
		expect(own.history).toHaveLength(1);
		expect(own.history[0]).toMatchObject({ id: 17, difficulty: "easy", score: 100, pitari: true });
		const shared = (await call<{ all: { answers: number }; history: unknown[] }>(`/api/players/${player.publicId}`)).body;
		expect(shared).toMatchObject({ all: { answers: 0 }, history: [] });
		await aggregate(env.DB);
		expect((await call<{ all: { answers: number } }>(`/api/players/${player.publicId}`)).body.all.answers).toBe(1);
	});

	it("breaks the owner's stats down by the problems' current kind and difficulty", async () => {
		const player = await newPlayer();
		for (const [id, action] of [[11, "d:1m"], [12, "d:2m"]] as const) {
			await call(`/api/problems/${id}`, player);
			await answer(player, id, action);
		}
		const breakdown = async () => (await call<Profile>(`/api/players/${player.publicId}`, player)).body.breakdown;
		expect(await breakdown()).toMatchObject({
			kind: { discard: { answers: 2, scoreSum: 163, pitari: 1 }, call: { answers: 0 } },
			difficulty: { easy: { answers: 1, scoreSum: 100, pitari: 1 }, normal: { answers: 0 }, hard: { answers: 1, scoreSum: 63, pitari: 0 } },
		});
		// Relabelling a problem (generator.relabel) moves its answers; nothing else stores the difficulty.
		await env.DB.prepare("UPDATE problems SET difficulty = 'normal' WHERE id = 12").run();
		expect((await breakdown())?.difficulty).toMatchObject({ normal: { answers: 1, scoreSum: 63 }, hard: { answers: 0 } });
		await env.DB.prepare("UPDATE problems SET difficulty = 'hard' WHERE id = 12").run();
		expect((await call<Profile>(`/api/players/${player.publicId}`)).body.breakdown).toBeNull();
	});

	it("lists the days with answers, oldest first: live for the owner, aggregated for others", async () => {
		const player = await newPlayer();
		await call("/api/problems/17", player);
		await answer(player, 17, "d:1m");
		const own = (await call<Profile>(`/api/players/${player.publicId}`, player)).body;
		expect(own.daily).toEqual([{ date: today(), answers: 1, scoreSum: 100, pitari: 1 }]);
		await aggregate(env.DB);
		await setStats(player, "2026-01-02", 4, 250, 1);
		const shared = (await call<Profile>(`/api/players/${player.publicId}`)).body;
		expect(shared.daily).toEqual([
			{ date: "2026-01-02", answers: 4, scoreSum: 250, pitari: 1 },
			{ date: today(), answers: 1, scoreSum: 100, pitari: 1 },
		]);
		expect(shared.all.answers).toBe(1);
	});
});

describe("daily limit", () => {
	const setAssigned = (session: Session, day: string, count: number) =>
		env.DB.prepare("UPDATE players SET assigned_day = ?, assigned_count = ? WHERE public_id = ?").bind(day, count, session.publicId).run();

	it("stops assigning new problems after the daily limit, and starts again the next day", async () => {
		const player = await newPlayer();
		await setAssigned(player, today(), DAILY_ANSWER_LIMIT - 1);
		expect((await call("/api/problems/10", player)).body).toMatchObject({ state: "question" }); // the last one today
		expect((await answer(player, 10, "d:1m")).status).toBe(200);
		for (const path of ["/api/problems/current", "/api/problems/18"]) {
			const response = await call(path, player);
			expect(response.status).toBe(429);
			expect(response.body).toEqual({ error: "daily_limit" });
		}
		expect((await call("/api/problems/10", player)).body).toMatchObject({ state: "result" }); // answered ones stay viewable
		await setAssigned(player, "2026-01-01", DAILY_ANSWER_LIMIT);
		expect((await call("/api/problems/18", player)).body).toMatchObject({ state: "question" });
	});
});
