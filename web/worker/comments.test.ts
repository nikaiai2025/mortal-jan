import { SELF, applyD1Migrations, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import type { Comment, CommentsResponse, Session } from "../shared/types";

beforeAll(async () => {
	await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
	await env.DB.batch([1, 2].map(id => env.DB.prepare("INSERT INTO problems (id, kind, difficulty, scene, choices, evaluation, source, difficulty_pos, kind_pos) VALUES (?, 'discard', 'easy', '{}', '[]', '{}', '{}', ?, ?)").bind(id, id, id)));
});

let clients = 0;
async function player(): Promise<Session> {
	return (await SELF.fetch("https://example.com/api/players", { method: "POST", headers: { "CF-Connecting-IP": `10.72.0.${++clients}` } })).json();
}
async function post(session: Session, body: unknown, problem = 1): Promise<Response> {
	return SELF.fetch(`https://example.com/api/problems/${problem}/comments`, {
		method: "POST", headers: { Authorization: `Bearer ${session.token}`, "CF-Connecting-IP": `10.73.0.${clients}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
	});
}
async function list(query = ""): Promise<CommentsResponse> {
	return (await SELF.fetch(`https://example.com/api/comments${query}`)).json();
}

describe("comments board", () => {
	it("authenticates posts and snapshots the name on the server, without requiring an answer", async () => {
		expect((await SELF.fetch("https://example.com/api/problems/1/comments", { method: "POST", body: '{"body":"hello"}' })).status).toBe(401);
		const session = await player();
		await env.DB.prepare("UPDATE players SET name = '投稿時の名前' WHERE public_id = ?").bind(session.publicId).run();
		const response = await post(session, { body: "  一行目\r\n二行目  ", name: "偽名", playerId: 999, problemId: 2 });
		expect(response.status).toBe(201);
		const comment = await response.json<Comment>();
		expect(comment).toMatchObject({ problemId: 1, body: "一行目\n二行目", player: { name: "投稿時の名前", publicId: session.publicId } });
		expect(Number.isNaN(Date.parse(comment.createdAt))).toBe(false);
		await env.DB.prepare("UPDATE players SET name = '変更後の名前' WHERE public_id = ?").bind(session.publicId).run();
		expect((await list()).comments[0]).toEqual(comment);
		expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM answers").first("n")).toBe(0);
	});
	it("rejects blank, invalid, oversized and nonexistent-problem posts", async () => {
		for (const body of [" \n\t", "a\u0000b", 1, null]) expect((await post(await player(), { body })).status).toBe(400);
		expect((await post(await player(), { body: "あ".repeat(1001) })).status).toBe(400);
		expect((await post(await player(), { body: "あ".repeat(20_000) })).status).toBe(413);
		expect((await post(await player(), { body: "存在しない問題" }, 999)).status).toBe(404);
		expect((await post(await player(), { body: "😀".repeat(1000) })).status).toBe(201);
	});
	it("retains plain text and anonymous identity; moderation remains manual", async () => {
		const session = await player();
		const comment = await (await post(session, { body: '<script>alert("x")</script>\nhttps://example.com' })).json<Comment>();
		expect(comment.player).toEqual({ name: null, publicId: session.publicId });
		expect((await list("?problem=1")).comments).toContainEqual(comment);
		await env.DB.prepare("DELETE FROM comments WHERE id = ?").bind(comment.id).run();
		expect((await list()).comments.some(item => item.id === comment.id)).toBe(false);
		expect((await list("?problem=1")).comments.some(item => item.id === comment.id)).toBe(false);
		expect((await SELF.fetch(`https://example.com/api/comments/${comment.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${session.token}` } })).status).toBe(404);
	});
	it("returns only the latest 50 in either scope and cannot retrieve older posts", async () => {
		const session = await player();
		const id = await env.DB.prepare("SELECT id FROM players WHERE public_id = ?").bind(session.publicId).first<number>("id");
		const insert = env.DB.prepare("INSERT INTO comments (problem_id, player_id, player_public_id, body, created_at) VALUES (?, ?, ?, ?, ?)");
		await env.DB.batch(Array.from({ length: 121 }, (_, i) => insert.bind(i % 2 + 1, id, session.publicId, `post ${i}`, "2000-01-01T00:00:00.000Z")));
		const global = await list();
		expect(global.comments).toHaveLength(50);
		expect(Object.keys(global)).toEqual(["comments"]);
		expect(global.comments[0].body).toBe("post 120");
		expect(global.comments.at(-1)!.body).toBe("post 71");
		expect(global.comments.map(item => item.id)).toEqual(global.comments.map(item => item.id).sort((a, b) => b - a));
		const first = await list("?problem=2");
		expect(first.comments).toHaveLength(50);
		expect(Object.keys(first)).toEqual(["comments"]);
		expect(first.comments[0].body).toBe("post 119");
		expect(first.comments.at(-1)!.body).toBe("post 21");
		expect(first.comments.every(item => item.problemId === 2)).toBe(true);
		expect(first.comments.some(item => item.body === "post 19")).toBe(false);
		const older = await SELF.fetch(`https://example.com/api/comments?problem=2&before=${first.comments.at(-1)!.id}`);
		expect(older.status).toBe(400);
		expect(await older.json()).toEqual({ error: "invalid_query" });
		expect(await list("?problem=2&offset=50&limit=1000")).toEqual(first);
		expect((await SELF.fetch("https://example.com/api/comments/1")).status).toBe(404);
	});
	it("uses the problem/id index for the latest posts and does not scan other problems", async () => {
		const { results } = await env.DB.prepare("EXPLAIN QUERY PLAN SELECT id, body FROM comments WHERE problem_id = 2 ORDER BY id DESC LIMIT 50").all<{ detail: string }>();
		expect(results.some(row => row.detail.includes("comments_by_problem") && row.detail.includes("SEARCH"))).toBe(true);
		expect(results.some(row => row.detail.includes("TEMP B-TREE"))).toBe(false);
	});
	it("rejects invalid filters and all history cursors", async () => {
		for (const query of ["?problem=0", "?problem=NaN", "?problem=1&before=-1", "?problem=1&before=1.5", "?problem=1&before=1", "?before=1", "?before="]) expect((await SELF.fetch(`https://example.com/api/comments${query}`)).ok).toBe(false);
	});
	it("limits posting independently from answering", async () => {
		const session = await player();
		for (let i = 0; i < 5; i++) expect((await post(session, { body: String(i) })).status).toBe(201);
		const response = await post(session, { body: "sixth" });
		expect(response.status).toBe(429);
		expect(await response.json()).toEqual({ error: "rate_limited" });
	});
});
