import {
	DAILY_ANSWER_LIMIT,
	NAME_MAX_LENGTH,
	RANKING_MIN_ANSWERS,
	SET_THEMES,
	SET_THEME_LABELS,
	type SetTheme,
	displayName,
	markOf,
	setOf,
} from "../shared/rules";
import type {
	Breakdown,
	DailySet,
	Difficulty,
	ProblemResponse,
	Profile,
	RankingAxis,
	RankingEntry,
	RankingPeriod,
	SetProblem,
	SetSummary,
	Stats,
} from "../shared/types";
import { api, currentPublicId, ensureSession, publicApi, put } from "./api";
import { h, replace } from "./dom";
import { errorMessage } from "./errors";
import { dailyChart } from "./chart";
import { hanamaruFor, markIcon } from "./marks";
import { advancePick, loadPick, modeSwitch, pickPath, savePick } from "./picker";
import { showProblem } from "./play";
import { reviewNext, saveReview } from "./review";
import { openShare, profileCard, setCard } from "./share";

/** Navigation shared by the screens. */
export interface App {
	navigate(path: string): void;
	/** Render the current URL again (e.g. the next problem). */
	refresh(): void;
}

// ---- free play and shared links ----

export async function freePlay(root: HTMLElement, app: App): Promise<void> {
	const pick = loadPick();
	const response = await api<ProblemResponse>(pickPath(pick));
	if (response.state === "finished") {
		// Number order reached the last problem (random play ends only when every problem is answered).
		const restart = () => {
			savePick({ ...loadPick(), after: 0 });
			app.refresh();
		};
		replace(
			root,
			h(
				"section",
				{ class: "notice" },
				h("h2", {}, pick.mode === "order" ? "番号順に最後まで解きました" : "全問解きました"),
				h("div", { class: "notice__switch" }, modeSwitch()),
				pick.mode === "order"
					? h("button", { class: "stamp-button", type: "button", onclick: restart }, "最初から")
					: h("p", {}, "すべての問題に回答済みです。"),
			),
		);
		return;
	}
	await showProblem(root, response, {
		from: null,
		nextLabel: "次の問題へ",
		onNext: app.refresh,
		onAnswered: (result) => advancePick(pick, result.id),
		nextSwitch: modeSwitch(),
	});
}

export async function problemPage(root: HTMLElement, id: number, app: App): Promise<void> {
	const params = new URLSearchParams(location.search);
	const from = params.get("from");
	const response = await api<ProblemResponse>(`/api/problems/${id}${from ? `?from=${encodeURIComponent(from)}` : ""}`);
	if (!params.has("review")) return showProblem(root, response, { from, nextLabel: "次の問題へ", onNext: () => app.navigate("/"), nextSwitch: modeSwitch() });
	// Reviewing misses from the profile: on to the next one in the list, or back to the profile.
	const next = reviewNext(id);
	await showProblem(root, response, {
		from,
		nextLabel: next ? "次の間違いへ" : "成績表へ",
		onNext: () => app.navigate(next ? `/q/${next}?review` : `${meLink()}?history=miss`),
	});
}

// ---- ten problems: problem sets and today's ten ----

const setTitle = (theme: SetTheme, set: number) =>
	theme === "all" ? `問題集 第${set}集` : `問題集 ${SET_THEME_LABELS[theme]}編 第${set}集`;

