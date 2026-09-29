import {
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
import { markIcon } from "./marks";
import { showProblem } from "./play";
import { HASHTAG, SITE_NAME, openShare, profileCard, setCard } from "./share";

/** Navigation shared by the screens. */
export interface App {
	navigate(path: string): void;
	/** Render the current URL again (e.g. the next problem). */
	refresh(): void;
}

// ---- free play and shared links ----

export async function freePlay(root: HTMLElement, app: App): Promise<void> {
	const response = await api<ProblemResponse>("/api/problems/current");
	await showProblem(root, response, { from: null, nextLabel: "次の問題へ", onNext: app.refresh });
}

export async function problemPage(root: HTMLElement, id: number, app: App): Promise<void> {
	const from = new URLSearchParams(location.search).get("from");
	const response = await api<ProblemResponse>(`/api/problems/${id}${from ? `?from=${encodeURIComponent(from)}` : ""}`);
	await showProblem(root, response, { from, nextLabel: "次の問題へ", onNext: () => app.navigate("/") });
}

// ---- problem sets ----

const setTitle = (theme: SetTheme, set: number) =>
	theme === "all" ? `問題集 第${set}集` : `問題集 ${SET_THEME_LABELS[theme]}編 第${set}集`;

export async function setList(root: HTMLElement, theme: SetTheme, page: number): Promise<void> {
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
	replace(
		root,
		h("header", { class: "page-head" }, h("h1", {}, "問題集"), h("p", {}, "10問ずつの問題集です。10問そろうと合計点（100点満点）が出ます。")),
		themes,
		h(
			"section",
			{ class: "assort", "aria-label": "アソート問題集" },
			h("h2", {}, "アソート問題集", h("span", { class: "assort__badge" }, "工事中")),
			h("p", {}, "難易度や種類を組み合わせて、自分だけの問題集を作れる機能を準備しています。"),
		),
		pager,
		data.totalSets ? grid : h("p", { class: "empty" }, "このテーマの問題集はまだありません。"),
	);
}

export async function setPlay(root: HTMLElement, theme: SetTheme, set: number, app: App): Promise<void> {
	const data = await api<{ set: number; problems: SetProblem[] }>(`/api/sets/${theme}/${set}`);
	const next = data.problems.find((p) => !p.answer);
	if (!next) return setSummary(root, theme, set, data.problems, app);
	const position = data.problems.indexOf(next) + 1;
	const remaining = data.problems.filter((p) => !p.answer).length;
	const response = await api<ProblemResponse>(`/api/problems/${next.id}`);
	await showProblem(root, response, {
		from: null,
		progress: `${setTitle(theme, set)} ${position}/10`,
		nextLabel: remaining > 1 ? "次の問題へ" : "問題集の結果へ",
		onNext: app.refresh,
	});
}

function setSummary(root: HTMLElement, theme: SetTheme, set: number, problems: SetProblem[], app: App): void {
	const total = problems.reduce((sum, p) => sum + (p.answer?.score ?? 0), 0) / problems.length;
	const pitari = problems.filter((p) => p.answer?.pitari).length;
	const title = setTitle(theme, set);
	const list = h("ol", { class: "set-result" });
	for (const problem of problems) {
		const icon = problem.answer ? markIcon(markOf(problem.answer.score, problem.answer.pitari), "set-result__mark") : null;
		list.append(
			h(
				"li",
				{},
				h("a", { href: `/q/${problem.id}` }, icon, h("span", {}, `第${problem.id}問`), h("strong", {}, `${problem.answer?.score ?? 0}点`)),
			),
		);
	}
	const share = async () => {
		const text = `${SITE_NAME} ${title} ${total.toFixed(1)}点（ピタリ${pitari}/10）\n同じ10問に挑戦してみて ${HASHTAG}`;
		await openShare(await setCard(title, problems), text, `${location.origin}/sets/${theme}/${set}`, `mortal-nanikiru-${theme}-${set}.png`);
	};
	replace(
		root,
		h(
			"section",
			{ class: "set-summary" },
			h("p", { class: "set-summary__title" }, title),
			h("p", { class: "set-summary__score" }, total.toFixed(1), h("small", {}, "点")),
			h("p", { class: "set-summary__pitari" }, `ピタリ ${pitari} / 10`),
			list,
			h(
				"div",
				{ class: "result__actions" },
				h("button", { class: "ghost-button", type: "button", onclick: share }, "結果を共有"),
				h("button", { class: "stamp-button", type: "button", onclick: () => app.navigate(`/sets/${theme}/${set + 1}`) }, "次の問題集へ"),
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
			"問題の出どころ",
			"問題はすべて、麻雀AI Mortal同士が4人で打った対局の一場面です。対戦相手の3人も全員Mortalで、全員が強豪です。",
			"あなたは4人のうち1人の席から局面を見て、その席の判断（何を切るか・鳴くか）を答えます。",
			"評価モデルは第三者が配布するMortal用の重み mortal-298k で、公式モデルではありません。",
		),
		section(
			"対局ルール（天鳳の段位戦に準拠）",
			"四人麻雀の東南戦（半荘戦）。持ち点25,000点で、オーラスで30,000点に誰も届かなければ西入します。",
			"赤ドラあり（5萬・5筒・5索に各1枚）。喰いタン・後付けあり。一発・裏ドラ・槓ドラあり。",
			"途中流局あり（九種九牌・四風連打・四家立直・四槓散了）。持ち点がマイナスになると終了（トビ）。",
			"天鳳と違い、3人が同時にロンしても流局になりません（Mortalの対局エンジンの仕様）。",
		),
		section(
			"採点",
			"AI（mortal-298k）は候補ごとに評価（%）を出します。得点は「あなたの手の評価 ÷ 最善手の評価 × 100」です。",
			"最善手と一致すると「ピタリ」（100点・花丸）。70〜99点は○、30〜69点は△、29点以下は✕です。",
			"難易度はAIが最善手をどれだけ確信しているかで分けます（打牌はかんたん90%以上／ふつう50%以上／むずかしい50%未満。鳴きはそれに近い割合になる基準）。98%以上の自明な局面は出題しません。",
		),
	);
	return Promise.resolve();
}

// ---- profile ----

function statBlock(label: string, stats: Stats): HTMLElement {
	const average = stats.answers ? (stats.scoreSum / stats.answers).toFixed(1) : "—";
	const pitari = stats.answers ? `${((stats.pitari / stats.answers) * 100).toFixed(1)}%` : "—";
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

export async function profilePage(root: HTMLElement, publicId: string, app: App): Promise<void> {
	if (publicId === "me") {
		// Replace rather than push, so that "back" does not land on /u/me again.
		publicId = (await ensureSession()).publicId;
		if (location.pathname === "/u/me") history.replaceState(null, "", `/u/${publicId}`);
	}
	// The owner asks with their token and gets live stats and history; others get the aggregated stats.
	const path = `/api/players/${encodeURIComponent(publicId)}`;
	const profile = currentPublicId() === publicId ? await api<Profile>(path) : await publicApi<Profile>(path);
	const isMe = currentPublicId() === profile.publicId;
	const recent = h("ol", { class: "history" });
	for (const item of profile.history) {
		recent.append(
			h("li", {}, h("a", { href: `/q/${item.id}` }, markIcon(markOf(item.score, item.pitari), "history__mark"), h("span", {}, `第${item.id}問（問題集 第${setOf(item.id)}集）`), h("strong", {}, `${item.score}点`))),
		);
	}
	const share = async () => {
		const average = profile.all.answers ? (profile.all.scoreSum / profile.all.answers).toFixed(1) : "0";
		const text = `${SITE_NAME} 成績：${profile.all.answers}問 平均${average}点 ピタリ${profile.all.pitari}回 ${HASHTAG}`;
		await openShare(await profileCard(profile), text, `${location.origin}/u/${profile.publicId}`, "mortal-nanikiru-profile.png");
	};
	replace(root, 
		h(
			"header",
			{ class: "page-head" },
			h("h1", {}, "成績表"),
			h("p", { class: "profile__name" }, displayName(profile.name, profile.publicId)),
			isMe ? nameEditor(profile, app.refresh) : null,
		),
		h("div", { class: "stat-row" }, statBlock("全期間", profile.all), statBlock("今日", profile.today)),
		isMe ? h("div", { class: "result__actions" }, h("button", { class: "ghost-button", type: "button", onclick: share }, "成績を共有")) : null,
		isMe ? h("h2", { class: "section-title" }, "最近の回答") : null,
		isMe ? (profile.history.length ? recent : h("p", { class: "empty" }, "まだ回答がありません。")) : null,
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

export async function rankingPage(root: HTMLElement): Promise<void> {
	const params = new URLSearchParams(location.search);
	const period = (params.get("period") as RankingPeriod) ?? "all";
	const axis = (params.get("axis") as RankingAxis) ?? "answers";
	const data = await publicApi<{ entries: RankingEntry[] }>(`/api/ranking?period=${period}&axis=${axis}`);
	const format = (entry: RankingEntry) =>
		axis === "answers" ? `${entry.value}問` : axis === "average" ? `${entry.value.toFixed(1)}点` : `${(entry.value * 100).toFixed(1)}%`;
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
		table.append(
			h(
				"li",
				{ class: entry.publicId === me ? "is-me" : "" },
				h("span", { class: "ranking__rank" }, String(entry.rank)),
				h("a", { class: "ranking__name", href: `/u/${entry.publicId}` }, displayName(entry.name, entry.publicId)),
				h("span", { class: "ranking__value" }, format(entry)),
				axis === "answers" ? null : h("span", { class: "ranking__answers" }, `${entry.answers}問`),
			),
		);
	}
	const minimum = RANKING_MIN_ANSWERS[period];
	replace(root, 
		h("header", { class: "page-head" }, h("h1", {}, "ランキング")),
		tabs(PERIODS, "period", period),
		tabs(AXES, "axis", axis),
		h("p", { class: "note" }, `10分ごとに更新します。${axis === "answers" ? "" : `${minimum}問以上回答したプレイヤーが対象です。`}`),
		data.entries.length ? table : h("p", { class: "empty" }, "まだ記録がありません。"),
	);
}

export const meLink = (): string => `/u/${currentPublicId() ?? "me"}`;
