// Problem data (generator/extract.py) and API payloads shared by the Worker and the client.

/** Tile in mjai notation: "1m".."9s", "5mr" (red five), "E" "S" "W" "N" "P" "F" "C". */
export type Pai = string;

export interface RiverTile {
	pai: Pai;
	tsumogiri: boolean;
	/** Riichi declaration tile (drawn sideways). */
	riichi: boolean;
	/** Taken by another player's call. */
	called: boolean;
}

export interface Meld {
	type: "chi" | "pon" | "daiminkan" | "ankan" | "kakan";
	/** Called tile (absent for ankan). */
	pai?: Pai;
	consumed: Pai[];
	/** Absolute seat the called tile came from. */
	target?: number;
	/** Tile added by kakan. */
	added?: Pai;
}

/** What the answering seat can see. Seats are absolute (0-3). */
export interface Scene {
	seat: number;
	bakaze: "E" | "S" | "W" | "N";
	kyoku: number;
	honba: number;
	kyotaku: number;
	oya: number;
	scores: number[];
	doraMarkers: Pai[];
	tilesLeft: number;
	rivers: RiverTile[][];
	melds: Meld[][];
	riichi: boolean[];
	concealedCounts: number[];
	/** Sorted concealed hand, without the drawn tile. */
	hand: Pai[];
	drawn: Pai | null;
	/** The discard a call problem asks about. */
	target: { actor: number; pai: Pai } | null;
}

export type ProblemKind = "discard" | "riichi" | "call";
export type Difficulty = "easy" | "normal" | "hard";

/**
 * Action ids: "d:<pai>" dama discard, "r:<pai>" riichi with that discard,
 * "chi_low" | "chi_mid" | "chi_high" | "pon" | "pass".
 */
export interface Choice {
	action: string;
	/** Tiles taken from the hand by chi/pon. */
	consumed?: Pai[];
}

export interface Candidate {
	action: string;
	q: number;
	/** AI evaluation (softmax of Q / T), 0-1. */
	p: number;
	score: number;
}

export interface Evaluation {
	best: string;
	candidates: Candidate[];
}

export interface Question {
	id: number;
	kind: ProblemKind;
	scene: Scene;
	choices: Choice[];
}

export interface AnswerResult {
	action: string;
	score: number;
	pitari: boolean;
}

export interface Result extends Question {
	difficulty: Difficulty;
	answer: AnswerResult;
	evaluation: Evaluation;
	/** Players' average score, shown once enough players answered. */
	human: { answers: number; average: number } | null;
	/** The answer of the player who shared the link, when requested. */
	sharer: (AnswerResult & { name: string }) | null;
	/** The answering player's display name, for their share image. */
	playerName: string;
}

export type ProblemResponse =
	| { state: "question"; question: Question }
	| { state: "result"; result: Result }
	/** No unanswered problem is left (in the theme, or after the given number). */
	| { state: "finished" };

export interface Stats {
	answers: number;
	scoreSum: number;
	pitari: number;
}

export interface Session {
	token: string;
	publicId: string;
}

export interface Me {
	publicId: string;
	name: string | null;
	all: Stats;
	today: Stats;
}

export interface SetProblem {
	id: number;
	difficulty: Difficulty;
	answer: AnswerResult | null;
}

export interface SetSummary {
	set: number;
	answered: number;
	scoreSum: number;
	pitari: number;
}

export interface DailyStats extends Stats {
	/** Japan date, YYYY-MM-DD. */
	date: string;
}

/** Today's ten: the same ten problems for everyone on a Japan date. */
export interface DailySet {
	day: string;
	problems: SetProblem[];
	/** Recorded once all ten are answered; the day's ranking is built from these. */
	result: { scoreSum: number; pitari: number; completedAt: string } | null;
	playerName: string;
}

/** Answers by problem kind and by difficulty; each answer counts once in each. */
export interface Breakdown {
	kind: Record<ProblemKind, Stats>;
	difficulty: Record<Difficulty, Stats>;
}

export interface Profile {
	publicId: string;
	name: string | null;
	all: Stats;
	today: Stats;
	/** Days with answers, oldest first: the latest DAILY_CHART_DAYS of them. */
	daily: DailyStats[];
	/** The owner only, by the problems' current kind and difficulty. */
	breakdown: Breakdown | null;
	history: { id: number; difficulty: Difficulty | null; score: number; pitari: boolean; answeredAt: string }[];
}

export type RankingPeriod = "all" | "today";
export type RankingAxis = "answers" | "average" | "pitari";

export interface RankingEntry {
	rank: number;
	publicId: string;
	name: string | null;
	answers: number;
	/** All time: answers, average score (0-100) or pitari rate (0-1), by axis. Today: today's ten score (0-100). */
	value: number;
	/** All time: the player's answers by difficulty (the mix bar). */
	mix: Record<Difficulty, number> | null;
	/** Today only. */
	pitari?: number;
	completedAt?: string;
}