export async function setList(root: HTMLElement, theme: SetTheme, page: number, app: App): Promise<void> {
	const data = await api<{ page: number; totalSets: number; setsPerPage: number; sets: SetSummary[] }>(
		`/api/sets?theme=${theme}&page=${page}`,
	);
	const byNumber = new Map(data.sets.map((s) => [s.set, s]));
	const first = (data.page - 1) * data.setsPerPage + 1;
	const last = Math.min(first + data.setsPerPage - 1, data.totalSets);
	const grid = h("ol", { class: "set-grid" });
	for (let set = first; set <= last; set++) {
		const summary = byNumber.get(set);
		const done = summary?.answered === 10;
		grid.append(
			h(
				"li",
				{},
				h(
					"a",
					{ class: `set-cell${done ? " is-done" : summary ? " is-started" : ""}`, href: `/sets/${theme}/${set}` },
					h("span", { class: "set-cell__no" }, String(set)),
					h("span", { class: "set-cell__state" }, done ? `${(summary.scoreSum / 10).toFixed(1)}点` : summary ? `${summary.answered}/10` : ""),
				),
			),
		);
	}
	const pages = Math.ceil(data.totalSets / data.setsPerPage);
	const pager = h("nav", { class: "pager", "aria-label": "ページ" });
	if (pages > 1) {
		for (let p = 1; p <= pages; p++) {
			pager.append(h("a", { class: p === data.page ? "is-current" : "", href: `/sets?theme=${theme}&page=${p}` }, `${(p - 1) * data.setsPerPage + 1}〜`));
		}
	}
	const themes = h(
		"nav",
		{ class: "tabs", "aria-label": "テーマ" },
		...SET_THEMES.map((t) => h("a", { class: t === theme ? "is-current" : "", href: `/sets?theme=${t}` }, SET_THEME_LABELS[t])),
	);
	// Opening a problem by number belongs with the lists, not on the question page.
	const number = h("input", { type: "number", min: 1, step: 1, inputMode: "numeric", placeholder: "番号", "aria-label": "問題番号" });
	const jump = h(
		"form",
		{
			class: "set-jump",
			onsubmit: (event: Event) => {
				event.preventDefault();
				const id = Number(number.value);
				if (Number.isInteger(id) && id >= 1) app.navigate(`/q/${id}`);
			},
		},
		h("span", { class: "set-jump__label" }, "1問だけ解く"),
		h("label", {}, "第", number, "問を"),
		h("button", { class: "ghost-button ghost-button--small", type: "submit" }, "開く"),
	);
	replace(
		root,
		h("header", { class: "page-head" }, h("h1", {}, "問題集"), h("p", {}, "10問ずつの問題集です。10問そろうと合計点（100点満点）が出ます。"), jump),
		themes,
		pager,
		data.totalSets ? grid : h("p", { class: "empty" }, "このテーマの問題集はまだありません。"),
	);
}

export async function setPlay(root: HTMLElement, theme: SetTheme, set: number, app: App): Promise<void> {
	const data = await api<{ set: number; problems: SetProblem[]; playerName: string }>(`/api/sets/${theme}/${set}`);
	const title = setTitle(theme, set);
	await playTen(root, app, title, data.problems, {
		lastLabel: "問題集の結果へ",
		summary: {
			title,
			problems: data.problems,
			playerName: data.playerName,
			shareUrl: `${location.origin}/sets/${theme}/${set}`,
			shareFile: `mortal-nanikiru-${theme}-${set}.png`,
			next: { label: "次の問題集へ", href: `/sets/${theme}/${set + 1}` },
		},
	});
}

/** "10月2日" from a Japan date "2026-10-02". */
const dateLabel = (day: string) => `${Number(day.slice(5, 7))}月${Number(day.slice(8, 10))}日`;

/** "12:34" in Japan time. */
const jstTime = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString().slice(11, 16);

export async function dailyPlay(root: HTMLElement, app: App): Promise<void> {
	const data = await api<DailySet>("/api/daily");
	const title = `今日の10問（${dateLabel(data.day)}）`;
	await playTen(root, app, title, data.problems, {
		lastLabel: "今日の結果へ",
		summary: {
			title,
			problems: data.problems,
			playerName: data.playerName,
			shareUrl: `${location.origin}/daily`,
			shareFile: `mortal-nanikiru-daily-${data.day}.png`,
			next: { label: "今日のランキングへ", href: "/ranking?period=today" },
			note: data.result ? `${jstTime(data.result.completedAt)} に完了。今日のランキングに載ります。` : null,
		},
	});
}

