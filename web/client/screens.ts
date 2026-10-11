import { getLocale, t } from "./i18n";
import {
	NAME_MAX_LENGTH,
	RANKING_MIN_ANSWERS,
	SET_THEMES,
	SET_THEME_LABELS,
	type SetTheme,
	displayName as japaneseDisplayName,
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
import { recoveryPanel } from "./recovery";
import { api, currentPublicId, ensureSession, publicApi, put } from "./api";
import { h, replace } from "./dom";
import { errorMessage } from "./errors";
import { dailyChart } from "./chart";
import { hanamaruFor, markIcon } from "./marks";
import { advancePick, loadPick, modeSwitch, pickPath, savePick } from "./picker";
import { showProblem } from "./play";
import { reviewNext, saveReview } from "./review";
import { openShare, profileCard, setCard } from "./share";
import { publicContent } from "../shared/site";

// Repaint cached profile data when changing language, without losing a newly issued code.
const screenLocalizers = new WeakMap<HTMLElement, () => void>();
export function localizeScreen(root: HTMLElement): boolean {
	const render = screenLocalizers.get(root);
	if (!render) return false;
	render();
	return true;
}

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
				h("h2", {}, pick.mode === "order" ? t("番号順に最後まで解きました", "You’ve reached the last problem") : t("全問解きました", "You’ve answered every problem")),
				h("div", { class: "notice__switch" }, modeSwitch()),
				pick.mode === "order"
					? h("button", { class: "stamp-button", type: "button", onclick: restart }, t("最初から", "Start over"))
					: h("p", {}, t("すべての問題に回答済みです。", "You’ve already answered all the problems.")),
			),
		);
		return;
	}
	await showProblem(root, response, {
		from: null,
		get nextLabel() { return t("次の問題へ", "Next problem"); },
		onNext: app.refresh,
		onAnswered: (result) => advancePick(pick, result.id),
		get nextSwitch() { return modeSwitch(); },
	});
}

export async function problemPage(root: HTMLElement, id: number, app: App): Promise<void> {
	const params = new URLSearchParams(location.search);
	const from = params.get("from");
	const response = await api<ProblemResponse>(`/api/problems/${id}${from ? `?from=${encodeURIComponent(from)}` : ""}`);
	if (!params.has("review")) return showProblem(root, response, { from, get nextLabel() { return t("次の問題へ", "Next problem"); }, onNext: () => app.navigate("/"), get nextSwitch() { return modeSwitch(); } });
	// Reviewing misses from the profile: on to the next one in the list, or back to the profile.
	const next = reviewNext(id);
	await showProblem(root, response, {
		from,
		get nextLabel() { return next ? t("次の間違いへ", "Next mistake") : t("成績表へ", "View stats"); },
		onNext: () => app.navigate(next ? `/q/${next}?review` : `${meLink()}?history=miss`),
	});
}

// ---- ten problems: problem sets and today's ten ----

const themeLabel = (theme: SetTheme): string => t(SET_THEME_LABELS[theme], {
 all: "All", easy: "Easy", normal: "Normal", hard: "Hard", discard: "Discard", riichi: "Riichi", call: "Calls",
}[theme]);
const displayName = (name: string | null, publicId: string): string => name ?? t(japaneseDisplayName(name, publicId), `Anonymous#${publicId}`);

