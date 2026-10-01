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
}

export type ProblemResponse =
	| { state: "question"; question: Question }
	| { state: "result"; result: Result }
	/** Another problem is assigned and must be answered first. */
	| { state: "locked"; currentId: number }
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

export interface Profile {
	publicId: string;
	name: string | null;
	all: Stats;
	today: Stats;
	/** Days with answers, oldest first: the latest DAILY_CHART_DAYS of them. */
	daily: DailyStats[];
	history: { id: number; difficulty: Difficulty | null; score: number; pitari: boolean; answeredAt: string }[];
}

export type RankingPeriod = "all" | "today";
export type RankingAxis = "answers" | "average" | "pitari";

export interface RankingEntry {
	rank: number;
	publicId: string;
	name: string | null;
	answers: number;
	/** answers, average score (0-100) or pitari rate (0-1), by axis. */
	value: number;
}