interface TenSummary {
	title: string;
	problems: SetProblem[];
	playerName: string;
	shareUrl: string;
	shareFile: string;
	next: { label: string; href: string };
	note?: string | null;
}

/** The first unanswered problem of the ten, or the summary once all are answered. */
async function playTen(root: HTMLElement, app: App, title: string, problems: SetProblem[], options: { lastLabel: string; summary: TenSummary }): Promise<void> {
	// A delayed response of a page we left must not change the player's assignment.
	if (!root.isConnected) return;
	const next = problems.find((p) => !p.answer);
	if (!next) return tenSummary(root, options.summary, app);
	const position = problems.indexOf(next) + 1;
	const remaining = problems.filter((p) => !p.answer).length;
	const response = await api<ProblemResponse>(`/api/problems/${next.id}`);
	await showProblem(root, response, {
		from: null,
		progress: `${title} ${position}/10`,
		nextLabel: remaining > 1 ? "次の問題へ" : options.lastLabel,
		onNext: app.refresh,
	});
}

function tenSummary(root: HTMLElement, summary: TenSummary, app: App): void {
	const { problems } = summary;
	const total = problems.reduce((sum, p) => sum + (p.answer?.score ?? 0), 0) / problems.length;
	const pitari = problems.filter((p) => p.answer?.pitari).length;
	const list = h("ol", { class: "set-result" });
	for (const problem of problems) {
		const icon = problem.answer ? markIcon(markOf(problem.answer.score, problem.answer.pitari), "set-result__mark", hanamaruFor(currentPublicId(), problem.id, problem.difficulty)) : null;
		list.append(
			h(
				"li",
				{},
				h("a", { href: `/q/${problem.id}` }, icon, h("span", {}, `第${problem.id}問`), h("strong", {}, `${problem.answer?.score ?? 0}点`)),
			),
		);
	}
	const share = async () => {
		await openShare(await setCard(summary.title, problems, summary.playerName), summary.title, summary.shareUrl, summary.shareFile);
	};
	replace(
		root,
		h(
			"section",
			{ class: "set-summary" },
			h("p", { class: "set-summary__title" }, summary.title),
			h("p", { class: "set-summary__score" }, total.toFixed(1), h("small", {}, "点")),
			h("p", { class: "set-summary__pitari" }, `ピタリ ${pitari} / 10`),
			summary.note ? h("p", { class: "note" }, summary.note) : null,
			list,
			h(
				"div",
				{ class: "result__actions" },
				h("button", { class: "ghost-button", type: "button", onclick: share }, "結果を共有"),
				h("button", { class: "stamp-button", type: "button", onclick: () => app.navigate(summary.next.href) }, summary.next.label),
			),
		),
	);
}

// ---- rules ----

