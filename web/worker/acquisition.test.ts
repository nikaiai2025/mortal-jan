import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { route } from "./api";
import { collectArrival } from "./acquisition";
import { sha256Hex } from "./http";
import type { Session } from "../shared/types";

beforeAll(async () => {
	await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
	const choices = JSON.stringify([{ action: "d:1m" }, { action: "d:2m" }]);
	const evaluation = JSON.stringify({ best: "d:1m", candidates: [{ action: "d:1m", q: 0, p: 0.7, score: 100 }, { action: "d:2m", q: -1, p: 0.3, score: 43 }] });
	const insert = env.DB.prepare("INSERT INTO problems (id, kind, difficulty, scene, choices, evaluation, source, difficulty_pos, kind_pos) VALUES (?, 'discard', 'easy', '{}', ?, ?, '{}', ?, ?)");
	await env.DB.batch(Array.from({ length: 20 }, (_, i) => insert.bind(i + 1, choices, evaluation, i + 1, i + 1)));
});

let clients = 0;
const address = () => `192.0.2.${++clients}`;
const arrival = (visitorId = crypto.randomUUID(), content = "post-01") => ({ visitorId, source: "x", medium: "organic_social", campaign: "trial", content, landing: "/q/*" });
async function call<T = Record<string, unknown>>(now: string, path: string, session?: Session, body?: unknown, visitorId?: string, extra: Record<string, string> = {}) {
	vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(now));
	try {
		const url = new URL(`https://example.com${path}`);
		const response = await route(new Request(url, { method: body === undefined ? "GET" : "POST", headers: {
			Origin: url.origin, "CF-Connecting-IP": address(), ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
			...(visitorId ? { "X-Mortal-Visitor": visitorId } : {}), ...extra,
		}, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), env, url);
		return { status: response.status, body: response.status === 204 ? null : await response.json() as T };
	} finally { vi.useRealTimers(); }
}
const newPlayer = async (now: string) => (await call<Session>(now, "/api/players", undefined, {})).body!;
const playerId = (session: Session) => env.DB.prepare("SELECT id FROM players WHERE public_id = ?").bind(session.publicId).first<number>("id");
const totals = (content: string) => env.DB.prepare("SELECT SUM(new_visitors) AS visitors, SUM(converted_24h) AS converted, SUM(first_answers) AS answered, SUM(returned_7d) AS returned FROM acquisition_daily WHERE content = ?").bind(content).first();
async function answer(now: string, session: Session, id: number, visitorId: string, action = "d:1m") {
	await call(now, `/api/problems/${id}`, session);
	return call(now, `/api/problems/${id}/answer`, session, { action }, visitorId);
}

