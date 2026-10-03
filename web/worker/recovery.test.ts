import { SELF, applyD1Migrations, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import type { Me, Profile, Session } from "../shared/types";
import { normalizeSpell, spellHashInput } from "../shared/recovery";
import { sha256Hex } from "./http";

declare global {
	namespace Cloudflare {
		interface Env { TEST_MIGRATIONS: { name: string; queries: string[] }[]; }
	}
}

let address = 0;
async function call<T = { error: string }>(path: string, session?: Session, body?: unknown, method = body === undefined ? "GET" : "POST", ip?: string) {
	const response = await SELF.fetch(`https://example.com${path}`, {
		method,
		headers: { "CF-Connecting-IP": ip ?? `10.77.0.${++address}`, ...(session ? { Authorization: `Bearer ${session.token}` } : {}) },
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	});
	return { status: response.status, body: await response.json() as T };
}
const newPlayer = async () => (await call<Session>("/api/players", undefined, {}, "POST")).body;
type Issued = { spell: string };
const issue = async (session: Session, replace = false) => call<Issued>("/api/me/recovery", session, { replace });
const recover = async (spell: string, session?: Session, confirmSwitch = false) => call<Session>("/api/recover", session, { spell, confirmSwitch });
const countPlayers = () => env.DB.prepare("SELECT COUNT(*) AS count FROM players").first<{ count: number }>();
const insertAnswer = (session: Session) => env.DB.prepare("INSERT INTO answers (player_id, problem_id, action, score, pitari, answered_at, jst_date) SELECT id, 1, 'd:1m', 100, 1, ?, '2026-10-03' FROM players WHERE public_id = ?")
	.bind("2026-10-03T01:00:00.000Z", session.publicId).run();
const legacy: Session = { token: "legacy-token-before-migration", publicId: "legacyplayer" };

beforeAll(async () => {
	await applyD1Migrations(env.DB, env.TEST_MIGRATIONS.slice(0, -1));
	await env.DB.prepare("INSERT INTO problems (id, kind, difficulty, scene, choices, evaluation, source, difficulty_pos, kind_pos) VALUES (1, 'discard', 'easy', '{}', '[]', '{}', '{}', 1, 1)").run();
	await env.DB.prepare("INSERT INTO players (id, public_id, token_hash, name, created_at) VALUES (77, ?, ?, '以前の名前', '2026-10-01')")
		.bind(legacy.publicId, await sha256Hex(legacy.token)).run();
	await insertAnswer(legacy);
	await applyD1Migrations(env.DB, env.TEST_MIGRATIONS.slice(-1));
});

describe("optional recovery", () => {
	it("preserves players, tokens and scores created before the migration", async () => {
		const me = await call<Me>("/api/me", legacy);
		expect(me.status).toBe(200);
		expect(me.body).toMatchObject({ name: "以前の名前", recoveryEnabled: false, all: { answers: 1, scoreSum: 100 } });
	});
	it("stores only an indexed hash, and restores the same ID, renamed player and answers", async () => {
		const original = await newPlayer();
		await insertAnswer(original);
		await call("/api/me/name", original, { name: "変更した名前" }, "PUT");
		const issued = await issue(original);
		expect(issued.status).toBe(200);
		const raw = normalizeSpell(issued.body.spell)!;
		expect(raw).toHaveLength(32);
		const row = await env.DB.prepare("SELECT id, recovery_hash, token_hash FROM players WHERE public_id = ?").bind(original.publicId).first<{ id: number; recovery_hash: string; token_hash: string }>();
		expect(row?.recovery_hash).toBe(await sha256Hex(spellHashInput(raw)));
		expect(row?.recovery_hash).not.toBe(raw);
		expect(row?.token_hash).toBe(await sha256Hex(original.token));
		const before = await countPlayers();
		const result = await recover(` \n${issued.body.spell.toUpperCase()}\n `);
		expect(result.status).toBe(200);
		expect(result.body.publicId).toBe(original.publicId);
		expect(result.body.token).not.toBe(original.token);
		expect(await countPlayers()).toEqual(before);
		expect(await env.DB.prepare("SELECT id FROM players WHERE public_id = ?").bind(result.body.publicId).first()).toEqual({ id: row!.id });
		const profile = await call<Profile>(`/api/players/${original.publicId}`, result.body);
		expect(profile.body).toMatchObject({ name: "変更した名前", recoveryEnabled: true, all: { answers: 1, scoreSum: 100 }, history: [{ id: 1, score: 100 }] });
		for (const previous of [original, { ...result.body, token: issued.body.spell }]) {
			expect((await call("/api/me", previous)).status).toBe(401);
		}
		expect((await call("/api/players/deletedplayer", original)).status).toBe(401);
		expect((await call("/api/players/deletedplayer")).status).toBe(404);
		const publicProfile = await call<Profile>(`/api/players/${original.publicId}`);
		expect(publicProfile.body).not.toHaveProperty("recoveryEnabled");
		expect(JSON.stringify(profile.body)).not.toContain(row!.recovery_hash);
		expect(JSON.stringify(profile.body)).not.toContain(issued.body.spell);
		const plan = await env.DB.prepare("EXPLAIN QUERY PLAN SELECT id FROM players WHERE recovery_hash = ?").bind(row!.recovery_hash).all<{ detail: string }>();
		expect(plan.results.some((item) => item.detail.includes("players_by_recovery"))).toBe(true);
	});
	it("requires explicit reissue, invalidates the previous spell and keeps the session usable", async () => {
		const player = await newPlayer();
		const first = (await issue(player)).body;
		expect((await issue(player)).status).toBe(409);
		const second = (await issue(player, true)).body;
		expect((await recover(first.spell)).status).toBe(400);
		expect((await call("/api/me", player)).status).toBe(200);
		expect((await recover(second.spell)).body.publicId).toBe(player.publicId);
		expect((await call("/api/me", player)).status).toBe(401);
	});
	it("does not change the current player when a spell is wrong, or use a session token as a spell", async () => {
		const current = await newPlayer();
		for (const spell of ["wrong", "a".repeat(32), current.token]) {
			expect((await recover(spell, current)).status).toBe(400);
		}
		expect((await call<Me>("/api/me", current)).body.publicId).toBe(current.publicId);
		expect((await env.DB.prepare("SELECT recovery_hash FROM players WHERE public_id = ?").bind(current.publicId).first())).toEqual({ recovery_hash: null });
	});
	it("protects existing answers until a backup exists, then requires explicit switching", async () => {
		const targetPlayer = await newPlayer();
		const target = (await issue(targetPlayer)).body;
		const current = await newPlayer();
		await insertAnswer(current);
		expect(await call("/api/recover", current, { spell: target.spell, confirmSwitch: true })).toMatchObject({ status: 409, body: { error: "backup_required" } });
		const backup = (await issue(current)).body;
		expect(await call("/api/recover", current, { spell: target.spell })).toMatchObject({ status: 409, body: { error: "switch_required" } });
		const result = await recover(target.spell, current, true);
		expect(result.status).toBe(200);
		expect(result.body.publicId).toBe(targetPlayer.publicId);
		expect((await call<Me>("/api/me", current)).body.all.answers).toBe(1);
		expect((await recover(backup.spell)).body.publicId).toBe(current.publicId);
	});
	it("rate limits recovery attempts by IP", async () => {
		const ip = "10.77.99.99";
		for (let i = 0; i < 10; i++) expect((await call("/api/recover", undefined, { spell: "wrong" }, "POST", ip)).status).toBe(400);
		expect((await call("/api/recover", undefined, { spell: "wrong" }, "POST", ip)).status).toBe(429);
	});
});