export function rulesPage(root: HTMLElement): Promise<void> {
	const section = (title: string, ...items: string[]) =>
		h("section", { class: "rules__section" }, h("h2", {}, title), h("ul", {}, ...items.map((item) => h("li", {}, item))));
	replace(
		root,
		h("header", { class: "page-head" }, h("h1", {}, "ルール")),
		section(
			"対局ルール",
			"四人麻雀の東南戦（半荘戦）で、ルールは天鳳準拠です。4人とも同じAIが打っていて、全員ガチレベルの打ち手です。天鳳の上級者の対局で学習したAIで、配布者によると雀魂のMAKAテストで平均S+です。",
			"持ち点25,000点。オーラスで30,000点に誰も届かなければ西入します。持ち点がマイナスになると終了（トビ）。",
			"赤ドラあり（5萬・5筒・5索に各1枚）。喰いタン・後付けあり。一発・裏ドラ・槓ドラあり。",
			"途中流局あり（九種九牌・四風連打・四家立直・四槓散了）。3人が同時にロンしても流局になりません。",
		),
		section(
			"遊び方",
			"出題は「ランダム」か「番号順」を、回答後の「次の問題へ」の近くで切り替えられます。難易度や種類で選ぶときと、番号を指定して開くときは問題集のページを使います。",
			"「今日の10問」は全員に同じ10問が日替わり（日本時間0時）で出ます。別の画面で先に解いた問題は、その回答を使います。",
			"同じ問題は1回だけ解けます。解き直しはできず、最初の回答が記録に残ります。回答済みの問題はいつでも見直せます（成績表の「間違い」から順にたどれます）。",
			`出題は1日${DAILY_ANSWER_LIMIT.toLocaleString("ja-JP")}問までです（日本時間0時に戻ります）。`,
		),
		section(
			"採点",
			"AIは候補ごとに評価（%）を出します。得点は「あなたの手の評価 ÷ 最善手の評価 × 100」で、最善手と同じなら100点です。",
			"難易度（かんたん・ふつう・むずかしい）は、AIが最善手をどれだけ確信しているかで分けています。",
			"評価に使うAIは、Mortal用に第三者が配布している重み mortal-298k です（公式モデルではありません）。",
		),
		section(
			"成績とランキング",
			"成績表では、全期間と今日の回答数・平均点・ピタリ率と、1日ごとの平均点のグラフを見られます（回答のない日は除きます）。",
			`全期間のランキングは回答数・平均点・ピタリ率です。平均点とピタリ率には${RANKING_MIN_ANSWERS}問以上回答した人が載ります。各行の帯は、かんたん・ふつう・むずかしいの回答数の比です。`,
			"今日のランキングは、今日の10問を解き終えた人の得点順です（同点はピタリ数、次に早く終えた順）。",
			"全期間のランキングと、ほかの人の成績表は10分ごとに更新します。",
		),
	);
	return Promise.resolve();
}

// ---- profile ----

const averageText = (stats: Stats) => (stats.answers ? (stats.scoreSum / stats.answers).toFixed(1) : "—");
const pitariText = (stats: Stats) => (stats.answers ? `${((stats.pitari / stats.answers) * 100).toFixed(1)}%` : "—");

function statBlock(label: string, stats: Stats): HTMLElement {
	const average = averageText(stats);
	const pitari = pitariText(stats);
	return h(
		"section",
		{ class: "stat-block" },
		h("h2", {}, label),
		h(
			"dl",
			{},
			h("dt", {}, "回答数"),
			h("dd", {}, `${stats.answers}`),
			h("dt", {}, "平均点"),
			h("dd", {}, average),
			h("dt", {}, "ピタリ率"),
			h("dd", {}, pitari),
		),
	);
}

/** The owner's answers by difficulty, then by kind. */
function breakdownTable(breakdown: Breakdown): HTMLElement {
	const row = (label: string, stats: Stats) =>
		h("tr", {}, h("th", { scope: "row" }, label), h("td", {}, `${stats.answers}`), h("td", {}, averageText(stats)), h("td", {}, pitariText(stats)));
	return h(
		"div",
		{ class: "breakdown" },
		h(
			"table",
			{},
			h("thead", {}, h("tr", {}, h("td"), h("th", { scope: "col" }, "回答数"), h("th", { scope: "col" }, "平均点"), h("th", { scope: "col" }, "ピタリ率"))),
			h("tbody", {}, ...(["easy", "normal", "hard"] as const).map((d) => row(SET_THEME_LABELS[d], breakdown.difficulty[d]))),
			h("tbody", {}, ...(["discard", "riichi", "call"] as const).map((k) => row(SET_THEME_LABELS[k], breakdown.kind[k]))),
		),
	);
}

