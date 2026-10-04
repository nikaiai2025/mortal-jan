import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { randomId } from "../../web/shared/ids.ts";
import { formatSpell, spellHashInput } from "../../web/shared/recovery.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sqlValue = value => value === null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`;
const publicName = player => player.name ?? `名無し#${player.public_id}`;

/** Wrangler uses the operator's existing Cloudflare login or API-token environment. */
export function createExecutor({ mode, persistTo } = {}) {
	if (!["local", "remote"].includes(mode)) throw new Error("接続先を --local または --remote で指定してください。");
	if (persistTo && mode !== "local") throw new Error("検証用の保存先はローカルでのみ指定できます。");
	return async sql => {
		const tempRoot = join(root, "trash", "recovery-admin");
		await mkdir(tempRoot, { recursive: true });
		const temp = await mkdtemp(join(tempRoot, "query-"));
		try {
			const args = [
				join(root, "web", "node_modules", "wrangler", "bin", "wrangler.js"),
				// --file uses remote bulk import; --command returns ordinary query results.
				"d1", "execute", "DB", `--${mode}`, "--config", join(root, "web", "wrangler.jsonc"), "--command", sql, "--json",
				...(persistTo ? ["--persist-to", resolve(persistTo)] : []),
			];
			const result = spawnSync(process.execPath, args, {
				cwd: join(root, "web"), encoding: "utf8", windowsHide: true, timeout: 120_000, maxBuffer: 2 * 1024 * 1024,
				env: { ...process.env, WRANGLER_LOG_PATH: join(temp, "wrangler.log"), WRANGLER_SEND_METRICS: "false" },
			});
			if (result.error || result.status !== 0) {
				// Wrangler may include response data in errors; show only an actionable summary.
				throw new Error("DB操作に失敗しました。Cloudflareの認証・権限と、必要なマイグレーションの適用を確認してください。呪文の発行中に失敗した場合は、検索からやり直して再発行してください。");
			}
			const output = JSON.parse(result.stdout);
			if (!Array.isArray(output) || output.length !== 1 || output[0].success !== true) throw new Error("DBから想定外の応答が返りました。");
			return output[0];
		} finally {
			const child = relative(await realpath(tempRoot), await realpath(temp));
			if (!child || child.startsWith("..") || isAbsolute(child)) throw new Error("一時フォルダーの場所が想定外です。削除を中止しました。");
			await rm(temp, { recursive: true, force: true });
		}
	};
}

export async function searchPlayers(execute, query) {
	const value = query.trim();
	if (!value || value.length > 100) throw new Error("名前または公開IDを入力してください（100文字以内）。");
	const id = value.startsWith("名無し#") ? value.slice(4) : value;
	const { results } = await execute(`SELECT id, public_id, name, created_at, recovery_hash IS NOT NULL AS recovery_enabled
FROM players WHERE instr(COALESCE(name, ''), ${sqlValue(value)}) > 0 OR public_id = ${sqlValue(id)}
ORDER BY id DESC LIMIT 21;`);
	return results;
}

export async function inspectPlayer(execute, id) {
	if (!Number.isSafeInteger(id) || id < 1) throw new Error("利用者IDが不正です。");
	const { results } = await execute(`SELECT p.id, p.public_id, p.name, p.created_at, p.recovery_hash,
(SELECT COUNT(*) FROM answers a WHERE a.player_id = p.id) AS answers,
(SELECT MAX(answered_at) FROM answers a WHERE a.player_id = p.id) AS last_answered_at
FROM players p WHERE p.id = ${id};`);
	if (results.length !== 1) throw new Error("対象の利用者が見つかりません。検索からやり直してください。");
	return results[0];
}

/** Only the selected player's recovery hash changes; session and scores stay intact. */
export async function issueSpell(execute, player) {
	if (!Number.isSafeInteger(player.id) || player.id < 1 || typeof player.public_id !== "string") throw new Error("利用者IDが不正です。");
	const raw = randomId(32);
	const hash = createHash("sha256").update(spellHashInput(raw)).digest("hex");
	const result = await execute(`UPDATE players SET recovery_hash = ${sqlValue(hash)}
WHERE id = ${player.id} AND public_id = ${sqlValue(player.public_id)} AND recovery_hash IS ${sqlValue(player.recovery_hash)} RETURNING public_id;`);
	if (result.results?.length !== 1 || result.results[0].public_id !== player.public_id) throw new Error("呪文がほかの操作で変更されたか、利用者が削除されました。検索からやり直してください。");
	return formatSpell(raw);
}

function copySpell(spell) {
	if (process.platform !== "win32") return false;
	const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "Set-Clipboard -Value ([Console]::In.ReadToEnd())"], {
		input: spell, encoding: "utf8", windowsHide: true, timeout: 10_000,
	});
	return !result.error && result.status === 0;
}

export async function run({ mode, execute, ask, write, copy = copySpell, search }) {
	write(`接続先: ${mode === "remote" ? "本番D1" : "ローカルD1"}\n`);
	let players;
	while (true) {
		const query = search ?? await ask("名前（部分一致）または公開ID（空欄で終了）: ");
		if (!query.trim()) return;
		players = await searchPlayers(execute, query);
		if (players.length > 20 || players.length === 0) {
			write(players.length ? "候補が20件を超えます。名前を絞るか、公開IDで検索してください。\n" : "該当する利用者がいません。\n");
			search = undefined;
			continue;
		}
		break;
	}
	players.forEach((player, index) => write(`${index + 1}. ${publicName(player)} | 公開ID: ${player.public_id} | 登録: ${player.created_at} | ${player.recovery_enabled ? "呪文発行済み" : "呪文未発行"}\n`));
	const selected = (await ask("対象の番号（空欄で終了）: ")).trim();
	if (!selected) return;
	if (!/^\d+$/.test(selected) || !players[Number(selected) - 1]) throw new Error("一覧の番号を指定してください。");
	const player = await inspectPlayer(execute, players[Number(selected) - 1].id);
	write(`\n対象: ${publicName(player)} | 公開ID: ${player.public_id}\n回答数: ${player.answers} | 最終回答: ${player.last_answered_at ?? "なし"}\n`);
	if (player.recovery_hash) write("再発行すると、保存済みの前の呪文は使えなくなります。\n");
	const confirmed = (await ask("この利用者の呪文を発行しますか？ [y/N]: ")).trim().toLowerCase();
	if (confirmed !== "y") { write("発行を中止しました。\n"); return; }
	const spell = await issueSpell(execute, player);
	write(`\n復活の呪文\n${spell}\n\n`);
	write(copy(spell) ? "呪文をクリップボードへコピーしました。\n" : "表示された呪文をコピーしてください。\n");
	write("相手に呪文を渡し、サイトの「成績を復旧する」から入力してもらってください。\n");
}

async function main() {
	const args = process.argv.slice(2);
	if (args.includes("--help")) {
		console.log("使い方: node tools/recovery/recover-player.mjs --remote または --local\n名前で検索 → 対象選択 → 成績確認 → 呪文発行・コピー。Cloudflareのログインまたは環境変数のAPIトークンを使います。");
		return;
	}
	if (args.length !== 1 || !["--local", "--remote"].includes(args[0])) throw new Error("接続先を明示してください: --local または --remote（--help で手順を表示）。");
	const mode = args[0].slice(2);
	const terminal = createInterface({ input: process.stdin, output: process.stdout });
	try {
		await run({ mode, execute: createExecutor({ mode }), ask: prompt => terminal.question(prompt), write: text => process.stdout.write(text) });
	} finally {
		terminal.close();
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
