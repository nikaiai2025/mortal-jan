// Rules shared by the Worker and the client (docs/spec/プロダクト仕様.md).

export const SET_SIZE = 10;
export const NAME_MAX_LENGTH = 12;
/** Minimum answers to appear in the average / pitari rankings. */
export const RANKING_MIN_ANSWERS = { all: 50, today: 10 } as const;
/** Answers one player can save per JST day (protects the D1 write quota). */
export const DAILY_ANSWER_LIMIT = 300;
/** Minimum answers before a problem's players' average is shown. */
export const HUMAN_STATS_MIN_ANSWERS = 10;

export const setOf = (problemId: number): number => Math.ceil(problemId / SET_SIZE);

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