export async function profilePage(root: HTMLElement, publicId: string, app: App): Promise<void> {
	if (publicId === "me") {
		// Replace rather than push, so that "back" does not land on /u/me again.
		publicId = (await ensureSession()).publicId;
		if (location.pathname === "/u/me") history.replaceState(null, "", `/u/${publicId}${location.search}`);
	}
	const misses = new URLSearchParams(location.search).get("history") === "miss";
	// The owner asks with their token and gets live stats and history; others get the aggregated stats.
	const path = `/api/players/${encodeURIComponent(publicId)}${misses ? "?history=miss" : ""}`;
	const profile = currentPublicId() === publicId ? await api<Profile>(path) : await publicApi<Profile>(path);
	const isMe = currentPublicId() === profile.publicId;
	if (misses) saveReview(profile.history.map((item) => item.id));
	const recent = h("ol", { class: "history" });
	for (const item of profile.history) {
		recent.append(
			h(
				"li",
				{},
				h(
					"a",
					{ href: `/q/${item.id}${misses ? "?review" : ""}` },
					markIcon(markOf(item.score, item.pitari), "history__mark", hanamaruFor(profile.publicId, item.id, item.difficulty)),
					h("span", {}, `第${item.id}問（問題集 第${setOf(item.id)}集）`),
					h("strong", {}, `${item.score}点`),
				),
			),
		);
	}
	const historyTabs = h(
		"nav",
		{ class: "tabs", "aria-label": "回答履歴の絞り込み" },
		h("a", { class: misses ? "" : "is-current", href: `/u/${profile.publicId}` }, "すべて"),
		h("a", { class: misses ? "is-current" : "", href: `/u/${profile.publicId}?history=miss` }, "間違い（△・✕）"),
	);
	const share = async () => openShare(await profileCard(profile), "私の成績", `${location.origin}/u/${profile.publicId}`, "mortal-nanikiru-profile.png");
	replace(
		root,
		h(
			"header",
			{ class: "page-head" },
			h("h1", {}, "成績表"),
			h("p", { class: "profile__name" }, displayName(profile.name, profile.publicId)),
			isMe ? nameEditor(profile, app.refresh) : null,
		),
		h("div", { class: "stat-row" }, statBlock("全期間", profile.all), statBlock("今日", profile.today)),
		isMe ? h("div", { class: "result__actions" }, h("button", { class: "ghost-button", type: "button", onclick: share }, "成績を共有")) : null,
		profile.breakdown && profile.all.answers ? h("h2", { class: "section-title" }, "難易度別・種類別の成績") : null,
		profile.breakdown && profile.all.answers ? breakdownTable(profile.breakdown) : null,
		h("h2", { class: "section-title" }, "1日ごとの成績"),
		profile.daily.length ? dailyChart(profile.daily) : h("p", { class: "empty" }, "まだ回答がありません。"),
		isMe ? h("h2", { class: "section-title" }, misses ? "最近の間違い" : "最近の回答") : null,
		isMe ? historyTabs : null,
		isMe ? (profile.history.length ? recent : h("p", { class: "empty" }, misses ? "間違いはありません。" : "まだ回答がありません。")) : null,
		isMe && misses && profile.history.length ? h("p", { class: "note" }, "開いた結果から「次の間違いへ」で順に見直せます。") : null,
		isMe ? null : h("p", { class: "note" }, "成績は10分ごとに更新します。"),
	);
}

function nameEditor(profile: Profile, onSaved: () => void): HTMLElement {
	const input = h("input", { type: "text", value: profile.name ?? "", maxLength: NAME_MAX_LENGTH * 2, placeholder: "ランキングに表示する名前" });
	const message = h("p", { class: "form-message", role: "status" });
	const form = h(
		"form",
		{ class: "name-form" },
		h("label", {}, "名前", input),
		h("button", { class: "ghost-button", type: "submit" }, "保存"),
		message,
	);
	form.addEventListener("submit", async (event) => {
		event.preventDefault();
		try {
			await put<{ name: string | null }>("/api/me/name", { name: input.value });
			onSaved();
		} catch (error) {
			message.textContent = errorMessage(error, "保存できませんでした。");
		}
	});
	return form;
}

// ---- ranking ----

const PERIODS: [RankingPeriod, string][] = [
	["all", "全期間"],
	["today", "今日"],
];
const AXES: [RankingAxis, string][] = [
	["answers", "回答数"],
	["average", "平均点"],
	["pitari", "ピタリ率"],
];