describe("acquisition counts from saved answers", () => {
	it("counts arrivals and first answers once; retries of an old answer are not return use", async () => {
		const start = "2026-10-01T01:00:00Z", a = arrival(undefined, "once"), session = await newPlayer(start);
		expect((await call(start, "/api/acquisition", undefined, a)).status).toBe(204);
		await call(start, "/api/acquisition", session, { ...a, source: "youtube", content: "changed" });
		expect((await answer("2026-10-01T02:00:00Z", session, 1, a.visitorId)).status).toBe(200);
		await call("2026-10-02T03:00:00Z", "/api/problems/1/answer", session, { action: "d:2m" }, a.visitorId);
		expect(await totals("once")).toEqual({ visitors: 1, converted: 1, answered: 1, returned: 0 });
		await answer("2026-10-08T02:00:00Z", session, 2, a.visitorId);
		await answer("2026-10-08T03:00:00Z", session, 3, a.visitorId);
		expect(await totals("once")).toEqual({ visitors: 1, converted: 1, answered: 1, returned: 1 });
		expect(await totals("changed")).toEqual({ visitors: null, converted: null, answered: null, returned: null });
	});
	it("removes returning players from new-visitor denominators, including an anonymous arrival", async () => {
		const session = await newPlayer("2026-09-20T01:00:00Z");
		await answer("2026-09-20T02:00:00Z", session, 1, crypto.randomUUID());
		const a = arrival(undefined, "existing");
		await call("2026-10-01T01:00:00Z", "/api/acquisition", undefined, a);
		await call("2026-10-01T01:00:00Z", "/api/acquisition", session, a);
		await answer("2026-10-01T02:00:00Z", session, 2, a.visitorId);
		expect(await totals("existing")).toEqual({ visitors: 0, converted: 0, answered: 0, returned: 0 });
	});
	it("retains first answers after 24h but excludes them from conversion, and excludes day 8 returns", async () => {
		const start = "2026-10-01T01:00:00Z", session = await newPlayer(start), a = arrival(undefined, "late");
		await call(start, "/api/acquisition", session, a);
		await answer("2026-10-02T01:00:01Z", session, 1, a.visitorId);
		await answer("2026-10-10T01:00:00Z", session, 2, a.visitorId);
		expect(await totals("late")).toEqual({ visitors: 1, converted: 0, answered: 1, returned: 0 });
	});
	it("does not treat invalid attempts as answers and does not count one player on two browsers", async () => {
		const start = "2026-10-01T01:00:00Z", session = await newPlayer(start), a = arrival(undefined, "invalid");
		await call(start, "/api/acquisition", session, a);
		expect((await answer(start, session, 1, a.visitorId, "d:9m")).status).toBe(400);
		expect(await totals("invalid")).toEqual({ visitors: 1, converted: 0, answered: 0, returned: 0 });
		const other = arrival(undefined, "second-browser");
		await call(start, "/api/acquisition", session, other);
		await answer("2026-10-01T02:00:00Z", session, 1, a.visitorId);
		expect(await totals("second-browser")).toEqual({ visitors: 0, converted: 0, answered: 0, returned: 0 });
		expect(await totals("invalid")).toEqual({ visitors: 1, converted: 1, answered: 1, returned: 0 });
	});
	it("keeps answer and scoring when the analytics write fails", async () => {
		const start = "2026-10-01T01:00:00Z", session = await newPlayer(start), a = arrival(undefined, "failure");
		await call(start, "/api/acquisition", session, a);
		await env.DB.prepare("CREATE TRIGGER fail_acquisition BEFORE UPDATE ON acquisition_visitors BEGIN SELECT RAISE(ABORT, 'test failure'); END").run();
		const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
		try {
			expect((await answer("2026-10-01T02:00:00Z", session, 1, a.visitorId)).body).toMatchObject({ state: "result", result: { answer: { score: 100 } } });
			expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM answers WHERE player_id = ?").bind(await playerId(session)).first<number>("n")).toBe(1);
			expect(log).toHaveBeenCalledWith("acquisition_answer_failed");
		} finally { await env.DB.prepare("DROP TRIGGER fail_acquisition").run(); log.mockRestore(); }
	});
	it("rejects cross-origin, oversized, invalid messages; exposes no public report", async () => {
		const now = "2026-10-01T01:00:00Z", a = arrival();
		expect((await call(now, "/api/acquisition", undefined, a, undefined, { Origin: "https://other.example" })).status).toBe(403);
		expect((await call(now, "/api/acquisition", undefined, { ...a, extra: "a".repeat(1025) })).status).toBe(413);
		expect((await call(now, "/api/acquisition", undefined, { ...a, visitorId: "invalid" })).status).toBe(400);
		expect((await call(now, "/api/acquisition")).status).toBe(404);
		expect((await call(now, "/api/acquisition/report")).status).toBe(404);
	});
	it("stores only hashed IDs and bounded labels, and uses the first-answer index", async () => {
		const a = arrival(undefined, "safe");
		await collectArrival(env.DB, { ...a, landing: "/u/private", referrer: "https://secret.example", token: "secret" }, null, new Date("2026-10-01T01:00:00Z"));
		const row = await env.DB.prepare("SELECT * FROM acquisition_visitors WHERE visitor_hash = ?").bind(await sha256Hex(a.visitorId)).first();
		expect(row).toMatchObject({ landing: "other", player_id: null });
		expect(JSON.stringify(row)).not.toMatch(/private|secret|referrer|token|visitorId/);
		const plan = await env.DB.prepare("EXPLAIN QUERY PLAN SELECT answered_at, jst_date FROM answers WHERE player_id = 1 ORDER BY answered_at, id LIMIT 1").all<{ detail: string }>();
		expect(plan.results.map(r => r.detail).join(" ")).toContain("answers_first_by_player");
	});
	it("keeps operator verification out of acquisition totals", async () => {
		const a = { ...arrival(undefined, "operator"), campaign: "internal-check" };
		await collectArrival(env.DB, a, null, new Date("2026-10-01T01:00:00Z"));
		expect(await totals("operator")).toEqual({ visitors: null, converted: null, answered: null, returned: null });
	});
});
