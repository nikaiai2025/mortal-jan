import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createExecutor } from "../recovery/recover-player.mjs";
import { jstDate } from "../../web/shared/rules.ts";
import { DAY_MS } from "../../web/shared/acquisition.ts";

function dateValue(value) {
	if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) throw new Error("日付は実在する YYYY-MM-DD で指定してください。");
	return value;
}

/** Reads daily aggregates by their primary key range; never queries answers or raw visitor IDs. */
export function reportSql({ from, to, now = new Date() }) {
	dateValue(from); dateValue(to);
	const days = (Date.parse(to) - Date.parse(from)) / DAY_MS + 1;
	if (days < 1 || days > 90) throw new Error("集計期間は1〜90日で指定してください。");
	// Full JST-day cohorts only: the latest visitor/answer on each day must have finished observation.
	const mature24 = jstDate(new Date(now.getTime() - 2 * DAY_MS));
	const mature7 = jstDate(new Date(now.getTime() - 8 * DAY_MS));
	return `SELECT source, medium, campaign, content, landing,
SUM(new_visitors) AS new_visitors, SUM(first_answers) AS first_answers,
SUM(CASE WHEN day <= '${mature24}' THEN new_visitors ELSE 0 END) AS mature_visitors,
SUM(CASE WHEN day <= '${mature24}' THEN converted_24h ELSE 0 END) AS converted_24h,
SUM(CASE WHEN day <= '${mature7}' THEN first_answers ELSE 0 END) AS mature_first_answers,
SUM(CASE WHEN day <= '${mature7}' THEN returned_7d ELSE 0 END) AS returned_7d
FROM acquisition_daily WHERE day BETWEEN '${from}' AND '${to}'
GROUP BY source, medium, campaign, content, landing
HAVING SUM(new_visitors) > 0 OR SUM(first_answers) > 0
ORDER BY first_answers DESC, new_visitors DESC, source, campaign, content, landing;`;
}

const rate = (n, d) => d ? `${(n / d * 100).toFixed(1)}%（${n}/${d}）` : "観測待ち";

export function formatReport(rows, { from, to, now = new Date(), rowsRead }) {
	const sum = key => rows.reduce((total, row) => total + Number(row[key]), 0);
	return `# 集客と利用の集計\n\n期間: ${from}〜${to}（日本時間） / 集計日: ${jstDate(now)}\n\n初回回答者: ${sum("first_answers")} / 新規訪問者: ${sum("new_visitors")}\n24時間以内の初回回答率: ${rate(sum("converted_24h"), sum("mature_visitors"))}\n7日以内の再利用率: ${rate(sum("returned_7d"), sum("mature_first_answers"))}\n\n| 流入元 | 媒体 | 試行 | 投稿 | 入口 | 新規訪問者 | 初回回答者 | 24時間以内の初回回答率 | 7日以内の再利用率 |\n|---|---|---|---|---|---:|---:|---|---|\n${rows.map(r => `| ${r.source} | ${r.medium} | ${r.campaign || "—"} | ${r.content || "—"} | ${r.landing} | ${r.new_visitors} | ${r.first_answers} | ${rate(r.converted_24h, r.mature_visitors)} | ${rate(r.returned_7d, r.mature_first_answers)} |`).join("\n")}\n\n初回訪問の日付で回答率、初回回答の日付で再利用率を集計。観測が終わった日付の集団だけを割合の分母に含めます。人数は匿名のブラウザ・プレイヤー単位です。unknownは直接訪問または判別不能です。${rowsRead === undefined ? "" : ` DB読取行数: ${rowsRead}。`}\n`;
}

async function main() {
	const args = process.argv.slice(2);
	if (args.includes("--help")) {
		console.log("node tools/acquisition/report.mjs --local|--remote --from YYYY-MM-DD --to YYYY-MM-DD [--output trash/acquisition/report.md]\n読み取り専用。現在のCloudflare認証を使い、匿名の集計だけを表示します。");
		return;
	}
	let mode, from, to, output;
	for (let i = 0; i < args.length; i++) {
		if (["--local", "--remote"].includes(args[i]) && !mode) mode = args[i].slice(2);
		else if (args[i] === "--from" && !from) from = args[++i];
		else if (args[i] === "--to" && !to) to = args[++i];
		else if (args[i] === "--output" && !output) output = args[++i];
		else throw new Error("引数が不正です。--help で使い方を確認してください。");
	}
	if (!mode) throw new Error("--local または --remote を指定してください。");
	const now = new Date();
	const sql = reportSql({ from, to, now });
	const result = await createExecutor({ mode })(sql);
	const report = formatReport(result.results, { from, to, now, rowsRead: result.meta?.rows_read });
	if (output) { const path = resolve(output); await mkdir(dirname(path), { recursive: true }); await writeFile(path, report, "utf8"); }
	process.stdout.write(report);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