const MEDALS = ["gold", "silver", "bronze"] as const;
const DIFFICULTIES: Difficulty[] = ["easy", "normal", "hard"];

/** The answers by difficulty as one bar; the counts are in the tooltip and for screen readers. */
function mixBar(mix: Record<Difficulty, number>): HTMLElement {
	const total = DIFFICULTIES.reduce((sum, d) => sum + mix[d], 0) || 1;
	const text = DIFFICULTIES.map((d) => `${SET_THEME_LABELS[d]} ${mix[d]}`).join("・");
	return h(
		"span",
		{ class: "ranking__mix", role: "img", title: text, "aria-label": text },
		...DIFFICULTIES.map((d) => h("i", { class: `ranking__mix--${d}`, style: { flexGrow: String(mix[d] / total) } })),
	);
}

export async function rankingPage(root: HTMLElement): Promise<void> {
	const params = new URLSearchParams(location.search);
	const period: RankingPeriod = params.get("period") === "today" ? "today" : "all";
	const axis = (params.get("axis") as RankingAxis) ?? "answers";
	const data = await publicApi<{ entries: RankingEntry[] }>(`/api/ranking?period=${period}${period === "all" ? `&axis=${axis}` : ""}`);
	const format = (entry: RankingEntry) =>
		period === "today" || axis === "average" ? `${entry.value.toFixed(1)}点` : axis === "answers" ? `${entry.value}問` : `${(entry.value * 100).toFixed(1)}%`;
	const tabs = (items: [string, string][], key: string, active: string) =>
		h(
			"nav",
			{ class: "tabs" },
			...items.map(([value, label]) => {
				const next = new URLSearchParams({ period, axis, [key]: value });
				return h("a", { class: value === active ? "is-current" : "", href: `/ranking?${next}` }, label);
			}),
		);
	const me = currentPublicId();
	const table = h("ol", { class: "ranking" });
	for (const entry of data.entries) {
		// The top three (ties included) wear a crown and the title.
		const medal = MEDALS[entry.rank - 1];
		table.append(
			h(
				"li",
				{ class: entry.publicId === me ? "is-me" : "" },
				medal
					? h("span", { class: `ranking__rank ranking__crown ranking__crown--${medal}`, role: "img", "aria-label": `${entry.rank}位` })
					: h("span", { class: "ranking__rank" }, String(entry.rank)),
				h(
					"span",
					{ class: "ranking__who" },
					h("a", { class: "ranking__name", href: `/u/${entry.publicId}` }, displayName(entry.name, entry.publicId)),
					medal ? h("span", { class: `ranking__title ranking__title--${medal}` }, "You are Mortal") : null,
					entry.mix ? mixBar(entry.mix) : null,
				),
				h("span", { class: "ranking__value" }, format(entry)),
				period === "today"
					? h("span", { class: "ranking__answers" }, `ピタリ ${entry.pitari ?? 0}　${entry.completedAt ? jstTime(entry.completedAt) : ""}`)
					: axis === "answers"
						? null
						: h("span", { class: "ranking__answers" }, `${entry.answers}問`),
			),
		);
	}
	const note =
		period === "today"
			? "今日の10問を解き終えた人の得点順です（同点はピタリ数、次に早く終えた順）。"
			: `10分ごとに更新します。${axis === "answers" ? "" : `${RANKING_MIN_ANSWERS}問以上回答したプレイヤーが対象です。`}帯は回答の難易度の内訳（かんたん・ふつう・むずかしい）です。`;
	replace(
		root,
		h("header", { class: "page-head" }, h("h1", {}, "ランキング")),
		tabs(PERIODS, "period", period),
		period === "all" ? tabs(AXES, "axis", axis) : null,
		h("p", { class: "note" }, note),
		period === "today" ? h("p", {}, h("a", { class: "stamp-button", href: "/daily" }, "今日の10問を解く")) : null,
		data.entries.length ? table : h("p", { class: "empty" }, "まだ記録がありません。"),
	);
}

export const meLink = (): string => `/u/${currentPublicId() ?? "me"}`;
