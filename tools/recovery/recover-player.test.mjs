import { DatabaseSync } from "node:sqlite";
import { readFile, readdir } from "node:fs/promises";
import { beforeEach, afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createExecutor, inspectPlayer, issueSpell, run, searchPlayers } from "./recover-player.mjs";
import { normalizeSpell, spellHashInput } from "../../web/shared/recovery.ts";

let db;
let execute;
beforeEach(async () => {
	db = new DatabaseSync(":memory:");
	const dir = new URL("../../web/migrations/", import.meta.url);
	for (const name of (await readdir(dir)).filter(name => name.endsWith(".sql")).sort()) db.exec(await readFile(new URL(name, dir), "utf8"));
	db.exec(`INSERT INTO players (id, public_id, name, token_hash, created_at) VALUES
(1, 'firstplayer', '太郎', 'token-1', '2026-10-01'), (2, 'secondplayer', '太郎', 'token-2', '2026-10-02'),
(3, 'anonymous', NULL, 'token-3', '2026-10-03'), (4, 'quotedname', 'O''Brien', 'token-4', '2026-10-03');
INSERT INTO answers (player_id, problem_id, action, score, pitari, answered_at, jst_date) VALUES
(1, 1, 'd:1m', 100, 1, '2026-10-03T01:00:00Z', '2026-10-03');`);
	execute = async sql => {
		const statement = db.prepare(sql);
		if (sql.trimStart().startsWith("SELECT") || sql.includes("RETURNING")) return { success: true, results: statement.all(), meta: { changes: 0 } };
		return { success: true, results: [], meta: { changes: Number(statement.run().changes) } };
	};
});
afterEach(() => db.close());

test("name search retains duplicate candidates and also accepts a public ID or anonymous display name", async () => {
	assert.deepEqual((await searchPlayers(execute, "太")).map(player => player.id), [2, 1]);
	assert.deepEqual((await searchPlayers(execute, "firstplayer")).map(player => player.id), [1]);
	assert.deepEqual((await searchPlayers(execute, "名無し#anonymous")).map(player => player.id), [3]);
});
test("quotes and SQL-like names are treated as literal text", async () => {
	assert.deepEqual((await searchPlayers(execute, "O'Brien")).map(player => player.id), [4]);
	assert.equal((await searchPlayers(execute, "' OR 1=1 --")).length, 0);
	assert.equal(db.prepare("SELECT COUNT(*) AS total FROM players").get().total, 4);
});
test("only the selected recovery hash changes and the generated spell matches the site's protocol", async () => {
	const before = db.prepare("SELECT * FROM players ORDER BY id").all();
	const answers = db.prepare("SELECT * FROM answers").all();
	const player = await inspectPlayer(execute, 1);
	assert.equal(player.answers, 1);
	assert.equal(player.last_answered_at, "2026-10-03T01:00:00Z");
	const spell = await issueSpell(execute, player);
	const raw = normalizeSpell(spell);
	assert.equal(raw.length, 32);
	const hash = createHash("sha256").update(spellHashInput(raw)).digest("hex");
	const after = db.prepare("SELECT * FROM players ORDER BY id").all();
	assert.deepEqual({ ...after[0], recovery_hash: null }, { ...before[0] });
	assert.deepEqual(after.slice(1), before.slice(1));
	assert.equal(after[0].recovery_hash, hash);
	assert.notEqual(hash, raw);
	assert.deepEqual(db.prepare("SELECT * FROM answers").all(), answers);
});
test("a stale selection cannot overwrite a concurrently issued spell", async () => {
	const player = await inspectPlayer(execute, 1);
	const first = await issueSpell(execute, player);
	await assert.rejects(issueSpell(execute, player), /ほかの操作で変更/);
	assert.equal(db.prepare("SELECT recovery_hash FROM players WHERE id = 1").get().recovery_hash,
		createHash("sha256").update(spellHashInput(normalizeSpell(first))).digest("hex"));
});
test("reissue replaces the old spell while preserving the existing session", async () => {
	const first = await issueSpell(execute, await inspectPlayer(execute, 1));
	const second = await issueSpell(execute, await inspectPlayer(execute, 1));
	assert.notEqual(first, second);
	assert.equal(db.prepare("SELECT token_hash FROM players WHERE id = 1").get().token_hash, "token-1");
});
test("a deleted or replaced player cannot cause issuance for a different account", async () => {
	const player = await inspectPlayer(execute, 1);
	db.exec("DELETE FROM players WHERE id = 1; INSERT INTO players (id, public_id, token_hash, created_at) VALUES (1, 'replacement', 'new-token', '2026-10-03');");
	await assert.rejects(issueSpell(execute, player), /削除されました/);
	assert.equal(db.prepare("SELECT recovery_hash FROM players WHERE id = 1").get().recovery_hash, null);
});
test("invalid IDs and blank queries fail without executing SQL", async () => {
	const noSql = () => { throw new Error("must not query"); };
	await assert.rejects(searchPlayers(noSql, " "), /入力してください/);
	await assert.rejects(inspectPlayer(noSql, "1 OR 1=1"), /不正/);
	await assert.rejects(issueSpell(noSql, { id: 0, public_id: "bad" }), /不正/);
});
test("ambiguous name needs a selection and the chosen account is the only account updated", async () => {
	const replies = ["2", "y"];
	let copied;
	let output = "";
	await run({ mode: "local", execute, search: "太郎", ask: async () => replies.shift(), write: text => { output += text; }, copy: spell => { copied = spell; return true; } });
	assert(copied);
	assert(output.includes("公開ID: firstplayer"));
	assert.equal(db.prepare("SELECT recovery_hash FROM players WHERE id = 2").get().recovery_hash, null);
	assert(db.prepare("SELECT recovery_hash FROM players WHERE id = 1").get().recovery_hash);
	assert(!output.includes("token-1"));
});
test("cancel does not issue or copy a spell", async () => {
	const replies = ["1", "n"];
	await run({ mode: "local", execute, search: "firstplayer", ask: async () => replies.shift(), write: () => {}, copy: () => { throw new Error("must not copy"); } });
	assert.equal(db.prepare("SELECT recovery_hash FROM players WHERE id = 1").get().recovery_hash, null);
});
test("database failure never prints or copies a newly generated spell", async () => {
	const replies = ["1", "y"];
	let output = "";
	await assert.rejects(run({ mode: "local", execute: sql => sql.startsWith("UPDATE") ? Promise.reject(new Error("DB failure")) : execute(sql), search: "firstplayer", ask: async () => replies.shift(), write: text => { output += text; }, copy: () => { throw new Error("must not copy"); } }), /DB failure/);
	assert(!output.includes("復活の呪文"));
	assert.equal(db.prepare("SELECT recovery_hash FROM players WHERE id = 1").get().recovery_hash, null);
});
test("database destination is explicit and a test persistence directory cannot select production", () => {
	assert.throws(() => createExecutor(), /接続先/);
	assert.throws(() => createExecutor({ mode: "remote", persistTo: "fixture" }), /ローカル/);
});
