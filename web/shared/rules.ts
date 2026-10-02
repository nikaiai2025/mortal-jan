// Rules shared by the Worker and the client (docs/spec/プロダクト仕様.md).

export const SET_SIZE = 10;
export const NAME_MAX_LENGTH = 12;
/** Minimum answers to appear in the all-time average / pitari rankings (today's ranking is today's ten). */
export const RANKING_MIN_ANSWERS = 50;
/** Answers one player can save per JST day (protects the D1 write quota). */
export const DAILY_ANSWER_LIMIT = 1000;
/** Days shown in the daily results chart (days with answers only). */
export const DAILY_CHART_DAYS = 30;
/** Minimum answers before a problem's players' average is shown. */
export const HUMAN_STATS_MIN_ANSWERS = 10;

/** Problem set themes: all problems, one difficulty, or one kind. */
export const SET_THEMES = ["all", "easy", "normal", "hard", "discard", "riichi", "call"] as const;
export type SetTheme = (typeof SET_THEMES)[number];
export const SET_THEME_LABELS: Record<SetTheme, string> = {
	all: "全問",
	easy: "かんたん",
	normal: "ふつう",
	hard: "むずかしい",
	discard: "打牌",
	riichi: "リーチ",
	call: "鳴き",
};

/** Set number of the n-th problem of a theme (1-based). */
export const setOf = (position: number): number => Math.ceil(position / SET_SIZE);

export const setProblemIds = (set: number): number[] =>
	Array.from({ length: SET_SIZE }, (_, i) => (set - 1) * SET_SIZE + i + 1);

/** Japan Standard Time date "YYYY-MM-DD" used for the daily ranking. */
export function jstDate(now: Date): string {
	return new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}

export const displayName = (name: string | null, publicId: string): string => name ?? `名無し#${publicId}`;

/** Red-pen mark for a score (回答後の演出). */
export type Mark = "hanamaru" | "maru" | "sankaku" | "batsu";

export function markOf(score: number, pitari: boolean): Mark {
	if (pitari) return "hanamaru";
	if (score >= 70) return "maru";
	if (score >= 30) return "sankaku";
	return "batsu";
}

/** A miss (△ or ✕): what the review list collects. */
export function isMiss(score: number, pitari: boolean): boolean {
	const mark = markOf(score, pitari);
	return mark === "sankaku" || mark === "batsu";
}

/** How the next problem on the question page is chosen. */
export type PickMode = "random" | "order";