const setTitle = (theme: SetTheme, set: number) =>
	theme === "all" ? t(`問題集 第${set}集`, `Problem set ${set}`) : t(`問題集 ${SET_THEME_LABELS[theme]}編 第${set}集`, `${themeLabel(theme)} · Set ${set}`);

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
					h("span", { class: "set-cell__state" }, done ? t(`${(summary.scoreSum / 10).toFixed(1)}点`, `${(summary.scoreSum / 10).toFixed(1)} pts`) : summary ? `${summary.answered}/10` : ""),
				),
			),
		);
	}
	const pages = Math.ceil(data.totalSets / data.setsPerPage);
	const pager = h("nav", { class: "pager", "aria-label": t("ページ", "Pages") });
	if (pages > 1) {
		for (let p = 1; p <= pages; p++) {
			pager.append(h("a", { class: p === data.page ? "is-current" : "", href: `/sets?theme=${theme}&page=${p}` }, t(`${(p - 1) * data.setsPerPage + 1}〜`, `${(p - 1) * data.setsPerPage + 1}+`)));
		}
	}
	const themes = h(
		"nav",
		{ class: "tabs", "aria-label": t("テーマ", "Category") },
		...SET_THEMES.map((key) => h("a", { class: key === theme ? "is-current" : "", href: `/sets?theme=${key}` }, themeLabel(key))),
	);
	// Opening a problem by number belongs with the lists, not on the question page.
	const number = h("input", { type: "number", min: 1, step: 1, inputMode: "numeric", placeholder: t("番号", "Number"), "aria-label": t("問題番号", "Problem number") });
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
		h("span", { class: "set-jump__label" }, t("1問だけ解く", "Open a single problem")),
		h("label", {}, t("第", "Problem "), number, t("問を", "")),
		h("button", { class: "ghost-button ghost-button--small", type: "submit" }, t("開く", "Open")),
	);
	replace(
		root,
		h("header", { class: "page-head" }, h("h1", {}, t("問題集", "Problem sets")), h("p", {}, t("10問ずつの問題集です。10問そろうと合計点（100点満点）が出ます。", "Each set has 10 problems. Complete a set to see your overall score out of 100.")), jump),
		themes,
		pager,
		data.totalSets ? grid : h("p", { class: "empty" }, t("このテーマの問題集はまだありません。", "There are no problem sets in this category yet.")),
	);
}

export async function setPlay(root: HTMLElement, theme: SetTheme, set: number, app: App): Promise<void> {
	const data = await api<{ set: number; problems: SetProblem[]; playerName: string }>(`/api/sets/${theme}/${set}`);
	const title = () => setTitle(theme, set);
	await playTen(root, app, title, data.problems, {
		get lastLabel() { return t("問題集の結果へ", "View set results"); },
		summary: {
			get title() { return title(); },
			problems: data.problems,
			playerName: data.playerName,
			shareUrl: `${location.origin}/sets/${theme}/${set}`,
			shareFile: `mortal-nanikiru-${theme}-${set}.png`,
			next: { get label() { return t("次の問題集へ", "Next set"); }, href: `/sets/${theme}/${set + 1}` },
		},
	});
}

/** "10月2日" from a Japan date "2026-10-02". */
const dateLabel = (day: string) => t(`${Number(day.slice(5, 7))}月${Number(day.slice(8, 10))}日`, new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`)));

/** "12:34" in Japan time. */
const jstTime = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString().slice(11, 16);

export async function dailyPlay(root: HTMLElement, app: App): Promise<void> {
	const data = await api<DailySet>("/api/daily");
	const title = () => t(`今日の10問（${dateLabel(data.day)}）`, `Today’s 10 (${dateLabel(data.day)})`);
	await playTen(root, app, title, data.problems, {
		get lastLabel() { return t("今日の結果へ", "View today’s results"); },
		summary: {
			get title() { return title(); },
			problems: data.problems,
			playerName: data.playerName,
			shareUrl: `${location.origin}/daily`,
			shareFile: `mortal-nanikiru-daily-${data.day}.png`,
			next: { get label() { return t("今日のランキングへ", "Today’s leaderboard"); }, href: "/ranking?period=today" },
			get note() { return data.result ? t(`${jstTime(data.result.completedAt)} に完了。今日のランキングに載ります。`, `Completed at ${jstTime(data.result.completedAt)} JST. Your score appears on today’s leaderboard.`) : null; },
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
async function playTen(root: HTMLElement, app: App, title: () => string, problems: SetProblem[], options: { lastLabel: string; summary: TenSummary }): Promise<void> {
	// A delayed response of a page we left must not change the player's assignment.
	if (!root.isConnected) return;
	const next = problems.find((p) => !p.answer);
	if (!next) return tenSummary(root, options.summary, app);
	const position = problems.indexOf(next) + 1;
	const remaining = problems.filter((p) => !p.answer).length;
	const response = await api<ProblemResponse>(`/api/problems/${next.id}`);
	await showProblem(root, response, {
		from: null,
		get progress() { return `${title()} ${position}/10`; },
		get nextLabel() { return remaining > 1 ? t("次の問題へ", "Next problem") : options.lastLabel; },
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
				h("a", { href: `/q/${problem.id}` }, icon, h("span", {}, t(`第${problem.id}問`, `Problem ${problem.id}`)), h("strong", {}, t(`${problem.answer?.score ?? 0}点`, `${problem.answer?.score ?? 0} pts`))),
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
			h("p", { class: "set-summary__score" }, total.toFixed(1), h("small", {}, t("点", " pts"))),
			h("p", { class: "set-summary__pitari" }, t(`ピタリ ${pitari} / 10`, `Perfect matches ${pitari} / 10`)),
			summary.note ? h("p", { class: "note" }, summary.note) : null,
			list,
			h(
				"div",
				{ class: "result__actions" },
				h("button", { class: "ghost-button", type: "button", onclick: share }, t("結果を共有", "Share results")),
				h("button", { class: "stamp-button", type: "button", onclick: () => app.navigate(summary.next.href) }, summary.next.label),
			),
		),
	);
}

// ---- rules ----

export function rulesPage(root: HTMLElement): Promise<void> {
	root.innerHTML = publicContent("/rules", getLocale());
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
			h("dt", {}, t("回答数", "Answers")),
			h("dd", {}, `${stats.answers}`),
			h("dt", {}, t("平均点", "Average score")),
			h("dd", {}, average),
			h("dt", {}, t("ピタリ率", "Perfect match rate")),
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
			h("thead", {}, h("tr", {}, h("td"), h("th", { scope: "col" }, t("回答数", "Answers")), h("th", { scope: "col" }, t("平均点", "Average score")), h("th", { scope: "col" }, t("ピタリ率", "Perfect match rate")))),
			h("tbody", {}, ...(["easy", "normal", "hard"] as const).map((d) => row(themeLabel(d), breakdown.difficulty[d]))),
			h("tbody", {}, ...(["discard", "riichi", "call"] as const).map((k) => row(themeLabel(k), breakdown.kind[k]))),
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
	const draw = () => {
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
						h("span", {}, t(`第${item.id}問（問題集 第${setOf(item.id)}集）`, `Problem ${item.id} (Set ${setOf(item.id)})`)),
						h("strong", {}, t(`${item.score}点`, `${item.score} pts`)),
					),
				),
			);
		}
		const historyTabs = h(
			"nav",
			{ class: "tabs", "aria-label": t("回答履歴の絞り込み", "Filter answer history") },
			h("a", { class: misses ? "" : "is-current", href: `/u/${profile.publicId}` }, t("すべて", "All")),
			h("a", { class: misses ? "is-current" : "", href: `/u/${profile.publicId}?history=miss` }, t("間違い（△・✕）", "Mistakes (△ / ✕)")),
		);
		const share = async () => openShare(await profileCard(profile), t("私の成績", "My stats"), `${location.origin}/u/${profile.publicId}`, "mortal-nanikiru-profile.png");
		replace(
			root,
			h(
				"header",
				{ class: "page-head" },
				h("h1", {}, t("成績表", "Stats")),
				h("p", { class: "profile__name" }, displayName(profile.name, profile.publicId)),
				isMe ? nameEditor(profile, app.refresh) : null,
			),
			h("div", { class: "stat-row" }, statBlock(t("全期間", "All time"), profile.all), statBlock(t("今日", "Today"), profile.today)),
			isMe ? h("div", { class: "result__actions" }, h("button", { class: "ghost-button", type: "button", onclick: share }, t("成績を共有", "Share stats"))) : null,
			isMe ? recoveryPanel(profile.recoveryEnabled ?? false) : null,
			profile.breakdown && profile.all.answers ? h("h2", { class: "section-title" }, t("難易度別・種類別の成績", "Stats by difficulty and type")) : null,
			profile.breakdown && profile.all.answers ? breakdownTable(profile.breakdown) : null,
			h("h2", { class: "section-title" }, t("1日ごとの成績", "Daily stats")),
			profile.daily.length ? dailyChart(profile.daily) : h("p", { class: "empty" }, t("まだ回答がありません。", "No answers yet.")),
			isMe ? h("h2", { class: "section-title" }, misses ? t("最近の間違い", "Recent mistakes") : t("最近の回答", "Recent answers")) : null,
			isMe ? historyTabs : null,
			isMe ? (profile.history.length ? recent : h("p", { class: "empty" }, misses ? t("間違いはありません。", "No mistakes to review.") : t("まだ回答がありません。", "No answers yet."))) : null,
			isMe && misses && profile.history.length ? h("p", { class: "note" }, t("開いた結果から「次の間違いへ」で順に見直せます。", "Open a result, then choose “Next mistake” to work through your review.")) : null,
			isMe ? null : h("p", { class: "note" }, t("成績は10分ごとに更新します。", "Stats update every 10 minutes.")),
		);
	};
	screenLocalizers.set(root, draw);
	draw();
}

function nameEditor(profile: Profile, onSaved: () => void): HTMLElement {
	const input = h("input", { type: "text", value: profile.name ?? "", maxLength: NAME_MAX_LENGTH * 2, placeholder: t("ランキングに表示する名前", "Name shown on the leaderboard") });
	const message = h("p", { class: "form-message", role: "status" });
	const form = h(
		"form",
		{ class: "name-form" },
		h("label", {}, t("名前", "Name"), input),
		h("button", { class: "ghost-button", type: "submit" }, t("保存", "Save")),
		message,
	);
	form.addEventListener("submit", async (event) => {
		event.preventDefault();
		try {
			await put<{ name: string | null }>("/api/me/name", { name: input.value });
			onSaved();
		} catch (error) {
			message.textContent = errorMessage(error, t("保存できませんでした。", "Couldn’t save your changes."));
		}
	});
	return form;
}

// ---- ranking ----

const periods = (): [RankingPeriod, string][] => [
	["all", t("全期間", "All time")],
	["today", t("今日", "Today")],
];
const axes = (): [RankingAxis, string][] => [
	["answers", t("回答数", "Answers")],
	["average", t("平均点", "Average score")],
	["pitari", t("ピタリ率", "Perfect match rate")],
];

const MEDALS = ["gold", "silver", "bronze"] as const;
const DIFFICULTIES: Difficulty[] = ["easy", "normal", "hard"];

/** The answers by difficulty as one bar; the counts are in the tooltip and for screen readers. */
function mixBar(mix: Record<Difficulty, number>): HTMLElement {
	const total = DIFFICULTIES.reduce((sum, d) => sum + mix[d], 0) || 1;
	const text = DIFFICULTIES.map((d) => `${themeLabel(d)} ${mix[d]}`).join(t("・", " / "));
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
		period === "today" || axis === "average" ? t(`${entry.value.toFixed(1)}点`, `${entry.value.toFixed(1)} pts`) : axis === "answers" ? t(`${entry.value}問`, `${entry.value} answers`) : `${(entry.value * 100).toFixed(1)}%`;
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
					? h("span", { class: `ranking__rank ranking__crown ranking__crown--${medal}`, role: "img", "aria-label": t(`${entry.rank}位`, `Rank ${entry.rank}`) })
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
					? h("span", { class: "ranking__answers" }, t(`ピタリ ${entry.pitari ?? 0}　${entry.completedAt ? jstTime(entry.completedAt) : ""}`, `Perfect matches ${entry.pitari ?? 0} · ${entry.completedAt ? `${jstTime(entry.completedAt)} JST` : ""}`))
					: axis === "answers"
						? null
						: h("span", { class: "ranking__answers" }, t(`${entry.answers}問`, `${entry.answers} answers`)),
			),
		);
	}
	const note =
		period === "today"
			? t("今日の10問を解き終えた人の得点順です（同点はピタリ数、次に早く終えた順）。", "Ranked by score on today’s 10 problems. Ties are broken by perfect matches, then by who finished first.")
			: t(`10分ごとに更新します。${axis === "answers" ? "" : `${RANKING_MIN_ANSWERS}問以上回答したプレイヤーが対象です。`}帯は回答の難易度の内訳（かんたん・ふつう・むずかしい）です。`, `Updated every 10 minutes. ${axis === "answers" ? "" : `Players need at least ${RANKING_MIN_ANSWERS} answers to qualify. `}The bar shows the breakdown by difficulty: easy, normal and hard.`);
	replace(
		root,
		h("header", { class: "page-head" }, h("h1", {}, t("ランキング", "Leaderboard"))),
		tabs(periods(), "period", period),
		period === "all" ? tabs(axes(), "axis", axis) : null,
		h("p", { class: "note" }, note),
		period === "today" ? h("p", {}, h("a", { class: "stamp-button", href: "/daily" }, t("今日の10問を解く", "Play today’s 10"))) : null,
		data.entries.length ? table : h("p", { class: "empty" }, t("まだ記録がありません。", "No results yet.")),
	);
}

export const meLink = (): string => `/u/${currentPublicId() ?? "me"}`;
